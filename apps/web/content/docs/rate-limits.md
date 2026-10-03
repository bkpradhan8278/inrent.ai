---
title: Rate limits
description: Request and token limits, headers, and how to handle 429s.
---

INRENT applies sliding-window limits at several levels. The tightest one wins.

| Scope | Default |
| --- | --- |
| API key — requests/min | Your plan's limit, or lower if you set one on the key |
| API key — tokens/min | Your plan's limit, or lower if you set one on the key |
| Organization — requests/min and tokens/min | Your plan's limits |
| IP address | Abuse protection for unusual volumes |
| Provider capacity | Protects upstream accounts; triggers fallback rather than an error |

Plan defaults are listed on the [pricing page](/pricing).

## Headers

```http
x-ratelimit-limit-requests: 120
x-ratelimit-remaining-requests: 117
x-ratelimit-reset-requests: 41s
x-ratelimit-limit-tokens: 400000
x-ratelimit-remaining-tokens: 391220
x-ratelimit-reset-tokens: 41s
```

## 429 responses

```json
{
  "error": {
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded: requests per minute for this API key. Retry after 12s.",
    "request_id": "req_..."
  }
}
```

A `retry-after` header (in seconds) accompanies every 429. Back off with jitter. Requests rejected by a limit are not counted toward it.

## Token accounting

Before a request runs, INRENT estimates prompt tokens and checks them against your tokens-per-minute limit. After the response, the actual usage is recorded, so long completions count fully toward the window.
