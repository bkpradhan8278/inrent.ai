---
title: API overview
description: Base URL, endpoints, request format, headers and conventions.
---

## Base URL

```text
{{API_BASE_URL}}
```

## Endpoints

| Method | Path | Description |
| --- | --- | --- |
| POST | `/chat/completions` | Chat completions, with streaming, tools and structured output |
| POST | `/completions` | Legacy text completions (served through chat) |
| POST | `/responses` | Responses API subset (text/message input, non-streaming) |
| POST | `/embeddings` | Embeddings |
| POST | `/images/generations` | Image generation (models that support it) |
| GET | `/models` | List models (no key required) |
| GET | `/models/{model}` | Retrieve a model |
| GET | `/key` | Inspect the calling key |
| GET/POST | `/keys` | Manage keys (management permissions) |
| DELETE | `/keys/{id}` | Revoke a key |
| GET | `/usage` | Usage summary |
| GET | `/requests` | Request logs |

`/audio/transcriptions`, `/audio/speech`, `/batches`, `/rerank`, `/videos` and `/agents` return `501 endpoint_not_supported` until they ship. See the [API reference](/docs/api-reference) for every parameter.

## Model identifiers

Models are addressed as `vendor/model`, for example `openai/gpt-4.1` or `qwen/qwen3-32b`. The special model `inrent/auto` lets the router choose. Call `GET /models` for the live list.

## Response headers

| Header | Description |
| --- | --- |
| `x-request-id` | Unique request ID (`req_…`). Include it when contacting support. |
| `x-inrent-trace-id` | Trace ID (honours W3C `traceparent`). |
| `x-inrent-provider` | Provider that served the request. |
| `x-inrent-model` | Model that served the request. |
| `x-inrent-fallbacks` | Number of providers tried before success. |
| `x-inrent-billing-mode` | `platform` (INRENT credits) or `byok`. |
| `x-inrent-cost-usd` | Amount charged to your balance (non-streaming). |
| `x-ratelimit-*` | Remaining requests and tokens in the current window. |

Response bodies follow the OpenAI format, with an extra top-level `provider` field.

## INRENT extensions

Requests may include an optional `inrent` object. Other OpenAI-compatible servers ignore it.

```json
{
  "model": "meta/llama-3.3-70b-instruct",
  "messages": [{ "role": "user", "content": "Hi" }],
  "inrent": {
    "route": "lowest_latency",
    "providers": { "order": ["groq"], "ignore": ["fireworks"], "allow_fallbacks": true },
    "fallback_models": ["qwen/qwen3-32b"]
  }
}
```

See [Routing & fallback](/docs/routing).

## Limits

Request bodies are limited to 20 MB. Unknown top-level fields are dropped before forwarding upstream.
