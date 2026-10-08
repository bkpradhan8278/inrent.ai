import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RateLimitStore } from "@inrent/core";

// Services pull in Prisma and Redis; only the pieces auth-emails touches are replaced.
vi.mock("@inrent/db", () => ({ prisma: { membership: { findFirst: vi.fn() } } }));
vi.mock("@inrent/services", () => ({ notify: vi.fn() }));
vi.mock("@inrent/services/redis", () => ({ RedisRateLimitStore: class {} }));
vi.mock("@inrent/services/email", async (importOriginal) => ({ ...(await importOriginal<typeof import("@inrent/services/email")>()), sendTemplateEmail: vi.fn() }));

type Mod = typeof import("@/lib/auth-emails");
async function load(): Promise<{ m: Mod; notify: ReturnType<typeof vi.fn>; send: ReturnType<typeof vi.fn>; findMembership: ReturnType<typeof vi.fn> }> {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "inrent.ai");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://inrent.ai");
  const m = await import("@/lib/auth-emails");
  const { notify } = await import("@inrent/services");
  const { sendTemplateEmail } = await import("@inrent/services/email");
  const { prisma } = await import("@inrent/db");
  return { m, notify: vi.mocked(notify), send: vi.mocked(sendTemplateEmail), findMembership: vi.mocked(prisma.membership.findFirst) as unknown as ReturnType<typeof vi.fn> };
}

const allow: RateLimitStore = { hit: async () => ({ allowed: true }) } as unknown as RateLimitStore;
const deny: RateLimitStore = { hit: async () => ({ allowed: false }) } as unknown as RateLimitStore;

beforeEach(() => {
  // Module factories are cached across resetModules, so mock state is cleared explicitly.
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendEmailOtp", () => {
  it("awaits sign-in codes and sends the sign-in template with the code and a 10 minute expiry", async () => {
    const { m, send } = await load();
    await m.sendEmailOtp({ email: "a@example.com", otp: "123456", type: "sign-in" }, allow);
    expect(send).toHaveBeenCalledTimes(1);
    const [to, message] = send.mock.calls[0]!;
    expect(to).toBe("a@example.com");
    expect(message.subject).toBe("Your INRENT sign-in code");
    expect(message.code.value).toBe("123456");
    expect(message.intro).toContain("10 minutes");
  });

  it("surfaces a provider failure for sign-in so the user can retry", async () => {
    const { m, send } = await load();
    send.mockRejectedValueOnce(new Error("provider down"));
    await expect(m.sendEmailOtp({ email: "a@example.com", otp: "123456", type: "sign-in" }, allow)).rejects.toThrow("provider down");
  });

  it("rejects sign-in codes with 429 once the per-address quota is spent, without sending", async () => {
    const { m, send } = await load();
    await expect(m.sendEmailOtp({ email: "a@example.com", otp: "123456", type: "sign-in" }, deny)).rejects.toMatchObject({ status: "TOO_MANY_REQUESTS" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sends verification and reset codes in the background so latency cannot reveal whether the account exists", async () => {
    const { m, send } = await load();
    let finish!: () => void;
    send.mockReturnValueOnce(new Promise<void>((resolve) => (finish = resolve)));
    // Resolves while the provider call is still pending.
    await m.sendEmailOtp({ email: "a@example.com", otp: "654321", type: "forget-password" }, allow);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(send.mock.calls[0]![1].subject).toBe("Your INRENT password reset code");
    finish();
  });

  it("logs, and does not throw, when a background send fails", async () => {
    const { m, send } = await load();
    send.mockRejectedValueOnce(new Error("provider down"));
    await expect(m.sendEmailOtp({ email: "a@example.com", otp: "654321", type: "email-verification" }, allow)).resolves.toBeUndefined();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalled());
  });

  it("silently drops background codes over quota (a visible error would reveal the account exists)", async () => {
    const { m, send } = await load();
    await expect(m.sendEmailOtp({ email: "a@example.com", otp: "654321", type: "forget-password" }, deny)).resolves.toBeUndefined();
    await new Promise((r) => setTimeout(r, 10));
    expect(send).not.toHaveBeenCalled();
  });

  it("does nothing for change-email codes (not enabled)", async () => {
    const { m, send } = await load();
    await m.sendEmailOtp({ email: "a@example.com", otp: "111111", type: "change-email" }, allow);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("consumeEmailCodeQuota", () => {
  it("keys on the lowercased address and fails open when the store is unavailable", async () => {
    const { m } = await load();
    const hit = vi.fn(async (_key: string) => ({ allowed: true }));
    await m.consumeEmailCodeQuota("A@Example.com", { hit } as unknown as RateLimitStore);
    expect(hit.mock.calls[0]![0]).toBe("inrent:email:otp:a@example.com");
    const broken = { hit: async () => { throw new Error("redis down"); } } as unknown as RateLimitStore;
    expect(await m.consumeEmailCodeQuota("a@example.com", broken)).toBe(true);
  });
});

describe("sendWelcomeEmailOnce", () => {
  const user = { id: "u1", name: "Asha Rao", email: "asha@example.com", emailVerified: true };

  it("claims a per-user dedupe key, then sends the welcome email with section-host URLs", async () => {
    const { m, notify, send } = await load();
    notify.mockResolvedValueOnce(true);
    await m.sendWelcomeEmailOnce(user, "org1");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org1", userId: "u1", dedupeKey: "welcome:u1" }));
    const [to, message] = send.mock.calls[0]!;
    expect(to).toBe("asha@example.com");
    expect(message.subject).toBe("Welcome to INRENT");
    expect(message.action.url).toBe("https://app.inrent.ai/");
    expect(message.links.map((l: { url: string }) => l.url)).toContain("https://docs.inrent.ai/");
  });

  it("does not send when the claim was already taken (at most once per user)", async () => {
    const { m, notify, send } = await load();
    notify.mockResolvedValueOnce(false);
    await m.sendWelcomeEmailOnce(user, "org1");
    expect(send).not.toHaveBeenCalled();
  });

  it("skips unverified users and phone placeholder addresses without claiming", async () => {
    const { m, notify, send } = await load();
    await m.sendWelcomeEmailOnce({ ...user, emailVerified: false }, "org1");
    await m.sendWelcomeEmailOnce({ ...user, email: "+919876543210@phone.inrent.invalid" }, "org1");
    expect(notify).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("finds the user's workspace when none is passed, and skips when there is none yet", async () => {
    const { m, notify, send, findMembership } = await load();
    findMembership.mockResolvedValueOnce({ organizationId: "org9" });
    notify.mockResolvedValueOnce(true);
    await m.sendWelcomeEmailOnce(user);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org9" }));
    expect(send).toHaveBeenCalledTimes(1);

    findMembership.mockResolvedValueOnce(null);
    await m.sendWelcomeEmailOnce(user);
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("never throws, whether the claim or the provider fails", async () => {
    const { m, notify, send } = await load();
    notify.mockRejectedValueOnce(new Error("db down"));
    await expect(m.sendWelcomeEmailOnce(user, "org1")).resolves.toBeUndefined();
    notify.mockResolvedValueOnce(true);
    send.mockRejectedValueOnce(new Error("provider down"));
    await expect(m.sendWelcomeEmailOnce(user, "org1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});
