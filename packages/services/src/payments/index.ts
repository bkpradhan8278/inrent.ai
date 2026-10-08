import { prisma, type PaymentProviderType } from "@inrent/db";
import { centsToNano, formatUsd } from "@inrent/core";
import { recordAudit } from "../audit";
import { requireOrgPermission } from "../authz";
import { applyLedgerEntry, grantCredits } from "../billing";
import { getServerEnv } from "../env";
import { ValidationError } from "../errors";
import { emitWebhookEvent } from "../webhooks";
import { notify } from "../notifications";
import { queuePaymentEmail } from "./emails";
import { RazorpayPaymentProvider } from "./razorpay";
import { StripePaymentProvider } from "./stripe";
import { PaymentProviderNotConfiguredError, type PaymentProvider, type PaymentWebhookEvent } from "./types";

export * from "./types";
export { StripePaymentProvider, RazorpayPaymentProvider };

export const CREDIT_PRESETS_USD = [5, 10, 25, 50, 100] as const;
export const MIN_PURCHASE_CENTS = 500;
export const MAX_PURCHASE_CENTS = 1_000_000;

const providers = new Map<PaymentProviderType, PaymentProvider>();

/** Override for tests. */
export function setPaymentProvider(name: PaymentProviderType, provider: PaymentProvider | null) {
  if (provider) providers.set(name, provider);
  else providers.delete(name);
}

export function configuredPaymentProviders(): PaymentProviderType[] {
  const list: PaymentProviderType[] = [];
  if (providers.has("STRIPE") || (process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET)) list.push("STRIPE");
  if (providers.has("RAZORPAY") || (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET && process.env.RAZORPAY_WEBHOOK_SECRET)) list.push("RAZORPAY");
  return list;
}

export function getPaymentProvider(name: PaymentProviderType): PaymentProvider {
  const existing = providers.get(name);
  if (existing) return existing;
  let provider: PaymentProvider;
  if (name === "STRIPE") {
    const key = process.env.STRIPE_SECRET_KEY;
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!key || !secret) throw new PaymentProviderNotConfiguredError(name);
    provider = new StripePaymentProvider(key, secret);
  } else {
    const id = process.env.RAZORPAY_KEY_ID;
    const key = process.env.RAZORPAY_KEY_SECRET;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!id || !key || !secret) throw new PaymentProviderNotConfiguredError(name);
    provider = new RazorpayPaymentProvider(id, key, secret);
  }
  providers.set(name, provider);
  return provider;
}

/**
 * Starts a credit purchase. The amount is validated and the credit value fixed server-side
 * before the customer is sent to the payment provider; the client never decides credits.
 */
export async function startCreditPurchase(userId: string, organizationId: string, input: { amountCents: number; provider?: PaymentProviderType }) {
  await requireOrgPermission(userId, organizationId, "billing:manage");
  if (!Number.isInteger(input.amountCents) || input.amountCents < MIN_PURCHASE_CENTS || input.amountCents > MAX_PURCHASE_CENTS) {
    throw new ValidationError("Choose an amount between $5 and $10,000.");
  }
  const providerName = input.provider ?? "STRIPE";
  const provider = getPaymentProvider(providerName);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  // Razorpay settles in INR; credits are USD-denominated, so INR checkout needs a configured FX rate.
  const currency = providerName === "RAZORPAY" ? "inr" : "usd";
  let chargeAmount = input.amountCents;
  if (currency === "inr") {
    const rate = Number(process.env.RAZORPAY_USD_INR_RATE);
    if (!Number.isFinite(rate) || rate <= 0) throw new PaymentProviderNotConfiguredError("RAZORPAY (RAZORPAY_USD_INR_RATE)");
    chargeAmount = Math.round(input.amountCents * rate);
  }
  const payment = await prisma.payment.create({
    data: {
      organizationId,
      provider: providerName,
      providerPaymentId: `pending:${crypto.randomUUID()}`,
      amountCents: chargeAmount,
      currency,
      creditsNano: centsToNano(input.amountCents),
      status: "PENDING",
      createdById: userId,
    },
  });
  const appUrl = getServerEnv().APP_URL;
  const checkout = await provider.createCheckout({
    paymentId: payment.id,
    organizationId,
    amountCents: chargeAmount,
    currency,
    description: `${formatUsd(centsToNano(input.amountCents))} of INRENT credits`,
    customerEmail: org.billingEmail ?? user.email,
    customerRef: org.billingProvider === providerName ? org.billingCustomerRef : null,
    saveForAutoRecharge: provider.supportsAutoRecharge && org.autoRechargeEnabled,
    successUrl: `${appUrl}/dashboard/billing?payment=success`,
    cancelUrl: `${appUrl}/dashboard/billing?payment=cancelled`,
  });
  await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: checkout.providerPaymentId } });
  if (checkout.kind === "redirect" && checkout.customerRef && checkout.customerRef !== org.billingCustomerRef) {
    await prisma.organization.update({ where: { id: organizationId }, data: { billingCustomerRef: checkout.customerRef, billingProvider: providerName } });
  }
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "billing.checkout_started", targetType: "payment", targetId: payment.id, metadata: { amountCents: input.amountCents, provider: providerName } });
  return { paymentId: payment.id, checkout };
}

