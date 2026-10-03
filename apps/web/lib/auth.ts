import "server-only";
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { magicLink } from "better-auth/plugins";
import { prisma } from "@inrent/db";
import { isFeatureEnabled, provisionPersonalWorkspace, recordAudit } from "@inrent/services";
import { sendTemplateEmail } from "@inrent/services/email";

/**
 * Authentication: Better Auth (self-hosted, Postgres via Prisma).
 * Decision: keeps users, sessions and organizations in our own database (no third-party
 * identity vendor in the request path), supports email/password, magic links and
 * GitHub/Google OAuth, and leaves enterprise SSO as an additive plugin later.
 */

const isProduction = process.env.INRENT_ENV === "production" || process.env.NODE_ENV === "production";
const baseURL = process.env.BETTER_AUTH_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = { clientId: process.env.GITHUB_CLIENT_ID, clientSecret: process.env.GITHUB_CLIENT_SECRET };
}
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET };
}

export const enabledSocialProviders = Object.keys(socialProviders) as Array<"github" | "google">;

export const auth = betterAuth({
  appName: "INRENT",
  baseURL,
  secret: process.env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  trustedOrigins: [baseURL],
  advanced: {
    database: { generateId: () => randomUUID() },
    useSecureCookies: isProduction,
    cookiePrefix: "inrent",
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
  },
  socialProviders,
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
          await provisionPersonalWorkspace({ id: user.id, name: user.name, email: user.email });
          await recordAudit({ actorType: "USER", actorId: user.id, action: "user.signed_up", targetType: "user", targetId: user.id });
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
