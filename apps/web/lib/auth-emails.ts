import { APIError } from "better-auth/api";
import type { RateLimitStore } from "@inrent/core";
import { prisma } from "@inrent/db";
import { notify } from "@inrent/services";
import { isPlaceholderEmail, sendTemplateEmail } from "@inrent/services/email";
import { signInCodeEmail, welcomeEmail } from "@inrent/services/emailTemplates";
import { RedisRateLimitStore } from "@inrent/services/redis";
import { EMAIL_CODE_TTL_SECONDS } from "@/lib/auth-messages";
import { absoluteUrl } from "@/lib/hosts";

/** Email-code sign-in and the welcome email. Kept apart from lib/auth.ts so the logic is testable without booting Better Auth. */

const CODES_PER_EMAIL_PER_HOUR = 8;

export type EmailOtpType = "sign-in" | "email-verification" | "forget-password" | "change-email";

/** Per-address cap on top of the per-IP rate limit, so one mailbox cannot be flooded from many addresses. Fails open like the SMS quota. */
export async function consumeEmailCodeQuota(email: string, store: RateLimitStore = new RedisRateLimitStore()): Promise<boolean> {
  try {
    return (await store.hit(`inrent:email:otp:${email.toLowerCase()}`, CODES_PER_EMAIL_PER_HOUR, 60 * 60 * 1000, 1, Date.now())).allowed;
  } catch (err) {
    console.error(`Email code quota unavailable, allowing send: ${(err as Error).message}`);
    return true;
  }
}

/**
 * Better Auth's sendVerificationOTP callback. Sign-in codes go to every address (new emails create an account on
 * verification), so awaiting them reveals nothing and lets a provider failure reach the user. The plugin skips the
 * callback for unknown addresses on the other purposes, so awaiting those would leak account existence through
 * latency: they are sent in the background instead.
 */
export async function sendEmailOtp({ email, otp, type }: { email: string; otp: string; type: EmailOtpType }, store?: RateLimitStore): Promise<void> {
  // Changing the email by code is not enabled (user.changeEmail is unset), so there is no template for it.
  if (type === "change-email") return;
  const send = async () => {
    if (!(await consumeEmailCodeQuota(email, store))) {
      if (type === "sign-in") throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes sent to this address. Try again later." });
      return;
    }
    await sendTemplateEmail(email, signInCodeEmail({ code: otp, expiresInMinutes: EMAIL_CODE_TTL_SECONDS / 60, purpose: type }));
  };
  if (type === "sign-in") return send();
  void send().catch((err) => console.error(`Email code (${type}) not sent: ${(err as Error).message}`));
}

/**
 * Sends the welcome email at most once per user, only to real mailboxes. The claim is a notification row with a
 * unique dedupeKey (the existing idempotency primitive, atomic across concurrent hooks and processes); it is taken
 * before sending, so a provider failure is not retried (no duplicate is better than a retry loop) and the user still
 * sees the in-app welcome. Never throws: signing up or in must not depend on the mail provider.
 */
export async function sendWelcomeEmailOnce(user: { id: string; name: string; email: string; emailVerified?: boolean }, organizationId?: string): Promise<void> {
  if (!user.emailVerified || isPlaceholderEmail(user.email)) return;
  try {
    const orgId = organizationId ?? (await prisma.membership.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "asc" }, select: { organizationId: true } }))?.organizationId;
    // No workspace yet: user.create.after provisions one and sends the welcome itself when the email is already verified.
    if (!orgId) return;
    const claimed = await notify({
      organizationId: orgId,
      userId: user.id,
      type: "welcome",
      title: "Welcome to INRENT",
      body: "Create an API key and send your first request. The docs have copy-paste examples.",
      link: "/dashboard/keys",
      dedupeKey: `welcome:${user.id}`,
    });
    if (!claimed) return;
    await sendTemplateEmail(user.email, welcomeEmail({ name: user.name, dashboardUrl: absoluteUrl("/dashboard"), docsUrl: absoluteUrl("/docs") }));
  } catch (err) {
    console.error(`Welcome email failed for user ${user.id}: ${(err as Error).message}`);
  }
}
