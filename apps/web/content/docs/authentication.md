---
title: Authentication
description: Authenticate API requests with INRENT API keys.
---

Send your key as a bearer token on every request:

```http
Authorization: Bearer sk-inrent-prod-xxxxxxxxxxxxxxxx
```

The `x-api-key` header is also accepted for tools that can't set `Authorization`.

## Key format

`sk-inrent-<env>-<43 random characters>` where `<env>` is `dev`, `stg` or `prod`. Keys carry about 256 bits of entropy and no embedded account data.

## How keys are stored

INRENT stores only an HMAC-SHA256 digest of each key, computed with a server-side secret. Even with database access, keys can't be recovered or verified offline. That's why a key is shown only once.

## Failure responses

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `missing_api_key` | No key was sent. |
| 401 | `invalid_api_key` | The key doesn't match an active key. |
| 401 | `revoked_api_key` | The key was revoked or rotated. |
| 401 | `expired_api_key` | The key's expiry date has passed. |
| 403 | `organization_suspended` | The organization is suspended. |
| 429 | `auth_rate_limited` | Too many failed attempts from your IP address. |

## Best practices

- Keep keys server-side. Never ship them in browser or mobile bundles.
- Use separate keys per environment and service, with [limits](/docs/api-keys).
- Rotate keys periodically and immediately if exposed. Revocation takes effect at once.
- Use the [management API](/docs/api-keys#management-api) with narrowly scoped keys for automation.
