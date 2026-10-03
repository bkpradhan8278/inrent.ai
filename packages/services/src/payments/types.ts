export type PaymentProviderName = "STRIPE" | "RAZORPAY";

export interface CheckoutInput {
  paymentId: string;
  organizationId: string;
  amountCents: number;
  currency: string;
  description: string;
  customerEmail?: string | null;
  customerRef?: string | null;
  saveForAutoRecharge: boolean;
  successUrl: string;
  cancelUrl: string;
}

export type CheckoutResult =
  | { kind: "redirect"; url: string; providerPaymentId: string; customerRef?: string }
  | { kind: "client"; providerPaymentId: string; clientParams: Record<string, string | number> };

export interface PaymentWebhookEvent {
  eventId: string;
  type: "succeeded" | "failed" | "refunded" | "ignored";
  rawType: string;
  providerPaymentId?: string;
  amountCents?: number;
  currency?: string;
  failureReason?: string;
  customerRef?: string;
}

export interface OffSessionChargeInput {
  paymentId: string;
  customerRef: string;
  amountCents: number;
  currency: string;
  description: string;
}

/**
 * Payment provider abstraction. Stripe is the default for international card payments;
 * Razorpay serves India. Additional providers implement this interface.
 */
export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly supportsAutoRecharge: boolean;
  createCheckout(input: CheckoutInput): Promise<CheckoutResult>;
  /** Verifies the signature and normalizes the event. Throws on invalid signatures. */
  parseWebhook(rawBody: string, headers: Headers): Promise<PaymentWebhookEvent>;
  chargeOffSession?(input: OffSessionChargeInput): Promise<{ providerPaymentId: string; status: "succeeded" | "pending" | "failed"; failureReason?: string }>;
}

export class PaymentSignatureError extends Error {
  constructor() {
    super("Invalid payment webhook signature");
    this.name = "PaymentSignatureError";
  }
}

export class PaymentProviderNotConfiguredError extends Error {
  constructor(name: string) {
    super(`Payment provider ${name} is not configured`);
    this.name = "PaymentProviderNotConfiguredError";
  }
}
