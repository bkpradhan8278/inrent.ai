---
title: API keys
description: Create, scope, limit, rotate and revoke keys.
---

## Create a key

**Dashboard → API Keys → Create key.** Choose:

- **Project.** Usage and budgets roll up to it.
- **Environment.** Development, staging or production, reflected in the prefix (`sk-inrent-dev-`, `-stg-`, `-prod-`).
- **Permissions.** `inference` by default. Management permissions are `keys:read`, `keys:write`, `usage:read` and `logs:read`.
- **Model allowlist.** Optional. Restricts which models the key can call.
- **Spend limit.** Optional lifetime cap in USD.
- **Rate limits.** Optional requests and tokens per minute, below your plan's limits.
- **Expiration.** Optional.

The secret is shown once. INRENT stores only a keyed hash.

## Rotate and revoke

- **Rotate** creates a new key with the same settings and immediately revokes the old one.
- **Revoke** disables a key instantly. Gateway caches are invalidated at revocation.
- **Delete** revokes the key and hides it from lists. Historical usage stays attributed to it.

## Management API

Keys with management permissions can automate key lifecycle:

```bash tab="Create"
curl {{API_BASE_URL}}/keys \
  -H "Authorization: Bearer $INRENT_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"name":"ci-runner","environment":"staging","permissions":["inference"],"spend_limit_usd":"25"}'
```

```bash tab="List"
curl {{API_BASE_URL}}/keys -H "Authorization: Bearer $INRENT_ADMIN_KEY"
```

```bash tab="Revoke"
curl -X DELETE {{API_BASE_URL}}/keys/KEY_ID -H "Authorization: Bearer $INRENT_ADMIN_KEY"
```

> [!WARNING]
> A key can never create a key with permissions it doesn't have itself.

## Inspect the current key

```bash
curl {{API_BASE_URL}}/key -H "Authorization: Bearer $INRENT_API_KEY"
```

This returns the key's name, environment, permissions, limits, lifetime spend and the organization's balance.
