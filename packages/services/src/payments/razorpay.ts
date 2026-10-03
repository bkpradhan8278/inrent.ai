import { hmacSha256Hex, safeEqual } from "@inrent/core/server";
import {
  PaymentSignatureError,
  type CheckoutInput,
  type CheckoutResult,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from "./types";

/**
 * Razorpay (India). Orders are created server-side; the dashboard opens Razorpay Checkout
 * with the returned order id. Payment confirmation is trusted only from verified webhooks.
 */
export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = "RAZORPAY" as const;
  readonly supportsAutoRecharge = false;

  constructor(
    private readonly keyId: string,
    private readonly keySecret: string,
    private readonly webhookSecret: string,
  ) {}

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const res = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: input.amountCents,
        currency: input.currency.toUpperCase(),
        receipt: input.paymentId.slice(0, 40),
        notes: { payment_id: input.paymentId, organization_id: input.organizationId },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`Razorpay order creation failed (${res.status})`);
    const order = (await res.json()) as { id: string; amount: number; currency: string };
    return {
      kind: "client",
      providerPaymentId: order.id,
      clientParams: { key: this.keyId, order_id: order.id, amount: order.amount, currency: order.currency, name: "INRENT", description: input.description },
    };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentWebhookEvent> {
    const signature = headers.get("x-razorpay-signature");
    const expected = hmacSha256Hex(this.webhookSecret, rawBody);
    if (!signature || !safeEqual(expected, signature)) throw new PaymentSignatureError();
    const body = JSON.parse(rawBody) as {
      event: string;
      payload?: { payment?: { entity?: { id: string; order_id?: string; amount?: number; currency?: string; error_description?: string } }; order?: { entity?: { id: string; amount_paid?: number; currency?: string } } };
    };
    const eventId = headers.get("x-razorpay-event-id") ?? `${body.event}:${body.payload?.payment?.entity?.id ?? body.payload?.order?.entity?.id}`;
    if (body.event === "order.paid") {
      const order = body.payload?.order?.entity;
      return { eventId, type: "succeeded", rawType: body.event, providerPaymentId: order?.id, amountCents: order?.amount_paid, currency: order?.currency?.toLowerCase() };
    }
    if (body.event === "payment.failed") {
      const p = body.payload?.payment?.entity;
      return { eventId, type: "failed", rawType: body.event, providerPaymentId: p?.order_id, failureReason: p?.error_description ?? "payment_failed" };
    }
    return { eventId, type: "ignored", rawType: body.event };
  }
}
