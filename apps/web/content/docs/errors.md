---
title: Errors
description: Error format, codes, and how to fix each one.
---

Every error has the same shape:

```json
{
  "error": {
    "type": "insufficient_credits_error",
    "code": "insufficient_credits",
    "message": "Your organization's credit balance is too low for this request. Add credits or enable auto-recharge.",
    "param": null,
    "request_id": "req_01J9Z4Q3W6M0Y8R2T5V7X9B1C3",
    "details": { "balance_usd": "$0.02", "estimated_cost_usd": "$0.004500" }
  }
}
```

Always log `request_id`. Support can trace any request with it.

## Reference

| Status | Code | What happened | How to fix |
| --- | --- | --- | --- |
| 400 | `invalid_request` | The body failed validation (see `param`). | Fix the field named in `param`. |
| 400 | `invalid_json` | The body is not valid JSON. | Send `Content-Type: application/json` with valid JSON. |
| 400 | `unsupported_capability` | No provider for this model supports a feature you used. | Remove the feature or pick another model. |
| 400 | `context_length_exceeded` | Prompt + max_tokens exceeds the context window. | Shorten the input or lower `max_tokens`. |
| 401 | `missing_api_key` / `invalid_api_key` | Key missing or wrong. | Check the `Authorization` header. |
| 401 | `revoked_api_key` / `expired_api_key` | Key revoked, rotated or expired. | Create or rotate a key. |
| 402 | `insufficient_credits` | Balance can't cover the estimated cost. | Add credits or enable auto-recharge. |
| 402 | `api_key_budget_exceeded` | The key hit its spend limit. | Raise the key's limit. |
| 402 | `project_budget_exceeded` | The project hit its monthly budget. | Increase the budget or wait for the next month. |
| 402 | `organization_budget_exceeded` | The organization hit its monthly cap. | Raise the cap in Billing. |
| 403 | `model_not_allowed` | The key or project allowlist excludes the model. | Update the allowlist. |
| 403 | `insufficient_key_permissions` | The key lacks a permission (e.g. `keys:write`). | Use a key with that permission. |
| 403 | `permission_escalation` | A key tried to create a more powerful key. | Grant only permissions the key has. |
| 404 | `model_not_found` | Unknown model id. | Use an id from `GET /models`. |
| 429 | `rate_limit_exceeded` | A rate limit was hit. | Wait `retry-after` seconds and back off. |
| 501 | `endpoint_not_supported` | The endpoint isn't available yet. | See the roadmap. |
| 502 | `upstream_error` and related | The provider failed after all fallbacks. | Retry, or allow fallbacks and fallback models. |
| 503 | `model_unavailable` | No eligible provider (not enabled, needs BYOK, or all down). | Read the message; add a BYOK key or choose another model. |
| 504 | `upstream_timeout` | The provider didn't respond in time. | Retry or reduce the request size. |
| 500 | `internal_error` | Something failed inside INRENT. | Retry; contact support with the request_id. |

## Errors from providers

Upstream error messages are passed through when they help, with credentials redacted. `details.provider` and `details.upstream_status` identify the source.
