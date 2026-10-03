import pino, { type Logger } from "pino";

/**
 * Structured JSON logging. Secrets are redacted by path so a stray object can't leak keys.
 */
export const REDACT_PATHS = [
  "authorization",
  "*.authorization",
  "headers.authorization",
  "req.headers.authorization",
  "req.headers.cookie",
  "headers.cookie",
  "apiKey",
  "*.apiKey",
  "secret",
  "*.secret",
  "password",
  "*.password",
  "token",
  "*.token",
  "encryptedKey",
  "*.encryptedKey",
];

export type { Logger };

export function createLogger(service: string, opts: { level?: string } = {}): Logger {
  return pino({
    name: service,
    level: opts.level ?? process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info"),
    base: {
      service,
      env: process.env.INRENT_ENV ?? process.env.NODE_ENV ?? "development",
      version: process.env.INRENT_VERSION ?? "dev",
    },
    redact: { paths: REDACT_PATHS, censor: "[redacted]" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
  });
}
