import { z } from "zod";

/**
 * Server environment. Production refuses to start with missing or development secrets;
 * development falls back to clearly-marked local defaults where safe.
 */

export type RuntimeEnv = "development" | "staging" | "production" | "test";

export function runtimeEnv(): RuntimeEnv {
  const v = process.env.INRENT_ENV ?? process.env.NODE_ENV ?? "development";
  return v === "production" || v === "staging" || v === "test" ? v : "development";
}

const schema = z.object({
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379/0"),
  API_KEY_PEPPER: z.string().min(32),
  INTERNAL_SERVICE_SECRET: z.string().min(32),
  INRENT_ENCRYPTION_KEYS: z.string().min(1),
  IP_HASH_SALT: z.string().min(8).default("inrent-ip-salt"),
  DEFAULT_PLATFORM_MARKUP_PCT: z.string().regex(/^\d+(\.\d{1,3})?$/).default("5.5"),
  BYOK_FEE_PCT: z.string().regex(/^\d+(\.\d{1,3})?$/).default("0"),
  INRENT_ENABLE_MOCK_PROVIDER: z.enum(["true", "false"]).default("false"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  API_PUBLIC_URL: z.string().url().default("http://localhost:8080/v1"),
  ALLOW_PRIVATE_WEBHOOK_URLS: z.enum(["true", "false"]).default("false"),
});

export type ServerEnv = z.infer<typeof schema> & { runtime: RuntimeEnv; mockAllowed: boolean };

let cached: ServerEnv | null = null;

const DEV_MARKER = /dev-only|change-me/i;

export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const runtime = runtimeEnv();
  const parsed = schema.safeParse({
    ...process.env,
    APP_URL: process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
    API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid server environment — ${issues}`);
  }
  const env = parsed.data;
  if (runtime === "production") {
    for (const key of ["API_KEY_PEPPER", "INTERNAL_SERVICE_SECRET", "INRENT_ENCRYPTION_KEYS", "IP_HASH_SALT"] as const) {
      if (DEV_MARKER.test(env[key])) throw new Error(`${key} still contains a development value`);
    }
    if (env.INRENT_ENABLE_MOCK_PROVIDER === "true") throw new Error("The mock provider cannot be enabled in production");
    if (env.ALLOW_PRIVATE_WEBHOOK_URLS === "true") throw new Error("Private webhook URLs cannot be allowed in production");
  }
  cached = {
    ...env,
    runtime,
    mockAllowed: runtime !== "production" && env.INRENT_ENABLE_MOCK_PROVIDER === "true",
  };
  return cached;
}

/** For tests. */
export function resetServerEnvCache(): void {
  cached = null;
}
