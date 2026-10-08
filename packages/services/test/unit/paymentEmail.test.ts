import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  add: vi.fn(),
  db: {
    payment: { findUnique: vi.fn(), findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    organization: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    membership: { findMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return h.add(...args);
    }
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));
vi.mock("@inrent/db", () => ({ prisma: h.db }));
vi.mock("../../src/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/authz", () => ({ requireOrgPermission: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/billing", () => ({ grantCredits: vi.fn().mockResolvedValue(undefined), applyLedgerEntry: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/webhooks", () => ({ emitWebhookEvent: vi.fn().mockResolvedValue(0) }));
vi.mock("../../src/notifications", () => ({ notify: vi.fn().mockResolvedValue(true) }));

import { resetServerEnvCache } from "../../src/env";
import { applyPaymentEvent, runAutoRecharge, setPaymentProvider, type PaymentProvider, type PaymentWebhookEvent } from "../../src/payments";
import { formatPaymentAmount } from "../../src/payments/emails";

const ORG = "11111111-1111-4111-8111-111111111111";
const PAY = "44444444-4444-4444-8444-444444444444";

type Row = Record<string, unknown> & { status: string };
let row: Row;
let seenEvents: Set<string>;
let org: Record<string, unknown>;

function newPayment(over: Partial<Row> = {}): Row {
  return {
    id: PAY,
    organizationId: ORG,
    provider: "STRIPE",
    providerPaymentId: "pi_1",
    amountCents: 2500,
    currency: "usd",
    creditsNano: 25_000_000_000n,
    status: "PENDING",
    failureReason: null,
    isAutoRecharge: false,
    createdById: "user-1",
    createdAt: new Date("2026-10-06T14:00:00Z"),
    updatedAt: new Date("2026-10-06T14:00:00Z"),
    ...over,
  };
}

const succeeded = (eventId: string): PaymentWebhookEvent => ({ eventId, type: "succeeded", rawType: "payment_intent.succeeded", providerPaymentId: "pi_1", amountCents: 2500 });
const failed = (eventId: string, failureReason = "Your card was declined."): PaymentWebhookEvent => ({ eventId, type: "failed", rawType: "payment_intent.payment_failed", providerPaymentId: "pi_1", failureReason });

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "inrent.ai");
  vi.stubEnv("APP_URL", "https://inrent.ai");
  resetServerEnvCache();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  h.add.mockReset().mockResolvedValue(undefined);
  row = newPayment();
  seenEvents = new Set();
  org = { id: ORG, name: "Acme", billingEmail: null };

  // A just-enough in-memory payment table: unique event ids, status updates, one transaction at a time.
  const tx = {
    $executeRaw: async (_s: TemplateStringsArray, ...v: unknown[]) => {
      const key = `${String(v[0])}:${String(v[1])}`;
      if (seenEvents.has(key)) return 0;
      seenEvents.add(key);
      return 1;
    },
    payment: {
      findUniqueOrThrow: async () => ({ ...row }),
      update: async ({ data }: { data: Record<string, unknown> }) => {
        Object.assign(row, data, { updatedAt: new Date("2026-10-06T14:05:00Z") });
        return { ...row };
      },
    },
  };
  h.db.$transaction.mockImplementation(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));
  h.db.payment.findUnique.mockImplementation(async () => ({ ...row }));
  h.db.payment.findUniqueOrThrow.mockImplementation(async () => ({ ...row }));
  h.db.organization.findUnique.mockImplementation(async () => org);
  h.db.user.findUnique.mockResolvedValue({ name: "Asha", email: "asha@example.com", deletedAt: null });
  h.db.membership.findMany.mockResolvedValue([]);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  setPaymentProvider("STRIPE", null);
});

describe("payment receipt email", () => {
  it("queues exactly one receipt even when the webhook is replayed", async () => {
    expect(await applyPaymentEvent("STRIPE", succeeded("evt_1"))).toBe("processed");
    expect(await applyPaymentEvent("STRIPE", succeeded("evt_1"))).toBe("duplicate"); // provider retry
    expect(await applyPaymentEvent("STRIPE", succeeded("evt_2"))).toBe("duplicate"); // second event for the same payment

    expect(h.add).toHaveBeenCalledTimes(1);
    const [jobName, job, opts] = h.add.mock.calls[0]!;
    expect(jobName).toBe("payment_receipt");
    expect(opts.jobId).toBe(`email:payment_receipt:${PAY}`);
    expect(job).toEqual({
      to: "asha@example.com",
      template: "payment_receipt",
      data: {
        name: "Asha",
        amountFormatted: "$25.00",
        creditsFormatted: "$25.00",
        method: "Stripe",
        reference: PAY,
        paidAtIso: "2026-10-06T14:05:00.000Z",
        workspaceName: "Acme",
        billingUrl: "https://app.inrent.ai/billing",
      },
    });
  });

  it("formats an INR payment in rupees while crediting USD", async () => {
    row = newPayment({ provider: "RAZORPAY", currency: "inr", amountCents: 207_500 });
    await applyPaymentEvent("RAZORPAY", { ...succeeded("evt_r1"), amountCents: 207_500 });
    const { data } = h.add.mock.calls[0]![1];
    expect(data.amountFormatted).toBe("₹2,075.00");
    expect(data.creditsFormatted).toBe("$25.00");
    expect(data.method).toBe("Razorpay");
  });

  it("does not fail the webhook when the queue is down", async () => {
    h.add.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(applyPaymentEvent("STRIPE", succeeded("evt_1"))).resolves.toBe("processed");
    expect(row.status).toBe("SUCCEEDED");
  });

  it("does not fail the webhook when the recipient lookup throws", async () => {
    h.db.organization.findUnique.mockRejectedValue(new Error("db down"));
    await expect(applyPaymentEvent("STRIPE", succeeded("evt_1"))).resolves.toBe("processed");
    expect(h.add).not.toHaveBeenCalled();
  });

  it("falls back from a phone-only initiator to the billing email, then to an owner", async () => {
    h.db.user.findUnique.mockResolvedValue({ name: "Phone user", email: "919876543210@phone.inrent.invalid", deletedAt: null });
    org = { id: ORG, name: "Acme", billingEmail: "billing@acme.test" };
    await applyPaymentEvent("STRIPE", succeeded("evt_1"));
    expect(h.add.mock.calls[0]![1]).toMatchObject({ to: "billing@acme.test", data: { name: "" } });

    h.add.mockClear();
    row = newPayment();
    org = { id: ORG, name: "Acme", billingEmail: null };
    h.db.membership.findMany.mockResolvedValue([
      { user: { name: "Phone owner", email: "919800000000@phone.inrent.invalid" } },
      { user: { name: "Olu Owner", email: "owner@acme.test" } },
    ]);
    await applyPaymentEvent("STRIPE", succeeded("evt_2"));
    expect(h.add.mock.calls[0]![1]).toMatchObject({ to: "owner@acme.test", data: { name: "Olu Owner" } });
  });

  it("sends nothing when nobody has a real address", async () => {
    h.db.user.findUnique.mockResolvedValue({ name: "Phone user", email: "919876543210@phone.inrent.invalid", deletedAt: null });
    await applyPaymentEvent("STRIPE", succeeded("evt_1"));
    expect(h.add).not.toHaveBeenCalled();
  });
});

