---
title: Billing & credits
description: How credits, pricing, budgets and auto-recharge work.
---

## Credits

INRENT uses prepaid credits. Buy credits in **Dashboard → Billing** ($5, $10, $25, $50, $100 or a custom amount). Payments run through Stripe; Razorpay can be enabled for India. Credits are added only after the payment provider's signed webhook confirms the payment — never from a browser redirect.

## How a request is charged

```text
provider cost = input tokens × input price + output tokens × output price (+ cached / per-image rates)
your charge   = provider cost × (1 + platform fee)
```

- Prices are per 1M tokens and published on each model page, platform fee included.
- Token counts come from the provider. They are estimated only when a provider omits them, and the request log flags those cases.
- Amounts are calculated server-side with exact integer arithmetic, down to a billionth of a dollar.
- Each request is charged exactly once. Retries of the same request can't double-charge.

## BYOK requests

Requests served with your own provider key are billed by that provider. INRENT records usage and estimated list cost for analytics. Any BYOK fee is shown in your settings before it applies.

## Budgets and caps

| Control | Where |
| --- | --- |
| Organization monthly cap | Billing → Limits |
| Project monthly budget | Projects → Budget |
| API key spend limit | API Keys → Limits |

Before calling a provider, INRENT checks the estimated maximum cost against your balance and every budget. A request that would exceed one fails with `402` and a code that names the limit.

## Auto-recharge

Auto-recharge is **off by default**. If you enable it with a threshold and an amount (for example, "below $5, add $20"), INRENT charges your saved card off-session when your balance falls under the threshold. A failed charge notifies you and doesn't retry endlessly.

## Low-balance alerts

When your balance falls below your threshold (default $1), INRENT creates a dashboard notification and sends a `credit.low` webhook if you subscribe to it.

## Transactions and exports

Every credit and charge is an immutable ledger entry with the running balance. Export transactions, usage and request logs as CSV or JSON from the dashboard.
