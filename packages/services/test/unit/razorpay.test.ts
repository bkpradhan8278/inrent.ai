import { describe, expect, it } from "vitest";
import { hmacSha256Hex } from "@inrent/core/server";
import { PaymentSignatureError, RazorpayPaymentProvider } from "../../src/payments";

const SECRET = "whsec_test";
const provider = new RazorpayPaymentProvider("rzp_test_id", "rzp_test_secret", SECRET);

function signed(body: unknown, eventId = "evt_1") {
  const raw = JSON.stringify(body);
  return { raw, headers: new Headers({ "x-razorpay-signature": hmacSha256Hex(SECRET, raw), "x-razorpay-event-id": eventId }) };
}

describe("Razorpay webhook parsing", () => {
  it("rejects missing or forged signatures", async () => {
    const raw = JSON.stringify({ event: "order.paid" });
    await expect(provider.parseWebhook(raw, new Headers())).rejects.toBeInstanceOf(PaymentSignatureError);
    await expect(provider.parseWebhook(raw, new Headers({ "x-razorpay-signature": "00" }))).rejects.toBeInstanceOf(PaymentSignatureError);
  });

  it("maps order.paid to a success for the order", async () => {
    const { raw, headers } = signed({ event: "order.paid", payload: { order: { entity: { id: "order_1", amount_paid: 84000, currency: "INR" } } } });
    expect(await provider.parseWebhook(raw, headers)).toMatchObject({ eventId: "evt_1", type: "succeeded", providerPaymentId: "order_1", amountCents: 84000, currency: "inr" });
  });

  it("maps payment.failed to the order", async () => {
    const { raw, headers } = signed({ event: "payment.failed", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", error_description: "declined" } } } });
    expect(await provider.parseWebhook(raw, headers)).toMatchObject({ type: "failed", providerPaymentId: "order_1", failureReason: "declined" });
  });

  it("reverses credits only for full refunds", async () => {
    const full = signed({ event: "refund.processed", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", refund_status: "full" } }, refund: { entity: { id: "rfnd_1" } } } }, "evt_2");
    expect(await provider.parseWebhook(full.raw, full.headers)).toMatchObject({ type: "refunded", providerPaymentId: "order_1" });
    const partial = signed({ event: "refund.processed", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", refund_status: "partial" } } } }, "evt_3");
    expect((await provider.parseWebhook(partial.raw, partial.headers)).type).toBe("ignored");
  });
});
