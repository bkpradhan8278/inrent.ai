# Contributing to INRENT

Thanks for helping build INRENT. This guide covers the workflow and the standards every change must meet.

## Setup

See [docs/local-development.md](docs/local-development.md). In short: Node 22, pnpm 10, PostgreSQL 16 and Redis 7 (`docker compose up -d postgres redis`), then `cp .env.example .env && pnpm install && pnpm db:init && pnpm dev`.

## Workflow

1. Branch from `main`.
2. Keep each pull request focused. Vertical slices (schema → service → API → UI → tests) are preferred over layer-by-layer PRs.
3. Before pushing, run:
   ```bash
   pnpm lint && pnpm typecheck && pnpm test
   pnpm test:integration        # when touching gateway, services, billing or the schema
   ```
4. Open a PR describing **what** changed and **why**, how it was tested, and any migration or configuration impact.
5. CI must be green (lint, types, unit + integration tests, migration drift, build, secret scan, dependency audit, image scan).

## Standards

**Money.** All amounts are integer nano-USD (`bigint`). Never use floating point for money. Round charges up to the nano. Every balance change goes through the ledger (`applyLedgerEntry`) with an idempotency key, inside a transaction.

**Prices.** Prices live in the database (`ModelPrice`, versioned) with a recorded source. Never hard-code a price in code or UI. Never estimate a price you have not verified.

**Provider policy.** Never enable platform-funded serving without the legal basis described in [docs/provider-routing.md](docs/provider-routing.md). When license or resale status is unknown, treat it as "not allowed".

**Secrets.** Never commit `.env`, keys, tokens or certificates. API keys are stored only as peppered hashes. Provider, BYOK, webhook and MCP secrets are encrypted at rest (AES-256-GCM) and are never sent to the browser. Logs go through redaction. Never log request bodies outside the opt-in payload logging.

**Security-sensitive changes** (auth, RBAC, billing, payments, webhooks, SSRF, encryption) need tests for the failure paths, not only the happy path. Add a reviewer from the security owners.

**Database.** Use `pnpm db:migrate:dev` to create migrations. Migrations must be forward-only and backwards-compatible with the previous release (expand → migrate → contract). Commit the generated SQL. CI fails on schema/migration drift.

**Honesty in the product.** No fake data presented as real: demo data must be labelled, "coming soon" features must say so, and never claim certifications, customers, uptime or benchmarks we cannot prove.

**UI.** Use the design tokens and components in `apps/web/components/ui`. Respect `prefers-reduced-motion`. Pages must work at 390 px without horizontal scrolling and stay keyboard accessible.

**Code style.** TypeScript strict mode, ESLint and Prettier (`pnpm format`). Match the surrounding code: naming, comment density and idioms.

## Commit messages

Use the imperative mood (`Add BYOK key rotation`). Explain the reason in the body when it isn't obvious.

## Reporting security issues

Do not open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
