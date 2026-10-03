# Local development

## Prerequisites

- Node.js 22 (`.nvmrc`) and pnpm 10 (`corepack enable`)
- PostgreSQL 16 and Redis 7, either through Docker (`docker compose up -d postgres redis`) or installed locally
- Optional: Python 3.9+ for the Python SDK

## First run

```bash
cp .env.example .env          # development defaults — never commit .env
docker compose up -d postgres redis
pnpm install                  # also generates the Prisma client
pnpm db:init                  # apply migrations + seed
pnpm dev                      # web http://localhost:3000 · gateway http://localhost:8080 · worker
```

The development seed (skipped when `INRENT_ENV=production` or `SEED_DEMO_DATA=false`) creates:

- plans, the provider/model catalog (all real providers **disabled**, BYOK mode, unverified, no prices) and feature flags,
- two **mock providers** and `inrent/mock-echo` / `inrent/mock-embed` with clearly labelled demo prices, so the full flow works without any provider account,
- a demo user `demo@inrent.local` (password from `SEED_DEMO_PASSWORD`, default `inrent-demo-password`) with the `SUPER_ADMIN` platform role, a "Demo Workspace" organization with $25 of promotional demo credit, a demo API key (printed once) and 30 days of synthetic traffic marked `isDemo` (shown with a "Demo data" badge).

The seed is idempotent, so running it again changes nothing.

### Try the API

```bash
export INRENT_API_KEY=sk-inrent-dev-…   # from the seed output or Dashboard → API Keys
curl localhost:8080/v1/chat/completions -H "Authorization: Bearer $INRENT_API_KEY" \
  -H "Content-Type: application/json" -d '{"model":"inrent/mock-echo","messages":[{"role":"user","content":"hi"}]}'

# Failure injection for fallback testing (mock provider only):
#   include "[[mock:fail]]" in the prompt, or configure a mock provider base URL like mock://local?fail=always
```

The CLI from source: `pnpm --filter @inrent/cli dev -- --base-url http://localhost:8080/v1 models`.

### Admin access for another account

```bash
pnpm admin:grant --email you@example.com --role SUPER_ADMIN
```

## Everything in Docker

```bash
docker compose up --build                       # postgres, redis, migrate+seed, gateway, worker, web
docker compose --profile observability up -d    # Prometheus :9090, Grafana :3001 (dashboard "INRENT Gateway")
docker compose --profile litellm up -d          # optional LiteLLM upstream on :4000
```

## Common tasks

| Task               | Command                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------- |
| Lint / types       | `pnpm lint`, `pnpm typecheck`                                                               |
| Unit tests         | `pnpm test`                                                                                 |
| Integration tests  | `pnpm test:integration` (needs Postgres database `inrent_test` and Redis; uses Redis DB 15) |
| Create a migration | edit `packages/db/prisma/schema.prisma`, then `pnpm db:migrate:dev --name <change>`         |
| Browse data        | `pnpm db:studio`                                                                            |
| Format             | `pnpm format`                                                                               |
| Python SDK         | `cd sdks/python && pip install -e ".[dev]" && pytest`                                       |

Create the test database once: `createdb -h localhost -U inrent inrent_test` (or `psql -c "CREATE DATABASE inrent_test"`).

## Payments locally

Checkout stays disabled until keys are set. To test Stripe end to end, use test-mode keys and forward webhooks:

```bash
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # prints STRIPE_WEBHOOK_SECRET
```

## Email locally

With `EMAIL_PROVIDER=console`, emails (magic links, invitations, password resets, alerts) are printed to the web/worker logs instead of being sent.

## Troubleshooting

- **`Invalid server environment`**: a required variable is missing. Compare your `.env` with `.env.example`.
- **The gateway says `model_unavailable`**: the model has no eligible endpoint. The error message names the reason (provider disabled, BYOK required, price not configured…). Locally, use the mock models or add a BYOK key.
- **Playground returns `gateway_unreachable`**: start the gateway (`pnpm dev` starts all three services).
- **Port in use**: set `GATEWAY_PORT` or run Next with `-p`.
