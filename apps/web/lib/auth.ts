import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { emailOTP, genericOAuth, magicLink, phoneNumber } from "better-auth/plugins";
import { prisma } from "@inrent/db";
import { isFeatureEnabled, provisionPersonalWorkspace, recordAudit } from "@inrent/services";
import { sendTemplateEmail } from "@inrent/services/email";
import { consumeSignInCodeQuota, getSmsProvider, isAllowedSignInPhoneNumber, placeholderEmailForPhone, placeholderNameForPhone, sendSignInCodeSms } from "@inrent/services/sms";
import { sendEmailOtp, sendWelcomeEmailOnce } from "@/lib/auth-emails";
import { EMAIL_CODE_ALLOWED_ATTEMPTS, EMAIL_CODE_LENGTH, EMAIL_CODE_TTL_SECONDS } from "@/lib/auth-messages";
import { allOrigins, cookieDomain } from "@/lib/hosts";

/**
 * Authentication: Better Auth (self-hosted, Postgres via Prisma).
 * Decision: keeps users, sessions and organizations in our own database (no third-party
 * identity vendor in the request path), supports email/password, magic links, email and phone-number
 * codes and GitHub/Google/ChatGPT OAuth, and leaves enterprise SSO as an additive plugin later.
 */

const isProduction = process.env.INRENT_ENV === "production" || process.env.NODE_ENV === "production";
// Runtime guard (INRENT_ENV is set by deployments, not during `next build`).
if (process.env.INRENT_ENV === "production") {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32 || /dev-only|change-me/i.test(secret)) throw new Error("BETTER_AUTH_SECRET must be a random value of at least 32 characters in production");
}
const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
// Load balancer addresses (IPs or CIDRs). Better Auth only trusts a single-entry X-Forwarded-For otherwise;
// behind a proxy that appends to it, every client would share one rate-limit bucket.
const trustedProxies = (process.env.AUTH_TRUSTED_PROXIES ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}

// Sign in with ChatGPT: OpenAI's OpenID Connect provider (authorization code + PKCE). Client IDs start with
// "oaiapp_"; the secret is only issued to confidential clients, so it is optional.
const chatgpt = process.env.OPENAI_SIGNIN_CLIENT_ID
  ? genericOAuth({
      config: [
        {
          providerId: "chatgpt",
          name: "ChatGPT",
          discoveryUrl: "https://auth.openai.com/.well-known/openid-configuration",
          // Identity comes from ID-token claims, so refuse to register the provider without a verifiable JWKS.
          requireIdTokenVerification: true,
          clientId: process.env.OPENAI_SIGNIN_CLIENT_ID,
          clientSecret: process.env.OPENAI_SIGNIN_CLIENT_SECRET || undefined,
          scopes: ["openid", "profile", "email"],
          pkce: true,
          mapProfileToUser: (profile) => ({ name: typeof profile.name === "string" && profile.name ? profile.name : (profile.email?.split("@")[0] ?? "ChatGPT user") }),
        },
      ],
    })
  : null;

export type SocialProviderId = "github" | "google" | "chatgpt";
export const enabledSocialProviders: SocialProviderId[] = [...(Object.keys(socialProviders) as SocialProviderId[]), ...(chatgpt ? (["chatgpt"] as const) : [])];

// Phone sign-in is offered only when an SMS provider is configured; a broken config hides it instead of failing every auth page.
export const phoneSignInEnabled = (() => {
  try {
    return getSmsProvider() !== null;
  } catch (err) {
    console.error(`Phone sign-in disabled: ${(err as Error).message}`);
    return false;
  }
})();

