# INRENT

**One OpenAI-compatible API for many AI models**, with routing, automatic fallback, bring-your-own-key, prepaid usage billing, per-request logs, and a developer dashboard. GPU Cloud and marketplaces are on the [roadmap](docs/gpu-roadmap.md).

> Status: early-stage platform. The gateway, billing ledger, dashboard, admin console, SDKs and CLI are implemented and tested. No upstream model provider is enabled by default. An administrator enables each one after recording the legal basis for serving it (see [Provider integration modes](#provider-integration-modes)). Payments are disabled until Stripe or Razorpay keys are configured.

```bash
curl https://api.inrent.ai/v1/chat/completions \
  -H "Authorization: Bearer $INRENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "inrent/auto", "messages": [{"role": "user", "content": "Hello"}]}'
```

Any OpenAI SDK works. Set `base_url` to `https://api.inrent.ai/v1`.

## Architecture

```mermaid
flowchart LR
  subgraph Clients
    SDK["SDKs / CLI / any OpenAI client"]
    Browser["Browser"]
  end
  subgraph Edge
    LB["Load balancer / ingress<br/>(TLS, no response buffering)"]
  end
  subgraph App["INRENT services"]
    Web["apps/web<br/>Next.js: site, docs, dashboard,<br/>admin, auth, payment webhooks"]
    GW["apps/gateway<br/>Hono: /v1 OpenAI-compatible API<br/>auth → limits → routing → fallback → billing"]
    Worker["apps/worker<br/>BullMQ: webhooks, rollups,<br/>health checks, auto-recharge, retention"]
  end
  subgraph Data
    PG[("PostgreSQL<br/>accounts, catalog, prices,<br/>ledger, request logs, audit")]
    Redis[("Redis<br/>rate limits, key cache,<br/>queues, circuit state")]
  end
  subgraph External
    Providers["Model providers<br/>(platform credentials or customer BYOK)"]
    Pay["Stripe / Razorpay"]
    Mail["Resend / SendGrid"]
  end

  SDK -->|HTTPS| LB --> GW
  Browser -->|HTTPS| LB --> Web
  Web -->|signed internal assertion<br/>(playground)| GW
  GW --> PG & Redis
  GW -->|stream / JSON| Providers
  Web --> PG & Redis
  Pay -->|signed webhooks| Web
  Worker --> PG & Redis
  Worker --> Providers
  Worker --> Mail
  Worker -->|signed webhooks| CustomerEndpoints["Customer webhook endpoints"]
```

The request path through the gateway:

```text
request ─► authenticate key (salted hash, Redis-cached) ─► IP / org / key rate limits (sliding window)
        ─► validate body (zod) ─► resolve catalog + serving policy (integration mode, license, price, BYOK)
        ─► rank candidates (policy: balanced | lowest cost | lowest latency | best quality; health; circuit breaker)
        ─► pre-flight: balance ≥ max estimated charge, key / project / org budgets
        ─► call provider ─► on retryable failure before the first byte: next candidate (fallback)
        ─► stream or return response with x-request-id, provider, cost headers
        ─► persist request + charge ledger atomically (idempotent on request id) ─► metrics, webhooks
```

Details: [docs/architecture.md](docs/architecture.md).

## What's in the repository

| Path                     | What it is                                                                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/gateway`           | OpenAI-compatible API (`/v1/chat/completions`, `/completions`, `/responses`, `/embeddings`, `/images/generations`, `/models`, key/usage/request management)              |
| `apps/web`               | Marketing site, model catalog, docs (Markdown), auth, dashboard, admin console, payment webhooks                                                                         |
| `apps/worker`            | Background jobs: webhook delivery with retries, usage rollups, provider health checks, auto-recharge, retention, FinOps alerts                                           |
| `packages/core`          | Pure domain logic: money (nano-USD), pricing, routing, serving policy, rate limiting, RBAC, errors, crypto (API keys, AES-GCM envelopes, webhook signatures, SSRF guard) |
| `packages/db`            | Prisma schema, migrations, idempotent seed and catalog                                                                                                                   |
| `packages/services`      | Server-side business logic shared by web, gateway and worker (billing ledger, payments, keys, orgs, BYOK, webhooks, analytics, admin)                                    |
| `packages/providers`     | Provider adapters (OpenAI-compatible, Anthropic, dev mock) and the GPU provider interface                                                                                |
| `packages/observability` | Structured logging with redaction, error reporting, OpenTelemetry                                                                                                        |
| `packages/sdk`           | `@inrent/sdk`, the TypeScript/JavaScript SDK                                                                                                                             |
| `packages/cli`           | `@inrent/cli`, the `inrent` command-line tool                                                                                                                            |
| `sdks/python`            | `inrent`, the Python SDK                                                                                                                                                 |
| `infrastructure/`        | Prometheus, Grafana, LiteLLM, Kubernetes (kustomize), Terraform plan                                                                                                     |
| `docs/`                  | Engineering documentation                                                                                                                                                |

## Quickstart (local)

Requirements: Node 22, pnpm 10, Docker (or local PostgreSQL 16 and Redis 7).

```bash
cp .env.example .env              # development defaults; never commit .env
docker compose up -d postgres redis
pnpm install
pnpm db:init                      # migrate + seed (dev seed: mock provider, demo workspace)
pnpm dev                          # web :3000, gateway :8080, worker
```

Sign in at http://localhost:3000 with the development demo account printed by the seed (`demo@inrent.local`). Then create a key and call the gateway, which serves the development mock models (`inrent/mock-echo`, `inrent/mock-embed`). These models are clearly labelled and refused in production.

You can also run the whole stack in containers with `docker compose up --build`. See [docs/local-development.md](docs/local-development.md).

## Tests

```bash
pnpm lint && pnpm typecheck
pnpm test                          # unit tests (core, providers, services, gateway, worker, SDK, CLI)
pnpm test:integration              # gateway + services against Postgres/Redis (database inrent_test)
cd sdks/python && pytest           # Python SDK
```

## Provider integration modes

INRENT never assumes it may resell a provider's API. Each provider has an **integration mode** set by an administrator:

| Mode                          | Platform-funded serving allowed when…                                                                                |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DIRECT_RESALE`               | provider terms reviewed and marked verified (with a recorded terms reference) and the model is marked resale-allowed |
| `AUTHORIZED_RESELLER`         | a reseller/partner agreement exists and is recorded                                                                  |
| `CUSTOM_ENTERPRISE`           | only for organizations covered by that agreement                                                                     |
| `SELF_HOSTED` / `OPEN_WEIGHT` | the model license is verified for commercial use                                                                     |
| `BYOK`                        | never. Customers use their own provider keys                                                                         |

Unknown license or resale status is treated as "not allowed". Prices come only from the database. Each price is versioned and records its source, and there are no hard-coded prices. See [docs/provider-routing.md](docs/provider-routing.md).

## Documentation

- [Architecture](docs/architecture.md)
- [API](docs/api.md) (also served at `/docs` and `/openapi.json`)
- [Security](docs/security.md) and [SECURITY.md](SECURITY.md)
- [Billing](docs/billing.md)
- [Provider routing](docs/provider-routing.md)
- [GPU roadmap](docs/gpu-roadmap.md)
- [Local development](docs/local-development.md)
- [Deployment](docs/deployment.md)
- [Contributing](CONTRIBUTING.md) and [Code of Conduct](CODE_OF_CONDUCT.md)

## Legal pages

The Terms, Privacy, Acceptable Use, Cookies and DPA pages in `apps/web` are **templates that require review by qualified counsel** before launch. Each page is marked as such.