export type WebhookOutcome = "processed" | "duplicate" | "ignored" | "unknown_payment";

/**
 * Processes a verified payment webhook exactly once. The event id is recorded in the same
 * transaction as the credit grant, and the grant itself is idempotent on the payment id,
 * so retries, duplicates and out-of-order deliveries can never double-credit.
 */
export async function processPaymentWebhook(providerName: PaymentProviderType, rawBody: string, headers: Headers): Promise<WebhookOutcome> {
  const provider = getPaymentProvider(providerName);
  const event = await provider.parseWebhook(rawBody, headers);
  if (event.type === "ignored" || !event.providerPaymentId) {
    return "ignored";
  }
  return applyPaymentEvent(providerName, event);
}

export async function applyPaymentEvent(providerName: PaymentProviderType, event: PaymentWebhookEvent): Promise<WebhookOutcome> {
  const payment = await prisma.payment.findUnique({
    where: { provider_providerPaymentId: { provider: providerName, providerPaymentId: event.providerPaymentId! } },
  });
  if (!payment) return "unknown_payment";

  const outcome = await prisma.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "PaymentEvent" ("id", "provider", "eventId", "type", "processedAt")
      VALUES (gen_random_uuid(), ${providerName}::"PaymentProviderType", ${event.eventId}, ${event.rawType}, now())
      ON CONFLICT ("provider", "eventId") DO NOTHING`;
    if (inserted === 0) return "duplicate" as const;

    const current = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (event.type === "succeeded") {
      if (current.status === "SUCCEEDED" || current.status === "REFUNDED") return "duplicate" as const;
      if (event.amountCents !== undefined && event.amountCents !== current.amountCents) {
        await tx.payment.update({ where: { id: current.id }, data: { status: "FAILED", failureReason: `amount_mismatch:${event.amountCents}` } });
        return "processed" as const;
      }
      await tx.payment.update({ where: { id: current.id }, data: { status: "SUCCEEDED" } });
      await grantCredits(
        {
          organizationId: current.organizationId,
          type: current.isAutoRecharge ? "AUTO_RECHARGE" : "PURCHASE",
          amountNano: current.creditsNano,
          description: `${current.isAutoRecharge ? "Auto-recharge" : "Credit purchase"} — ${formatUsd(current.creditsNano)}`,
          idempotencyKey: `payment:${current.id}`,
          paymentId: current.id,
        },
        tx,
      );
    } else if (event.type === "failed") {
      if (current.status !== "PENDING") return "duplicate" as const;
      await tx.payment.update({ where: { id: current.id }, data: { status: "FAILED", failureReason: event.failureReason?.slice(0, 200) } });
    } else if (event.type === "refunded") {
      if (current.status !== "SUCCEEDED") return "duplicate" as const;
      await tx.payment.update({ where: { id: current.id }, data: { status: "REFUNDED" } });
      await applyLedgerEntry(
        {
          organizationId: current.organizationId,
          type: "REFUND",
          amountNano: -current.creditsNano,
          description: `Refund of payment ${current.id.slice(0, 8)}`,
          idempotencyKey: `refund:${current.id}`,
          paymentId: current.id,
        },
        tx,
      );
    }
    return "processed" as const;
  });

  if (outcome === "processed") {
    const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const type = fresh.status === "SUCCEEDED" ? "payment.success" : fresh.status === "FAILED" ? "payment.failed" : null;
    if (type) {
      await emitWebhookEvent(fresh.organizationId, type, { payment_id: fresh.id, amount_cents: fresh.amountCents, currency: fresh.currency, status: fresh.status.toLowerCase() }).catch(() => undefined);
      await notify({
        organizationId: fresh.organizationId,
        type,
        title: type === "payment.success" ? "Payment received" : "Payment failed",
        body: type === "payment.success" ? `${formatUsd(fresh.creditsNano)} in credits were added.` : `Your payment could not be completed${fresh.failureReason ? `: ${fresh.failureReason}` : "."}`,
        link: "/dashboard/billing",
        dedupeKey: `${type}:${fresh.id}`,
      }).catch(() => undefined);
      // `processed` only comes back for the call that made the transition, so this is once per payment.
      await queuePaymentEmail(fresh, type === "payment.success" ? "receipt" : "failed");
    }
  }
  return outcome;
}

/**
 * Off-session auto-recharge. Requires the organization's explicit opt-in, a saved payment
 * method and a configured threshold. Guarded so concurrent triggers create one charge.
 */
export async function runAutoRecharge(organizationId: string): Promise<"charged" | "skipped" | "failed"> {
  const org = await prisma.organization.findUnique({ where: { id: organizationId }, include: { creditBalance: true } });
  if (!org || !org.autoRechargeEnabled || !org.autoRechargeAmountNano || org.autoRechargeThresholdNano === null) return "skipped";
  if (!org.billingCustomerRef || !org.billingProvider) return "skipped";
  const balance = org.creditBalance?.balanceNano ?? 0n;
  if (balance >= (org.autoRechargeThresholdNano ?? 0n)) return "skipped";
  const recent = await prisma.payment.findFirst({
    where: { organizationId, isAutoRecharge: true, status: "PENDING", createdAt: { gt: new Date(Date.now() - 15 * 60_000) } },
  });
  if (recent) return "skipped";
  const provider = getPaymentProvider(org.billingProvider as PaymentProviderType);
  if (!provider.chargeOffSession) return "skipped";
  const amountCents = Number(org.autoRechargeAmountNano / 10_000_000n);
  const payment = await prisma.payment.create({
    data: {
      organizationId,
      provider: org.billingProvider as PaymentProviderType,
      providerPaymentId: `pending:${crypto.randomUUID()}`,
      amountCents,
      currency: "usd",
      creditsNano: org.autoRechargeAmountNano,
      status: "PENDING",
      isAutoRecharge: true,
    },
  });
  const result = await provider.chargeOffSession({
    paymentId: payment.id,
    customerRef: org.billingCustomerRef,
    amountCents,
    currency: "usd",
    description: "INRENT auto-recharge",
  });
  if (result.status === "failed") {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: "FAILED", failureReason: result.failureReason, providerPaymentId: result.providerPaymentId || payment.providerPaymentId } });
    await notify({ organizationId, type: "payment.failed", title: "Auto-recharge failed", body: result.failureReason ?? "The saved payment method was declined.", link: "/dashboard/billing", dedupeKey: `auto-recharge-failed:${payment.id}` });
    await queuePaymentEmail({ ...payment, status: "FAILED", failureReason: result.failureReason ?? null }, "failed");
    return "failed";
  }
  await prisma.payment.update({ where: { id: payment.id }, data: { providerPaymentId: result.providerPaymentId } });
  // Credits are granted when the verified payment_intent.succeeded webhook arrives.
  return "charged";
}