export const auth = betterAuth({
  appName: "INRENT",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  // With subdomain routing every section host may call /api/auth (session reads, sign-out, callbacks).
  trustedOrigins: [...new Set([baseURL, ...allOrigins()])],
  advanced: {
    database: { generateId: () => randomUUID() },
    // Secure cookies whenever the app is served over https (also covers staging); plain http only for local builds.
    useSecureCookies: baseURL.startsWith("https://"),
    cookiePrefix: "inrent",
    ...(trustedProxies.length ? { ipAddress: { trustedProxies } } : {}),
    // One sign-in for every section host: the session cookie is scoped to the root domain.
    ...(cookieDomain ? { crossSubDomainCookies: { enabled: true, domain: cookieDomain } } : {}),
  },
  session: {
    expiresIn: 60 * 60 * 24 * 14,
    updateAge: 60 * 60 * 24,
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  user: {
    additionalFields: {
      platformRole: { type: "string", input: false, defaultValue: "USER", required: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    requireEmailVerification: isProduction,
    autoSignIn: !isProduction,
    sendResetPassword: async ({ user, url }) => {
      await sendTemplateEmail(user.email, {
        subject: "Reset your INRENT password",
        title: "Reset your password",
        intro: "Someone asked to reset the password for your INRENT account. If this was you, use the button below. The link expires in one hour.",
        action: { label: "Reset password", url },
        footer: "If you didn't request this, you can ignore this email — your password won't change.",
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendTemplateEmail(user.email, {
        subject: "Verify your email for INRENT",
        title: "Confirm your email",
        intro: "Welcome to INRENT. Confirm your email address to activate your account.",
        action: { label: "Verify email", url },
      });
    },
    // Also runs for the email-code verify endpoint. Social and email-code accounts are verified at creation (user.create.after).
    afterEmailVerification: async (user) => {
      await sendWelcomeEmailOnce(user);
    },
  },
  socialProviders,
  // Phone accounts sign in with one-time codes only; no phone+password flow, so no SMS password resets either.
  // Changing the email by code is off (user.changeEmail is unset); closing the paths keeps it that way.
  disabledPaths: ["/sign-in/phone-number", "/phone-number/request-password-reset", "/phone-number/reset-password", "/email-otp/request-email-change", "/email-otp/change-email"],
  // Credential endpoints are throttled tightly; session reads (every page view) are not.
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 8 },
      "/sign-up/email": { window: 3600, max: 10 },
      "/sign-in/magic-link": { window: 300, max: 5 },
      "/forget-password": { window: 3600, max: 5 },
      "/request-password-reset": { window: 3600, max: 5 },
      // Every code is a paid SMS: keep sends per client tight.
      "/phone-number/send-otp": { window: 3600, max: 5 },
      "/phone-number/verify": { window: 300, max: 10 },
      // Email codes: sends and password-reset requests are tight; guesses are also capped per code by allowedAttempts.
      "/email-otp/send-verification-otp": { window: 300, max: 5 },
      "/email-otp/request-password-reset": { window: 3600, max: 5 },
      "/forget-password/email-otp": { window: 3600, max: 5 },
      "/sign-in/email-otp": { window: 300, max: 10 },
      "/email-otp/verify-email": { window: 300, max: 10 },
      "/email-otp/check-verification-otp": { window: 300, max: 10 },
      "/email-otp/reset-password": { window: 300, max: 10 },
      "/get-session": false,
    },
  },
  plugins: [
    magicLink({
      expiresIn: 60 * 10,
      sendMagicLink: async ({ email, url }) => {
        await sendTemplateEmail(email, {
          subject: "Your INRENT sign-in link",
          title: "Sign in to INRENT",
          intro: "Use the button below to sign in. The link expires in 10 minutes and can be used once.",
          action: { label: "Sign in", url },
        });
      },
    }),
    // The first verified code for an unknown address creates the account (SIGNUPS_ENABLED applies through user.create.before).
    emailOTP({
      otpLength: EMAIL_CODE_LENGTH,
      expiresIn: EMAIL_CODE_TTL_SECONDS,
      allowedAttempts: EMAIL_CODE_ALLOWED_ATTEMPTS,
      storeOTP: "hashed",
      sendVerificationOTP: ({ email, otp, type }) => sendEmailOtp({ email, otp, type }),
    }),
    phoneNumber({
      otpLength: 6,
      expiresIn: 60 * 5,
      allowedAttempts: 3,
      phoneNumberValidator: (phone) => phoneSignInEnabled && isAllowedSignInPhoneNumber(phone),
      sendOTP: async ({ phoneNumber, code }) => {
        if (!(await consumeSignInCodeQuota(phoneNumber))) throw new APIError("TOO_MANY_REQUESTS", { message: "Too many codes sent to this number. Try again later." });
        await sendSignInCodeSms(phoneNumber, code);
      },
      // First successful code creates the account (subject to SIGNUPS_ENABLED, like every other sign-up).
      signUpOnVerification: { getTempEmail: placeholderEmailForPhone, getTempName: placeholderNameForPhone },
    }),
    ...(chatgpt ? [chatgpt] : []),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          if (!(await isFeatureEnabled("SIGNUPS_ENABLED"))) return false;
          return { data: { ...user, email: user.email.toLowerCase() } };
        },
        after: async (user) => {
          const organizationId = await provisionPersonalWorkspace({ id: user.id, name: user.name, email: user.email });
          await recordAudit({ actorType: "USER", actorId: user.id, action: "user.signed_up", targetType: "user", targetId: user.id });
          await sendWelcomeEmailOnce(user, organizationId);
        },
      },
    },
    session: {
      create: {
        after: async (session) => {
          await recordAudit({ actorType: "USER", actorId: session.userId, action: "user.signed_in", targetType: "session", targetId: session.id });
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
