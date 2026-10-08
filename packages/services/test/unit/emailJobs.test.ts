import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ add: vi.fn() }));

// No Redis: the Queue is a stand-in whose add() the tests control.
vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return h.add(...args);
    }
    close() {
      return Promise.resolve();
    }
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));

import { UnrecoverableError } from "bullmq";
import { renderEmail } from "../../src/email";
import { DEFAULT_JOB_OPTIONS, emailFromJob, enqueueEmail } from "../../src/queue";

beforeEach(() => {
  h.add.mockReset();
  h.add.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("emailFromJob", () => {
  it("renders api_key_created with the prefix and the rotated wording", () => {
    const data = { name: "Asha", keyName: "CI key", keyPrefix: "sk-inrent-prod-a1B2", workspaceName: "Acme", createdAtIso: "2026-10-06T14:05:00Z", manageUrl: "https://app.inrent.ai/keys" };
    const created = emailFromJob({ template: "api_key_created", data });
    expect(created.subject).toBe("A new INRENT API key was created");
    const { html, text } = renderEmail(created);
    expect(html).toContain("sk-inrent-prod-a1B2");
    expect(text).toContain("Hi Asha,");
    expect(text).toContain("https://app.inrent.ai/keys");
    expect(text).toContain("6 Oct 2026, 14:05 UTC");

    expect(emailFromJob({ template: "api_key_created", data: { ...data, rotated: "true" } }).subject).toBe("An INRENT API key was rotated");
  });

  it("renders payment_receipt", () => {
    const mail = emailFromJob({
      template: "payment_receipt",
      data: { name: "Asha", amountFormatted: "₹2,075.00", creditsFormatted: "$25.00", method: "Razorpay", reference: "pay-123", paidAtIso: "2026-10-06T14:05:00Z", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" },
    });
    expect(mail.subject).toBe("Receipt for your ₹2,075.00 INRENT payment");
    const { text } = renderEmail(mail);
    expect(text).toContain("Credits added: $25.00");
    expect(text).toContain("Payment method: Razorpay");
    expect(text).toContain("Reference: pay-123");
  });

  it("renders payment_failed, leaving out unset optional fields", () => {
    const mail = emailFromJob({ template: "payment_failed", data: { name: "", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing", reason: "Your card was declined." } });
    const { text } = renderEmail(mail);
    expect(text).toContain("Hi there,");
    expect(text).toContain("Reason from the payment provider: Your card was declined.");
    expect(text).not.toContain("undefined");
  });

  it("keeps the generic subject/title/intro path for jobs queued before named templates", () => {
    expect(emailFromJob({ template: "notice", data: { subject: "S", title: "T", intro: "I", actionUrl: "https://x.test/a", actionLabel: "Go" } })).toEqual({
      subject: "S",
      title: "T",
      intro: "I",
      action: { label: "Go", url: "https://x.test/a" },
    });
    expect(emailFromJob({ template: "whatever", data: {} })).toEqual({ subject: "INRENT", title: "INRENT", intro: "", action: undefined });
  });

  it("fails permanently when a named job lacks required data", () => {
    expect(() => emailFromJob({ template: "payment_receipt", data: { name: "Asha" } })).toThrow(UnrecoverableError);
    expect(() => emailFromJob({ template: "payment_receipt", data: { name: "Asha" } })).toThrow(/amountFormatted/);
  });
});

describe("enqueueEmail", () => {
  const data = { name: "Asha", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing", amountFormatted: undefined };

  it("queues a typed job with a deterministic id and string-only data", async () => {
    await expect(enqueueEmail("asha@example.com", "payment_failed", data, { jobId: "email:payment_failed:p1" })).resolves.toBe(true);
    const [jobName, payload, opts] = h.add.mock.calls[0]!;
    expect(jobName).toBe("payment_failed");
    expect(payload).toEqual({ to: "asha@example.com", template: "payment_failed", data: { name: "Asha", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" } });
    expect(opts).toMatchObject({ ...DEFAULT_JOB_OPTIONS, jobId: "email:payment_failed:p1" });
  });

  it("sends booleans as strings", async () => {
    await enqueueEmail("asha@example.com", "api_key_created", { name: "A", keyName: "k", keyPrefix: "p", workspaceName: "W", createdAtIso: "2026-10-06T00:00:00Z", manageUrl: "https://x.test", rotated: true });
    expect(h.add.mock.calls[0]![1].data.rotated).toBe("true");
  });

  it("skips placeholder phone-only addresses", async () => {
    await expect(enqueueEmail("919876543210@phone.inrent.invalid", "payment_failed", data)).resolves.toBe(false);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("does not throw when the queue rejects, and does not log the recipient", async () => {
    h.add.mockRejectedValue(new Error("ECONNREFUSED"));
    await expect(enqueueEmail("asha@example.com", "payment_failed", data)).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("ECONNREFUSED"));
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("asha@example.com");
  });

  it("gives up on a queue that never answers (Redis down) instead of stalling the caller", async () => {
    vi.useFakeTimers();
    h.add.mockReturnValue(new Promise(() => undefined));
    const pending = enqueueEmail("asha@example.com", "payment_failed", data);
    await vi.advanceTimersByTimeAsync(2_100);
    await expect(pending).resolves.toBe(false);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("timed out"));
  });
});
