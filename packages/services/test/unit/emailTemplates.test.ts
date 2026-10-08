import { describe, expect, it } from "vitest";
import { renderEmail } from "../../src/email";
import {
  apiKeyCreatedEmail,
  formatDateTimeUtc,
  paymentFailedEmail,
  paymentReceiptEmail,
  signInCodeEmail,
  welcomeEmail,
} from "../../src/emailTemplates";

const XSS = '<script>alert("x")</script>';

describe("formatDateTimeUtc", () => {
  it("formats in UTC", () => {
    expect(formatDateTimeUtc("2026-10-06T14:05:00Z")).toBe("6 Oct 2026, 14:05 UTC");
    expect(formatDateTimeUtc("2026-01-31T23:59:59+02:00")).toBe("31 Jan 2026, 21:59 UTC");
  });
  it("returns unparseable input unchanged", () => {
    expect(formatDateTimeUtc("not a date")).toBe("not a date");
  });
});

describe("email templates", () => {
  it("welcomeEmail has three numbered steps and an Open dashboard CTA", () => {
    const t = welcomeEmail({ name: "Asha", dashboardUrl: "https://app.inrent.ai", docsUrl: "https://docs.inrent.ai" });
    expect(t.steps).toHaveLength(3);
    expect(t.action).toEqual({ label: "Open dashboard", url: "https://app.inrent.ai" });
    const { html, text } = renderEmail(t);
    expect(html).toContain("Hi Asha,");
    expect(text).toContain("1. Create an API key");
    expect(text).toContain("Docs: https://docs.inrent.ai");
  });

  it("apiKeyCreatedEmail shows only the prefix and never a full secret", () => {
    const secret = "sk-inrent-live-ab12" + "Z9yXwVuTsRqPoNmLkJiHgFeDcBa0123456789";
    const t = apiKeyCreatedEmail({
      name: "Asha",
      keyName: "CI key",
      keyPrefix: secret, // simulate a caller passing far more than a prefix
      workspaceName: "Acme",
      createdAtIso: "2026-10-06T14:05:00Z",
      manageUrl: "https://app.inrent.ai/keys",
    });
    const { html, text } = renderEmail(t);
    for (const out of [html, text, t.subject]) expect(out).not.toContain(secret);
    expect(JSON.stringify(t)).not.toContain(secret);
    expect(text).toContain("sk-inrent-live-ab12");
    expect(text).toContain("6 Oct 2026, 14:05 UTC");
    expect(t.action?.label).toMatch(/revoke/i);
    expect(t.note).toMatch(/never email the full key/);
  });

  it("apiKeyCreatedEmail words a rotation differently", () => {
    const t = apiKeyCreatedEmail({ name: "A", keyName: "k", keyPrefix: "sk-inrent-live-ab12", workspaceName: "W", createdAtIso: "2026-10-06T14:05:00Z", manageUrl: "https://x.test/k", rotated: true });
    expect(t.subject).toMatch(/rotated/);
    expect(renderEmail(t).text).toContain("Rotated: 6 Oct 2026");
  });

  it("paymentReceiptEmail lists receipt rows and omits missing optional ones", () => {
    const full = renderEmail(
      paymentReceiptEmail({ name: "A", amountFormatted: "$25.00", creditsFormatted: "25,000 credits", method: "Visa ending 4242", reference: "pi_123", paidAtIso: "2026-10-06T14:05:00Z", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" }),
    );
    for (const s of ["$25.00", "25,000 credits", "Visa ending 4242", "pi_123", "Acme", "6 Oct 2026, 14:05 UTC"]) expect(full.text).toContain(s);
    const minimal = renderEmail(
      paymentReceiptEmail({ name: "A", amountFormatted: "$25.00", reference: "pi_123", paidAtIso: "2026-10-06T14:05:00Z", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" }),
    );
    expect(minimal.text).not.toContain("Credits added");
    expect(minimal.text).not.toContain("Payment method");
  });

  it("paymentFailedEmail works with and without amount and reason", () => {
    const bare = paymentFailedEmail({ name: "", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" });
    expect(renderEmail(bare).text).toContain("Hi there,");
    const rich = renderEmail(paymentFailedEmail({ name: "A", amountFormatted: "$25.00", reason: "card_declined", workspaceName: "Acme", billingUrl: "https://app.inrent.ai/billing" }));
    expect(rich.text).toContain("$25.00");
    expect(rich.text).toContain("card_declined");
  });

  it("signInCodeEmail puts the code in html and text with expiry and safety copy", () => {
    for (const purpose of ["sign-in", "email-verification", "forget-password"] as const) {
      const t = signInCodeEmail({ code: "482913", expiresInMinutes: 5, purpose });
      const { html, text } = renderEmail(t);
      expect(html).toContain("482913");
      expect(text).toContain("482913");
      expect(text).toContain("5 minutes");
      expect(text).toMatch(/never share this code/i);
      expect(text).toMatch(/didn't request/i);
    }
    expect(signInCodeEmail({ code: "1", expiresInMinutes: 1, purpose: "sign-in" }).intro).toContain("1 minute.");
  });

  it("escapes hostile values in every template field", () => {
    const urls = { dashboardUrl: "https://app.inrent.ai", docsUrl: "https://docs.inrent.ai" };
    const outputs = [
      welcomeEmail({ name: XSS, ...urls }),
      apiKeyCreatedEmail({ name: XSS, keyName: XSS, keyPrefix: XSS, workspaceName: XSS, createdAtIso: XSS, manageUrl: "https://app.inrent.ai/keys" }),
      paymentReceiptEmail({ name: XSS, amountFormatted: XSS, creditsFormatted: XSS, method: XSS, reference: XSS, paidAtIso: XSS, workspaceName: XSS, billingUrl: "https://app.inrent.ai/billing" }),
      paymentFailedEmail({ name: XSS, amountFormatted: XSS, reason: XSS, workspaceName: XSS, billingUrl: "https://app.inrent.ai/billing" }),
      signInCodeEmail({ code: XSS, expiresInMinutes: 5, purpose: "sign-in" }),
    ].map((t) => renderEmail(t).html);
    for (const html of outputs) {
      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
    }
  });

  it("rejects non-http(s) CTA URLs passed to templates", () => {
    expect(() => renderEmail(welcomeEmail({ name: "A", dashboardUrl: "javascript:alert(1)", docsUrl: "https://docs.inrent.ai" }))).toThrow(/http/);
    expect(() => renderEmail(paymentFailedEmail({ name: "A", workspaceName: "W", billingUrl: "data:text/html,x" }))).toThrow(/http/);
  });
});
