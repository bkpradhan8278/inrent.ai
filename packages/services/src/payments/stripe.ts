import Stripe from "stripe";
import {
  PaymentSignatureError,
  type CheckoutInput,
  type CheckoutResult,
  type OffSessionChargeInput,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from "./types";

export class StripePaymentProvider implements PaymentProvider {
  readonly name = "STRIPE" as const;
  readonly supportsAutoRecharge = true;
  private readonly stripe: Stripe;

  constructor(
    secretKey: string,
    private readonly webhookSecret: string,
  ) {
    this.stripe = new Stripe(secretKey, { maxNetworkRetries: 2, timeout: 20_000 });
  }

  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    let customer = input.customerRef ?? undefined;
    if (!customer && input.saveForAutoRecharge) {
      const created = await this.stripe.customers.create({
        email: input.customerEmail ?? undefined,
        metadata: { organization_id: input.organizationId },
      });
      customer = created.id;
    }
    const session = await this.stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer,
        customer_email: customer ? undefined : (input.customerEmail ?? undefined),
        client_reference_id: input.paymentId,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: input.currency,
              unit_amount: input.amountCents,
              product_data: { name: "INRENT credits", description: input.description },
            },
          },
        ],
        payment_intent_data: {
          metadata: { payment_id: input.paymentId, organization_id: input.organizationId },
          ...(input.saveForAutoRecharge ? { setup_future_usage: "off_session" as const } : {}),
        },
        metadata: { payment_id: input.paymentId, organization_id: input.organizationId },
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      },
      { idempotencyKey: `checkout:${input.paymentId}` },
    );
    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    return { kind: "redirect", url: session.url, providerPaymentId: session.id, customerRef: customer };
  }

  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentWebhookEvent> {
    const signature = headers.get("stripe-signature");
    if (!signature) throw new PaymentSignatureError();
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch {
      throw new PaymentSignatureError();
    }
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const s = event.data.object;
        if (s.payment_status !== "paid") return { eventId: event.id, type: "ignored", rawType: event.type };
        return {
          eventId: event.id,
          type: "succeeded",
          rawType: event.type,
          providerPaymentId: s.id,
          amountCents: s.amount_total ?? undefined,
          currency: s.currency ?? undefined,
          customerRef: typeof s.customer === "string" ? s.customer : s.customer?.id,
        };
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const s = event.data.object;
        return { eventId: event.id, type: "failed", rawType: event.type, providerPaymentId: s.id, failureReason: event.type };
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        // Only off-session (auto-recharge) intents are tracked by intent id.
        if (pi.metadata?.auto_recharge !== "true") return { eventId: event.id, type: "ignored", rawType: event.type };
        return { eventId: event.id, type: "succeeded", rawType: event.type, providerPaymentId: pi.id, amountCents: pi.amount_received, currency: pi.currency };
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        if (pi.metadata?.auto_recharge !== "true") return { eventId: event.id, type: "ignored", rawType: event.type };
        return { eventId: event.id, type: "failed", rawType: event.type, providerPaymentId: pi.id, failureReason: pi.last_payment_error?.message ?? "payment_failed" };
      }
      default:
        return { eventId: event.id, type: "ignored", rawType: event.type };
    }
  }

  async chargeOffSession(input: OffSessionChargeInput) {
    const methods = await this.stripe.paymentMethods.list({ customer: input.customerRef, type: "card", limit: 1 });
    const method = methods.data[0];
    if (!method) return { providerPaymentId: "", status: "failed" as const, failureReason: "no_saved_payment_method" };
    try {
      const pi = await this.stripe.paymentIntents.create(
        {
          amount: input.amountCents,
          currency: input.currency,
          customer: input.customerRef,
          payment_method: method.id,
          off_session: true,
          confirm: true,
          description: input.description,
          metadata: { payment_id: input.paymentId, auto_recharge: "true" },
        },
        { idempotencyKey: `auto-recharge:${input.paymentId}` },
      );
      return { providerPaymentId: pi.id, status: pi.status === "succeeded" ? ("succeeded" as const) : ("pending" as const) };
    } catch (e) {
      const message = e instanceof Error ? e.message : "charge_failed";
      return { providerPaymentId: "", status: "failed" as const, failureReason: message.slice(0, 200) };
    }
  }
}
