# Billing

INRENT uses **prepaid credits** denominated in USD. Platform-funded requests are charged per request at the model's published price. BYOK requests are billed by the customer's own provider, and INRENT charges only the optional `BYOK_FEE_PCT` (0 by default).

## Units and arithmetic

- Every amount is an integer number of **nano-USD** (`bigint`; 1 USD = 1,000,000,000).
- Prices are stored as `Decimal` USD per 1M tokens (or per image or request). $X per 1M tokens is X × 10⁶ pico-USD per token, which is exact.
- A request's charge is `Σ tokens × price × (1 + markup%) × provider costMultiplier`, computed in pico-USD and **rounded up** to the nano. Provider cost and margin are recorded alongside the charge on every `Request` row.
- No floating point is used anywhere on the money path (`packages/core/src/money.ts`, `pricing.ts`).

## Prices

- `ModelPrice` rows are versioned per endpoint. Publishing a price closes the previous version (`effectiveTo`) and creates a new active one. History is never edited.
- Each price records its `pricingSource` (URL plus the date checked, or a contract reference), a `lastVerifiedAt` timestamp, and the admin who created it. The change is audit-logged and emits a `model.updated` webhook.
- A model without an active price **can't be served with platform funds**. The UI shows "Pricing pending verification" rather than an invented number.
- The default markup comes from `DEFAULT_PLATFORM_MARKUP_PCT`, and admins can override it per price.

## Request flow

1. **Pre-flight** (before any provider call): the organization's balance must be positive and cover the **maximum possible charge**: estimated input tokens, plus `max_tokens` (or the model's maximum output) × output price. The key's lifetime limit, the project's monthly budget and the organization's monthly cap are also checked. A violation returns `402` with a specific code.
2. **Execution.** Usage comes from the provider. When a provider doesn't report usage (some streams), tokens are estimated and the request is flagged `usageEstimated`.
3. **Settlement.** In a single database transaction: insert the `Request` row, apply a `USAGE` ledger entry (idempotency key `usage:<requestId>`), and increment spend counters (org/project per calendar month UTC, key lifetime). Retries of the same settlement are no-ops.
4. Streams that are cancelled by the client or interrupted upstream are billed for the tokens actually produced. Requests that fail before producing output aren't billed.

Because pre-flight doesn't hold a reservation, many concurrent requests can push the balance slightly below zero, by at most the in-flight requests' charges. Further platform requests are then rejected until credits are added. This trade-off keeps the hot path to one transaction per request. If you need strict holds for very large orgs, add a reservation table.

## The ledger

`CreditTransaction` is append-only. Each row carries a type (`PURCHASE`, `AUTO_RECHARGE`, `USAGE`, `REFUND`, `ADJUSTMENT`, `PROMO`), a signed amount, the balance after it was applied, and a **unique idempotency key**. `CreditBalance` is updated with `UPDATE … RETURNING` in the same transaction, which serializes concurrent writers on the row lock. A duplicate idempotency key returns the original result instead of applying the entry twice.

## Payments

| Provider | Use                                          | Flow                                                                                                                                                       |
| -------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stripe   | Cards (global), saved card for auto-recharge | Checkout Session (redirect). Webhooks: `checkout.session.completed` / `async_payment_*` / `expired`, `payment_intent.*` (auto-recharge), `charge.refunded` |
| Razorpay | India (UPI, cards, netbanking)               | Order + client checkout. Webhooks: `order.paid`, `payment.failed`, `refund.processed`. INR amount computed from `RAZORPAY_USD_INR_RATE`                    |

1. `startCreditPurchase` validates the amount ($5–$10,000), creates a `PENDING` `Payment` whose credit value is **fixed server-side**, and starts checkout. The client never decides how many credits it receives.
2. The provider calls `/api/webhooks/{stripe|razorpay}`. The signature is verified on the raw body.
3. `applyPaymentEvent` deduplicates by `(provider, eventId)` in `PaymentEvent` **in the same transaction** as the ledger grant (idempotency key `payment:<paymentId>`). Duplicates, retries and out-of-order events can't double-credit. A paid amount that doesn't match the payment marks it failed instead of granting. **Full** refunds debit the ledger automatically. Partial refunds are reconciled by an admin adjustment.
4. The success redirect only shows a message. Credits appear when the webhook is processed, never because the browser says so.

Without provider keys, checkout is disabled and the dashboard says so. There are no fake or simulated payments.

### Auto-recharge (opt-in)

When enabled and a Stripe card was saved during a purchase, the worker checks balances every 5 minutes. Below the threshold it creates an off-session charge for the configured amount, under a Redis lock and with at most one recharge in flight per organization. The charge is credited by the normal webhook path. Failures notify the billing contacts.

## Spend controls and alerts

- Per-key lifetime spend limit, per-project monthly budget, per-organization monthly cap.
- Low-balance threshold: an in-app notification, email and `credit.low` webhook (deduplicated).
- FinOps alerts for admins: provider spend over a daily threshold, models with margin below `FINOPS_MIN_MARGIN_PCT`, usage spikes, and recent price changes.

## Invoices and exports

Payment receipts are issued by the payment provider. The `Invoice` model is ready for enterprise monthly invoicing, but invoice generation itself is not implemented. Customers can export their ledger, usage and request logs as CSV or JSON.

## Plans

Plans (`Plan` table) define rate limits, project and member caps, and log retention. A plan's monthly price is `null` until announced, and the pricing page then shows "Contact us" or "Pay as you go" instead of a number. Plan prices aren't hard-coded in the UI.

## Tests

`packages/core/test/pricing.test.ts` and `money.test.ts` cover the arithmetic. `packages/services/test/integration/{billing,payments}.test.ts` cover concurrent charges, idempotent grants and charges, repeated/concurrent/re-sent webhooks, forged signatures, amount mismatches, failures and refunds. `packages/services/test/unit/razorpay.test.ts` covers Razorpay event mapping. `apps/gateway/test/integration` covers pre-flight rejections (no credits, key limit, project budget, max-output cost), exact billing, and settlement for streaming and non-streaming requests.
