import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@inrent/db";
import { getBalance } from "../../src/billing";
import { closeQueues } from "../../src/queue";
import { closeRedis } from "../../src/redis";
import {
  PaymentSignatureError,
  processPaymentWebhook,
  setPaymentProvider,
  startCreditPurchase,
  type PaymentProvider,
  type PaymentWebhookEvent,
} from "../../src/payments";
import { createOrg, createUser, resetDatabase } from "../../src/testing";

/** Fake provider: the "signature" header must equal "valid"; the body is the normalized event. */
class FakeProvider implements PaymentProvider {
  readonly name = "STRIPE" as const;
  readonly supportsAutoRecharge = false;
  counter = 0;
  async createCheckout() {
    return { kind: "redirect" as const, url: "https://pay.example/checkout", providerPaymentId: `cs_test_${++this.counter}` };
  }
  async parseWebhook(rawBody: string, headers: Headers): Promise<PaymentWebhookEvent> {
    if (headers.get("signature") !== "valid") throw new PaymentSignatureError();
    return JSON.parse(rawBody) as PaymentWebhookEvent;
  }
}

const provider = new FakeProvider();
beforeEach(async () => {
  await resetDatabase();
  setPaymentProvider("STRIPE", provider);
});
afterAll(async () => {
  setPaymentProvider("STRIPE", null);
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
});

const headers = (sig = "valid") => new Headers({ signature: sig });

describe("payments", () => {
  it("fixes the credit amount server-side at checkout", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const { paymentId, checkout } = await startCreditPurchase(user.id, org.id, { amountCents: 2500 });
    expect(checkout.kind).toBe("redirect");
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    expect(payment.creditsNano).toBe(25_000_000_000n);
    expect(payment.status).toBe("PENDING");
  });

  it("rejects out-of-range amounts and non-billing members", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { org } = await createOrg(owner.id);
    await prisma.membership.create({ data: { organizationId: org.id, userId: viewer.id, role: "VIEWER" } });
    await expect(startCreditPurchase(owner.id, org.id, { amountCents: 100 })).rejects.toThrow(/between/);
    await expect(startCreditPurchase(viewer.id, org.id, { amountCents: 1000 })).rejects.toThrow(/permission/);
  });

  it("cannot duplicate credits — repeated, concurrent and re-sent webhooks grant once", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const { paymentId } = await startCreditPurchase(user.id, org.id, { amountCents: 1000 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const body = (eventId: string) => JSON.stringify({ eventId, type: "succeeded", rawType: "checkout.session.completed", providerPaymentId: payment.providerPaymentId, amountCents: 1000 });

    const results = await Promise.all([
      processPaymentWebhook("STRIPE", body("evt_1"), headers()),
      processPaymentWebhook("STRIPE", body("evt_1"), headers()),
      processPaymentWebhook("STRIPE", body("evt_1"), headers()),
    ].map((p) => p.catch((e) => (e instanceof Error ? "error" : e))));
    // A different event id for the same payment (e.g. async_payment_succeeded) must not double-credit either.
    const again = await processPaymentWebhook("STRIPE", body("evt_2"), headers());

    expect(results.filter((r) => r === "processed")).toHaveLength(1);
    expect(again).toBe("duplicate");
    expect(await getBalance(org.id)).toBe(10_000_000_000n);
    expect(await prisma.creditTransaction.count({ where: { organizationId: org.id, type: "PURCHASE" } })).toBe(1);
  });

  it("rejects forged webhooks", async () => {
    await expect(processPaymentWebhook("STRIPE", "{}", headers("forged"))).rejects.toBeInstanceOf(PaymentSignatureError);
  });

  it("does not grant credits when the paid amount does not match", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const { paymentId } = await startCreditPurchase(user.id, org.id, { amountCents: 5000 });
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await processPaymentWebhook("STRIPE", JSON.stringify({ eventId: "evt_x", type: "succeeded", rawType: "x", providerPaymentId: payment.providerPaymentId, amountCents: 1 }), headers());
    expect(await getBalance(org.id)).toBe(0n);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("FAILED");
  });

  it("records failures and refunds", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const { paymentId } = await startCreditPurchase(user.id, org.id, { amountCents: 1000 });
    const p = await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } });
    await processPaymentWebhook("STRIPE", JSON.stringify({ eventId: "e1", type: "succeeded", rawType: "x", providerPaymentId: p.providerPaymentId, amountCents: 1000 }), headers());
    await processPaymentWebhook("STRIPE", JSON.stringify({ eventId: "e2", type: "refunded", rawType: "x", providerPaymentId: p.providerPaymentId }), headers());
    expect(await getBalance(org.id)).toBe(0n);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: paymentId } })).status).toBe("REFUNDED");
  });
});
