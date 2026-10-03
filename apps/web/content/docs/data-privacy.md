---
title: Data & privacy
description: What INRENT logs, how long it keeps it, and how to control it.
---

## Logged by default

For every request: request ID, trace ID, timestamps, endpoint, model, provider, status, token counts, cost, latency, time-to-first-token, routing attempts, API key and project, a salted hash of the client IP, and the user agent.

## Not logged by default

Prompts and responses. An organization owner can enable **prompt logging** and **response logging** separately. Stored payloads are capped at 64 KB per request.

## Retention

- **Log retention** (per plan, up to 365 days on Enterprise) controls how long request records and payloads are kept.
- **Zero-retention mode** disables payload logging entirely and scrubs any existing payloads.
- Billing records (the ledger and daily usage aggregates) are kept as required for accounting.

## Exports and deletion

- Export usage, request logs, transactions and invoices as CSV or JSON from the dashboard.
- Deleting your account anonymizes your user record, removes sessions and login methods, closes organizations you are the sole member of (revoking keys and destroying encrypted secrets), and keeps only legally required financial records.

## Providers

INRENT sends request content to the provider that serves it. For BYOK requests, your agreement with that provider applies.
