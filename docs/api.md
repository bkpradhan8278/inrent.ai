# API

The INRENT API is OpenAI-compatible. The base URL is `https://api.inrent.ai/v1` (local: `http://localhost:8080/v1`). The full customer-facing reference lives at `/docs` in the web app, and the machine-readable spec at `GET /openapi.json`.

## Authentication

```http
Authorization: Bearer sk-inrent-prod-…
```

Key format: `sk-inrent-{dev|stg|prod}-` followed by 43 base62 characters. Keys are shown once at creation and stored only as peppered HMAC-SHA256 hashes. Each key belongs to one project and environment, carries a set of permissions, and can have its own model allowlist, spend limit, RPM/TPM limits and expiry.

| Permission                 | Grants                                                                                               |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| `inference`                | `/chat/completions`, `/completions`, `/responses`, `/embeddings`, `/images/generations`              |
| `keys:read` / `keys:write` | `GET /keys`, `POST /keys`, `DELETE /keys/{id}`. A key can never mint a key with permissions it lacks |
| `usage:read`               | `GET /usage`                                                                                         |
| `logs:read`                | `GET /requests`, `GET /requests/{id}` (metadata only; payloads are dashboard-only)                   |

`GET /key` (any valid key) returns the calling key's limits, balance and spend.

## Endpoints

| Method          | Path                                                                      | Notes                                                                                                 |
| --------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| POST            | `/v1/chat/completions`                                                    | Streaming (SSE), tools, JSON mode/structured output, vision; `stream_options.include_usage` supported |
| POST            | `/v1/completions`                                                         | Legacy text completions                                                                               |
| POST            | `/v1/responses`                                                           | Responses API subset (text input/output, streaming)                                                   |
| POST            | `/v1/embeddings`                                                          |                                                                                                       |
| POST            | `/v1/images/generations`                                                  | When an enabled provider supports it                                                                  |
| GET             | `/v1/models`, `/v1/models/{vendor}/{model}`                               | Public; includes `availability` (`platform`, `byok`, `unavailable`) and verified `pricing`            |
| GET             | `/v1/key`                                                                 | Current key info                                                                                      |
| GET/POST/DELETE | `/v1/keys`, `/v1/keys/{id}`                                               | Key management                                                                                        |
| GET             | `/v1/usage?days=30&project_id=`                                           | Usage summary                                                                                         |
| GET             | `/v1/requests?limit=&cursor=&model=&status=`, `/v1/requests/{request_id}` | Request logs                                                                                          |
| GET             | `/health`, `/ready`, `/metrics`, `/openapi.json`                          | Operational (`/metrics` requires `METRICS_TOKEN` in production)                                       |

Endpoints that are not available yet (for example audio and fine-tuning) return `501 endpoint_not_supported` with a clear message instead of failing silently.

## Routing extension

Optional, and ignored by other OpenAI-compatible servers:

```json
{
  "model": "inrent/auto",
  "messages": [{ "role": "user", "content": "Hi" }],
  "inrent": {
    "route": "lowest_latency",
    "providers": { "order": ["anthropic"], "ignore": ["provider-x"], "allow_fallbacks": true },
    "fallback_models": ["openai/gpt-4.1-mini"]
  }
}
```

`inrent/auto` picks an eligible chat model using the organization's routing policy.

## Response headers

| Header                                                                  | Meaning                                                                     |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `x-request-id`                                                          | `req_…`. Quote it in support requests; it appears in logs and the dashboard |
| `x-inrent-provider`, `x-inrent-model`                                   | What actually served the request                                            |
| `x-inrent-fallbacks`                                                    | Number of failed attempts before success                                    |
| `x-inrent-billing-mode`                                                 | `platform` or `byok`                                                        |
| `x-inrent-cost-usd`                                                     | Amount charged (non-streaming responses)                                    |
| `x-ratelimit-limit-*`, `x-ratelimit-remaining-*`, `x-ratelimit-reset-*` | Rate-limit state; `retry-after` on 429                                      |

## Errors

Every error uses the OpenAI-style envelope plus a request ID:

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "model_not_found",
    "message": "…",
    "param": "model",
    "request_id": "req_…"
  }
}
```

| Status          | Typical codes                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| 400             | `invalid_request`, `invalid_json`, `context_length_exceeded`                                                 |
| 401             | `missing_api_key`, `invalid_api_key`, `expired_api_key`, `revoked_api_key`                                   |
| 402             | `insufficient_credits`, `api_key_budget_exceeded`, `project_budget_exceeded`, `organization_budget_exceeded` |
| 403             | `permission_denied`, `model_not_allowed`, `organization_suspended`                                           |
| 404             | `model_not_found`, `not_found`                                                                               |
| 429             | `rate_limit_exceeded`, `auth_rate_limited`                                                                   |
| 501             | `endpoint_not_supported`                                                                                     |
| 502 / 503 / 504 | `upstream_error`, `provider_error`, `model_unavailable`, `upstream_timeout`                                  |

The full catalog, with what each code means and how to fix it, is in `packages/core/src/errors.ts` (`ERROR_CATALOG`) and on `/docs/errors`.

## Webhooks (outbound)

Events: `request.completed`, `request.failed`, `usage.threshold`, `credit.low`, `payment.success`, `payment.failed`, `model.updated`, `provider.down`, `provider.recovered`. Each delivery is signed with `Inrent-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">`. Deliveries retry 7 times with backoff (30 s → 6 h). Verification snippets are on the dashboard Webhooks page.

## SDKs

- TypeScript: `packages/sdk` (`@inrent/sdk`)
- Python: `sdks/python` (`inrent`)
- CLI: `packages/cli` (`@inrent/cli`)
