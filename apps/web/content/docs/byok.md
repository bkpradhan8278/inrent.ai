---
title: Bring your own key
description: Route requests through your own provider accounts.
---

BYOK lets you use your own provider account through INRENT. Use it when a provider only permits direct access, when you have negotiated rates, or when you want usage on your own provider bill.

## Add a key

**Dashboard → BYOK → Add key.** Choose the provider and paste your key. INRENT:

1. Encrypts it with AES-256-GCM, bound to your organization and that provider.
2. Shows only the last four characters from then on.
3. Lets you **Test** it, which makes a lightweight model-list call to the provider.

You can disable, rotate (replace) or delete keys at any time. Deleting a key also destroys its ciphertext.

## How routing uses BYOK

- For providers in BYOK-only mode, a BYOK key is the only way to use their models.
- When **Prefer BYOK** is on (the default), endpoints you hold a key for are tried first, even if the model is also available with INRENT credits.
- Responses show `x-inrent-billing-mode: byok`, and request logs mark BYOK requests separately from platform-funded ones.

## Billing

The provider bills you directly for BYOK usage. INRENT records tokens and the estimated list cost for analytics. Any BYOK platform fee is configured transparently and shown before it applies.

> [!NOTE]
> Your agreement with the provider, including its usage policies, applies to BYOK requests.
