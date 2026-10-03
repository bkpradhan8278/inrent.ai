---
title: Webhooks
description: Receive signed events for requests, credits, payments and provider health.
---

## Events

| Event | When |
| --- | --- |
| `request.completed` | A gateway request succeeded |
| `request.failed` | A request failed after all fallbacks |
| `usage.threshold` | Monthly spend crossed a configured threshold |
| `credit.low` | Balance fell below your low-balance threshold |
| `payment.success` / `payment.failed` | A payment succeeded or failed |
| `model.updated` | A model's availability or pricing changed |
| `provider.down` / `provider.recovered` | Provider health changed |

## Payload

```json
{
  "id": "evt_01J9Z5…",
  "type": "credit.low",
  "created": 1791000000,
  "organization_id": "…",
  "data": { "balance_usd": "0.850000", "threshold_usd": "1.000000" }
}
```

Request events include IDs, model, provider, tokens, cost and latency — never prompts or responses.

## Verifying signatures

Every delivery has an `Inrent-Signature` header:

```text
Inrent-Signature: t=1791000000,v1=5f2b…
```

`v1` is the hex HMAC-SHA256 of `"{t}.{raw_body}"` using your endpoint's signing secret (`whsec_…`). Reject deliveries older than five minutes to prevent replays.

```typescript tab="TypeScript"
import { createHmac, timingSafeEqual } from "node:crypto";

export function verify(secret: string, rawBody: string, header: string, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return parts.v1?.length === expected.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}
```

```python tab="Python"
import hmac, hashlib, time

def verify(secret: str, raw_body: str, header: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = int(parts.get("t", 0))
    if not t or abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.{raw_body}".encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))
```

## Delivery and retries

- Deliveries time out after 10 seconds, don't follow redirects, and count any 2xx as success.
- Failed deliveries retry with exponential backoff (30s, 2m, 10m, 30m, 2h, 6h), up to 7 attempts.
- After 25 consecutive failures an endpoint is disabled automatically; re-enable it from the dashboard.
- Each delivery carries `Inrent-Event-Id`. Use it to deduplicate.
- Delivery history (status, attempts, response code, duration) is shown per endpoint.

## Endpoint requirements

Endpoints must use HTTPS on a public host. Private, loopback, link-local and cloud-metadata addresses are rejected when you save the endpoint, and checked again before every delivery.
