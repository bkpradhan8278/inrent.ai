import { randomBase62 } from "../ids";
import { hmacSha256Hex } from "./hash";

/**
 * API key format: sk-inrent-<env>-<43 base62 chars>  (~256 bits of entropy)
 *   env: dev | stg | prod
 * The key carries no organization or user information.
 * We store only HMAC-SHA256(pepper, key). The pepper lives in the server environment, so a
 * database leak alone is not enough to verify guessed keys offline.
 */

export type KeyEnvironment = "DEVELOPMENT" | "STAGING" | "PRODUCTION";

const ENV_TAG: Record<KeyEnvironment, string> = {
  DEVELOPMENT: "dev",
  STAGING: "stg",
  PRODUCTION: "prod",
};

const KEY_RE = /^sk-inrent-(dev|stg|prod)-([0-9A-Za-z]{43})$/;
const SECRET_LENGTH = 43;

export interface GeneratedApiKey {
  secret: string;
  displayPrefix: string;
  lastFour: string;
}

export function generateApiKey(environment: KeyEnvironment): GeneratedApiKey {
  const body = randomBase62(SECRET_LENGTH);
  const secret = `sk-inrent-${ENV_TAG[environment]}-${body}`;
  return {
    secret,
    displayPrefix: `sk-inrent-${ENV_TAG[environment]}-${body.slice(0, 4)}`,
    lastFour: body.slice(-4),
  };
}

export function isWellFormedApiKey(secret: string): boolean {
  return KEY_RE.test(secret);
}

export function keyEnvironmentFromSecret(secret: string): KeyEnvironment | null {
  const m = KEY_RE.exec(secret);
  if (!m) return null;
  const tag = m[1];
  return tag === "prod" ? "PRODUCTION" : tag === "stg" ? "STAGING" : "DEVELOPMENT";
}

export function hashApiKey(secret: string, pepper: string): string {
  if (!pepper || pepper.length < 32) {
    throw new Error("API_KEY_PEPPER must be set to at least 32 characters");
  }
  return hmacSha256Hex(pepper, secret);
}

export function maskApiKey(displayPrefix: string, lastFour: string): string {
  return `${displayPrefix}…${lastFour}`;
}

/** Extracts the bearer token from an Authorization header (or x-api-key fallback). */
export function extractBearer(authorization: string | null | undefined): string | null {
  if (!authorization) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return m?.[1]?.trim() || null;
}
