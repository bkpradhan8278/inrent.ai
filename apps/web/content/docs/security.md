---
title: Security
description: How INRENT protects keys, secrets and customer data.
---

## Keys and secrets

- **API keys** are random 256-bit tokens, stored only as HMAC-SHA256 digests with a server-side pepper.
- **Provider keys (BYOK), webhook secrets and MCP credentials** are encrypted with AES-256-GCM. Associated data binds each ciphertext to its organization, and the keyring supports rotation.
- **Platform provider credentials** are referenced by name (`env:…`, `vault:…`) and resolved only inside the gateway. They never reach the database or the browser.
- Upstream error messages are scrubbed of anything that looks like a credential.

## Access control

- Organization roles: Owner, Admin, Developer, Billing and Viewer. Each server-side action checks membership and permission.
- Admin console roles: Super Admin, Admin, Support, Finance, Developer and Read Only.
- Projects, keys, logs and webhooks are always scoped to your organization; cross-organization IDs are rejected.

## Network and input safety

- Strict request validation and size limits; unknown fields are dropped.
- Outbound calls to user-supplied URLs (webhooks, MCP) go through an SSRF guard with DNS resolution and private-range blocking.
- The web app sends CSP, HSTS, `X-Frame-Options: DENY` and other security headers. Server actions are origin-checked.

## Abuse and reliability

- Rate limits per IP, key, user and organization, plus throttling of failed authentication.
- Budgets and caps checked before a provider is called.
- Audit logs for security-relevant changes.

## Reporting a vulnerability

Email security@inrent.ai. See `SECURITY.md` in the repository for our disclosure policy.