describe("payment failed email", () => {
  it("queues one notice for a failed user payment, once across replays", async () => {
    expect(await applyPaymentEvent("STRIPE", failed("evt_f1"))).toBe("processed");
    expect(await applyPaymentEvent("STRIPE", failed("evt_f1"))).toBe("duplicate");
    expect(await applyPaymentEvent("STRIPE", failed("evt_f2"))).toBe("duplicate");
    expect(h.add).toHaveBeenCalledTimes(1);
    const [jobName, job, opts] = h.add.mock.calls[0]!;
    expect(jobName).toBe("payment_failed");
    expect(opts.jobId).toBe(`email:payment_failed:${PAY}`);
    expect(job.data).toEqual({ name: "Asha", amountFormatted: "$25.00", reason: "Your card was declined.", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" });
  });

  it("does not email an amount mismatch, which is for us rather than the customer", async () => {
    await applyPaymentEvent("STRIPE", { ...succeeded("evt_m"), amountCents: 1 });
    expect(row.status).toBe("FAILED");
    expect(h.add).not.toHaveBeenCalled();
  });

  it("emails an auto-recharge failure at most once per workspace per day", async () => {
    org = { id: ORG, name: "Acme", billingEmail: "billing@acme.test" };
    row = newPayment({ isAutoRecharge: true, createdById: null });
    await applyPaymentEvent("STRIPE", failed("evt_a1"));
    const firstId = h.add.mock.calls[0]![2].jobId as string;
    expect(firstId).toMatch(new RegExp(`^email:payment_failed:ar-${ORG}-\\d{8}$`));
    expect(h.add.mock.calls[0]![1].to).toBe("billing@acme.test");

    // The next sweep creates a new failed payment; it resolves to the same job id, so BullMQ drops it.
    row = newPayment({ id: "55555555-5555-4555-8555-555555555555", providerPaymentId: "pi_1", isAutoRecharge: true, createdById: null });
    await applyPaymentEvent("STRIPE", failed("evt_a2"));
    expect(h.add.mock.calls[1]![2].jobId).toBe(firstId);
  });

  it("emails when an off-session auto-recharge is declined immediately", async () => {
    org = { id: ORG, name: "Acme", billingEmail: "billing@acme.test", autoRechargeEnabled: true, autoRechargeAmountNano: 10_000_000_000n, autoRechargeThresholdNano: 5_000_000_000n, billingCustomerRef: "cus_1", billingProvider: "STRIPE", creditBalance: { balanceNano: 0n } };
    h.db.payment.findFirst.mockResolvedValue(null);
    h.db.payment.create.mockImplementation(async ({ data }: { data: Row }) => {
      row = newPayment({ ...data, status: "PENDING", id: PAY });
      return { ...row };
    });
    h.db.payment.update.mockResolvedValue({});
    const provider: PaymentProvider = {
      name: "STRIPE",
      supportsAutoRecharge: true,
      createCheckout: vi.fn(),
      parseWebhook: vi.fn(),
      chargeOffSession: vi.fn().mockResolvedValue({ providerPaymentId: "pi_x", status: "failed", failureReason: "Card declined." }),
    };
    setPaymentProvider("STRIPE", provider);
    await expect(runAutoRecharge(ORG)).resolves.toBe("failed");
    expect(h.add).toHaveBeenCalledTimes(1);
    const [jobName, job] = h.add.mock.calls[0]!;
    expect(jobName).toBe("payment_failed");
    expect(job.data).toMatchObject({ reason: "Card declined.", amountFormatted: "$10.00" });
  });
});

describe("formatPaymentAmount", () => {
  it("uses the currency's minor unit and grouping", () => {
    expect(formatPaymentAmount(2500, "usd")).toBe("$25.00");
    expect(formatPaymentAmount(207_500, "INR")).toBe("₹2,075.00");
    expect(formatPaymentAmount(10_000_000, "inr")).toBe("₹1,00,000.00");
    expect(formatPaymentAmount(5000, "jpy")).toBe("¥5,000");
  });
  it("falls back to the raw figure for a currency code Intl rejects", () => {
    expect(formatPaymentAmount(1234, "zz-bad")).toBe("12.34 ZZ-BAD");
  });
});
