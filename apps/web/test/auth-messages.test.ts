import { describe, expect, it } from "vitest";
import { emailCodeSendError, emailCodeVerifyError, normalizeCodeInput, resendLabel } from "@/lib/auth-messages";

describe("normalizeCodeInput", () => {
  it("keeps digits only and caps the length, so pasted codes fit", () => {
    expect(normalizeCodeInput("123456")).toBe("123456");
    expect(normalizeCodeInput("123 456")).toBe("123456");
    expect(normalizeCodeInput("123-456\n")).toBe("123456");
    expect(normalizeCodeInput("1234567890")).toBe("123456");
    expect(normalizeCodeInput("abc")).toBe("");
  });
});

describe("emailCodeVerifyError", () => {
  it("maps Better Auth codes to specific messages", () => {
    expect(emailCodeVerifyError({ status: 400, code: "INVALID_OTP" })).toMatch(/isn't right/);
    expect(emailCodeVerifyError({ status: 400, code: "OTP_EXPIRED" })).toMatch(/expired/);
    expect(emailCodeVerifyError({ status: 403, code: "TOO_MANY_ATTEMPTS" })).toMatch(/Too many attempts/);
    expect(emailCodeVerifyError({ status: 429 })).toMatch(/Too many attempts/);
  });

  it("explains a server error as a possible sign-up pause (the sign-up hook blocks new accounts)", () => {
    expect(emailCodeVerifyError({ status: 500 })).toMatch(/sign-ups may be paused/);
  });

  it("falls back to a generic message without echoing server text", () => {
    expect(emailCodeVerifyError({ status: 400, message: "database exploded" })).toBe("Could not sign you in. Try again.");
  });
});

describe("emailCodeSendError", () => {
  it("distinguishes rate limits and bad addresses from other failures", () => {
    expect(emailCodeSendError({ status: 429 })).toMatch(/Too many codes/);
    expect(emailCodeSendError({ status: 400, code: "INVALID_EMAIL" })).toMatch(/valid email/);
    expect(emailCodeSendError({ status: 500 })).toBe("Could not send the code. Try again.");
  });
});

describe("resendLabel", () => {
  it("shows the countdown, then the action", () => {
    expect(resendLabel(24)).toBe("Resend in 24s");
    expect(resendLabel(0)).toBe("Resend code");
  });
});
