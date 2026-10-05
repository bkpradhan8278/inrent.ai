import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlaceholderEmail, sendTemplateEmail } from "../../src/email";
import type { RateLimitStore } from "@inrent/core";
import { consumeSignInCodeQuota, getSmsProvider, isAllowedSignInPhoneNumber, placeholderEmailForPhone, placeholderNameForPhone, resetSmsProviderCache } from "../../src/sms";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  resetSmsProviderCache();
});

describe("sms provider", () => {
  it("is off until SMS_PROVIDER is set", () => {
    vi.stubEnv("SMS_PROVIDER", "");
    expect(getSmsProvider()).toBeNull();
  });

  it("refuses the console provider in production", () => {
    vi.stubEnv("SMS_PROVIDER", "console");
    vi.stubEnv("INRENT_ENV", "production");
    expect(() => getSmsProvider()).toThrow(/production/);
  });

  it("requires Twilio credentials", () => {
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    expect(() => getSmsProvider()).toThrow(/TWILIO_AUTH_TOKEN/);
  });

  it("sends through Twilio with a Messaging Service SID", async () => {
    vi.stubEnv("SMS_PROVIDER", "twilio");
    vi.stubEnv("TWILIO_ACCOUNT_SID", "AC123");
    vi.stubEnv("TWILIO_AUTH_TOKEN", "secret");
    vi.stubEnv("TWILIO_FROM", "MG456");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 201 }));
    await getSmsProvider()!.send({ to: "+919876543210", body: "123456 is your code" });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
    const body = new URLSearchParams(String(init!.body));
    expect(body.get("To")).toBe("+919876543210");
    expect(body.get("MessagingServiceSid")).toBe("MG456");
    expect(body.get("From")).toBeNull();
  });

  it("applies SMS_ALLOWED_COUNTRY_CODES", () => {
    vi.stubEnv("SMS_ALLOWED_COUNTRY_CODES", "91");
    expect(isAllowedSignInPhoneNumber("+919876543210")).toBe(true);
    expect(isAllowedSignInPhoneNumber("+14155550100")).toBe(false);
  });
});

describe("phone-only accounts", () => {
  it("get an undeliverable placeholder email and a name that hides the number", () => {
    const email = placeholderEmailForPhone("+919876543210");
    expect(email).toBe("919876543210@phone.inrent.invalid");
    expect(isPlaceholderEmail(email)).toBe(true);
    expect(isPlaceholderEmail("someone@example.com")).toBe(false);
    expect(placeholderNameForPhone("+919876543210")).toBe("User 3210");
  });

  it("never emails a placeholder address", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await sendTemplateEmail("919876543210@phone.inrent.invalid", { subject: "Hi", title: "Hi", intro: "Hello" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("per-number code quota", () => {
  const store = (allowed: boolean | Error): RateLimitStore => ({
    hit: vi.fn(async (_key: string, limit: number) => {
      if (allowed instanceof Error) throw allowed;
      return { allowed, limit, current: 0, remaining: 0, resetMs: 0, retryAfterMs: 0 };
    }),
    add: vi.fn(async () => {}),
  });

  it("allows up to five codes an hour per number", async () => {
    const s = store(true);
    expect(await consumeSignInCodeQuota("+919876543210", s)).toBe(true);
    expect(s.hit).toHaveBeenCalledWith("inrent:sms:otp:+919876543210", 5, 3_600_000, 1, expect.any(Number));
    expect(await consumeSignInCodeQuota("+919876543210", store(false))).toBe(false);
  });

  it("fails open when Redis is unreachable", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await consumeSignInCodeQuota("+919876543210", store(new Error("ECONNREFUSED")))).toBe(true);
  });
});
