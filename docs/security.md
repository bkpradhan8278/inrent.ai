# Security

This document describes the security controls that are **implemented in this codebase**. It is not a certification or compliance claim. INRENT does not currently hold SOC 2, ISO 27001 or similar attestations.

## Secrets

| Secret                                   | Storage                                                                                                              | Notes                                                                                                                                                                                                                                                             |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Customer API keys                        | `ApiKey.keyHash` = HMAC-SHA256(key, `API_KEY_PEPPER`)                                                                | Shown once; only prefix and last four characters are kept for display. Lookups use the hash; comparisons are constant-time.                                                                                                                                       |
| BYOK provider keys                       | AES-256-GCM envelope `v1.<keyId>.<iv>.<tag>.<ciphertext>`                                                            | Additional authenticated data binds the ciphertext to the organization and provider, so a ciphertext can't be replayed into another tenant. Decrypted only inside the gateway at request time; never returned by any API. Deleting a key destroys the ciphertext. |
| Webhook signing secrets, MCP auth tokens | Same envelope, purpose-specific AAD                                                                                  | Webhook secrets are shown once; rotation is supported.                                                                                                                                                                                                            |
| Platform provider credentials            | **Not in the database.** `Provider.credentialRef` stores a reference (`env:NAME`, `vault:…`, `aws-sm:…`, `gcp-sm:…`) | The admin UI rejects anything that looks like a raw secret. Credentials never reach the browser.                                                                                                                                                                  |
| Encryption keyring                       | `INRENT_ENCRYPTION_KEYS` (`id:base64,…`)                                                                             | The first key encrypts and every key decrypts, so rotation is "add new key first, re-encrypt, remove old".                                                                                                                                                        |

Production start-up refuses development secrets (values containing `dev-only` / `change-me`), the mock provider and private webhook targets. The web app also refuses a weak `BETTER_AUTH_SECRET` when `INRENT_ENV=production`.

## Authentication and sessions

- Dashboard: Better Auth (email + password with scrypt hashing, magic links, optional GitHub/Google OAuth). Sessions use HTTP-only, `SameSite=Lax` cookies, secure in production, with the `inrent` cookie prefix. Sign-in, sign-up, magic-link and password-reset endpoints have strict rate limits.
- API: bearer keys (above). Failed authentication attempts are rate-limited per IP (`auth_rate_limited`).
- Playground: the web server signs a short-lived (120 s) HMAC assertion for the user's active project. The browser never holds an API key.

## Authorization

- **Organization roles** (owner, admin, developer, billing, viewer) map to explicit permissions (`roleCan`). Every service function checks permissions server-side. The UI hiding a button is never the only control.
- **Platform roles** (read-only, developer, support, finance, admin, super admin) gate the admin console per permission (`platformRoleCan`). Only super admins can change roles, and nobody can change their own.
- **API key permissions** scope what a key can do. Keys can't mint keys with broader permissions.
- Workspace selection cookies are preferences only and are re-validated against memberships on every request.

## Abuse and resource protection

- Sliding-window rate limits (Redis) per IP, key and organization for requests and tokens. Plan-level defaults apply, with per-key overrides.
- Request size limits and schema validation on every endpoint (zod).
- Budgets: per-key lifetime, per-project monthly and per-organization monthly caps, plus a balance check against the maximum possible charge **before** any provider is called.
- Account suspension blocks all keys within the cache TTL (≤ 60 s) and immediately on cache misses.

## SSRF protection

Outbound URLs that come from users (webhooks, MCP servers) pass `assertPublicUrl`: `https` only, DNS resolution with every resolved address checked against private, loopback, link-local, CGNAT, multicast and metadata ranges (IPv4 and IPv6, including mapped addresses), and no credentials in URLs. Validation runs again at delivery time to defeat DNS rebinding, and redirects aren't followed. Private targets can only be enabled for local testing (`ALLOW_PRIVATE_WEBHOOK_URLS`), and production rejects that.

## Webhooks

- **Outbound:** HMAC-SHA256 signatures over `timestamp.body` (`Inrent-Signature: t=…,v1=…`). The receiver checks a timestamp tolerance to prevent replay. An endpoint is auto-disabled after 25 consecutive failures.
- **Inbound payments:** Stripe and Razorpay signatures are verified on the raw request body. Events are deduplicated by provider event ID in the same transaction as the credit grant. Bodies over 1 MB are rejected.

## MCP and agents (preview)

Tools are registered **disabled**. Write and destructive tools need approval from an owner or admin, with a typed confirmation, and every approval is audit-logged. A server's maximum permission caps all of its tools. The execution runtime is not yet shipped.

## Data protection and privacy

- Prompt and response logging are **off by default**, per organization. Zero-retention mode forces both off.
- Log retention is configurable within plan limits, and a worker job deletes or scrubs expired data. Billing records are kept in the ledger.
- Logs redact authorization headers, keys, secrets, passwords and payload fields. Client IPs are stored only as salted hashes.
- Data export (CSV/JSON, with spreadsheet formula-injection protection) and account deletion (keys revoked, secrets crypto-shredded, PII anonymized, ledger retained) are self-service.
- Admins can't see customer prompt or response payloads in the admin console.

## Web application hardening

Content-Security-Policy, HSTS (production), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` and frame-ancestors restrictions are set in `next.config.ts`. Server actions re-check authentication and authorization on each call. Data-export responses are `no-store`.

## Auditing

`AuditLog` records security-relevant actions with before/after values where applicable: key creation, rotation and revocation, BYOK changes, webhook changes, member and role changes, settings, data exports, admin provider/model/pricing changes, role grants, suspensions, credit adjustments, flags, incidents and account deletion. Secrets are never recorded.

## Supply chain and CI

CI runs lint, type checks, unit and integration tests, migration drift checks, Gitleaks over the full history, `pnpm audit` (high and critical, production dependencies), CodeQL (JS/TS and Python) and a Trivy image scan. Images run as a non-root user.

## Known gaps and next steps

- No WAF or bot management is included. Add one at the edge.
- The circuit breaker is per instance. A shared (Redis) breaker would converge faster across replicas.
- There is no automated key-rotation scheduler for `INRENT_ENCRYPTION_KEYS` yet (rotation is supported manually).
- SSO/SAML and SCIM for enterprise customers are not implemented.
- Commission an external penetration test before general availability.
