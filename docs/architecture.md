# Architecture

INRENT is a TypeScript monorepo (pnpm workspaces + Turborepo) with three deployable services that share domain packages and one PostgreSQL database.

## Services

| Service                      | Runtime                           | Responsibility                                                                                                                                                                             |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **gateway** (`apps/gateway`) | Node 22, Hono                     | The public `/v1` API. Authenticates keys, enforces limits, routes to providers with fallback, streams responses, records usage and charges the ledger. Stateless; scales horizontally.     |
| **web** (`apps/web`)         | Next.js 16 (App Router, React 19) | Marketing site, model catalog, documentation, authentication (Better Auth), customer dashboard, admin console, payment webhooks, data export.                                              |
| **worker** (`apps/worker`)   | Node 22, BullMQ                   | Webhook delivery with retries, usage rollups, provider health checks, auto-recharge, retention and FinOps alerts. Recurring jobs use idempotent schedulers, so multiple replicas are safe. |

## Shared packages

```text
packages/core           pure logic, no I/O: money, pricing, routing, policy, rate limiting, RBAC, errors,
                        request schemas, OpenAPI, crypto (keys, envelopes, signatures, SSRF guard)
packages/db             Prisma schema, migrations, seed and provider/model/plan catalog
packages/providers      upstream adapters behind a ProviderAdapter interface; GPUProvider interface
packages/services       business logic over the database (used by all three services)
packages/observability  pino logging with redaction, error reporting, OpenTelemetry
packages/sdk, cli       client tooling (published separately)
```

`core` has no I/O and is unit-tested exhaustively. Anything that touches money, routing or policy is a pure function there, and the services call it.

## Data model (main entities)

- **Identity & tenancy:** `User` (platform role) → `Membership` (org role: owner, admin, developer, billing, viewer) → `Organization` (plan, privacy, routing and spend settings) → `Project` (budget, model allowlist) → `ApiKey` (hash only, environment, permissions, limits, expiry).
- **Catalog:** `Provider` (adapter, base URL, credential _reference_, integration mode, resale verification, health) ↔ `ModelProvider` endpoints ↔ `Model` (capabilities, license, commercial/resale flags, verification status). `ModelPrice` rows are versioned and record their source.
- **Usage & money:** `Request` (one row per API call: routing attempts, tokens, cost, latency, optional payloads), `CreditBalance`, `CreditTransaction` (append-only ledger with unique idempotency keys), `SpendCounter` (per org/project month, per key lifetime), `Payment` and `PaymentEvent` (provider event dedupe), `Invoice`, `UsageDaily` rollups.
- **Integrations:** `ByokCredential` (encrypted), `Webhook` + `WebhookDelivery`, `McpServer` + `McpTool` (preview), `Agent` + `AgentVersion` (preview).
- **Operations:** `AuditLog`, `FeatureFlag`, `Notification`, `SupportTicket`, `Incident`, `WaitlistEntry`, `Gpu*` (roadmap).

## Request lifecycle (gateway)

1. **Request ID and IP limits.** Every request gets a `req_…` ID (returned in `x-request-id`). Unauthenticated traffic is limited per IP.
2. **Authentication.** `Authorization: Bearer sk-inrent-<env>-…`. The key is HMAC-hashed with a server pepper and looked up. Results are cached in Redis for 60 s (negative results for 15 s). Revoked, expired and suspended-org keys are rejected. The dashboard playground uses a short-lived HMAC-signed internal assertion instead of a key, so the browser never holds an API key.
3. **Rate limits.** Sliding-window counters in Redis (a Lua script) for requests and tokens per minute, per key and per organization. Responses carry `x-ratelimit-*` headers, and 429s carry `retry-after`.
4. **Validation.** The body is validated with zod schemas that mirror the OpenAI API, plus the optional `inrent` routing extension.
5. **Catalog and policy.** The serving catalog (cached about 10 s) gives each endpoint's eligibility. `evaluateServing` decides whether it may be served with platform funds or only with the customer's BYOK key (see [provider-routing.md](provider-routing.md)).
6. **Routing.** `rankCandidates` scores eligible endpoints by policy and filters on required capabilities, context length, health and the per-instance circuit breaker. Up to 3 attempts by default.
7. **Pre-flight.** For platform-funded candidates, the balance must cover the _maximum_ possible charge (input estimate + `max_tokens` × output price), and key, project and organization budgets must not be exceeded. If platform funding isn't possible, BYOK candidates can still serve.
8. **Execution with fallback.** Retryable upstream failures (timeouts, 429, 5xx, network errors) before the first byte move on to the next candidate. After the first streamed byte there's no fallback (it would duplicate output). A mid-stream failure is reported in-band as an `error` event.
9. **Finalization.** The `Request` row and the ledger charge are written in **one transaction**, idempotent on the request ID. Spend counters update in the same transaction. Metrics, low-balance checks and webhooks are dispatched asynchronously via BullMQ.

## Billing consistency

- Integer nano-USD everywhere (1 USD = 10⁹ nano). Prices are USD per 1M tokens (`Decimal`), converted exactly to pico-USD per token. Charges round **up** to the nano.
- Balance updates use `UPDATE … RETURNING` on the balance row, which serializes concurrent writers. The ledger's unique `idempotencyKey` prevents double application.
- Payment webhooks are verified, deduplicated by provider event ID in the same transaction as the credit grant, and grants are idempotent per payment.

See [billing.md](billing.md).

## Caching and state

| Data                 | Where          | TTL / invalidation                                                      |
| -------------------- | -------------- | ----------------------------------------------------------------------- |
| API key auth context | Redis          | 60 s (15 s negative). Revocation also clears the cache entry            |
| Serving catalog      | gateway memory | about 10 s (`GATEWAY_CATALOG_TTL_MS`)                                   |
| Feature flags        | process memory | 15 s, invalidated on change in the same process                         |
| Circuit breaker      | gateway memory | per instance; opens after repeated failures, then half-opens after 30 s |
| Rate-limit windows   | Redis          | sliding window                                                          |

## Observability

- **Logs:** JSON (pino) with automatic redaction of authorization headers, keys, secrets and payload fields. Every log line carries the request ID.
- **Metrics:** Prometheus `/metrics` on the gateway (requests, latency, TTFT, tokens, provider errors, fallbacks, revenue, provider cost, rate limits, auth failures). Example Grafana dashboard and alert rules are in `infrastructure/`.
- **Traces:** OpenTelemetry (OTLP) when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- **Errors:** Sentry-compatible reporting when `SENTRY_DSN` is set.
- **Product analytics:** usage dashboards come from the `Request` table and `UsageDaily` rollups.

## Scaling notes

- The gateway is stateless apart from per-instance circuit state, so scale it horizontally behind a load balancer with response buffering disabled.
- PostgreSQL write volume is one `Request` row plus one ledger row per billed call. For very high volume, partition `Request` by month and move analytics to rollups or a columnar store. `UsageDaily` already exists for long-range queries.
- Redis must use `maxmemory-policy noeviction` because of BullMQ.
