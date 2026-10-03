import { hmacSha256Hex, safeEqual } from "./hash";

/**
 * Short-lived, HMAC-signed assertion that lets trusted INRENT services (the dashboard
 * playground) call the gateway on behalf of a signed-in user's project without minting an
 * API key. The gateway only honours it with INTERNAL_SERVICE_SECRET and within the expiry.
 *
 * Header: x-inrent-internal-assertion: <base64url(json)>.<hex hmac>
 */

export const INTERNAL_ASSERTION_HEADER = "x-inrent-internal-assertion";
const MAX_TTL_SECONDS = 300;

export interface InternalAssertion {
  organizationId: string;
  projectId: string;
  userId: string;
  source: "playground" | "dashboard";
  /** Unix seconds */
  exp: number;
}

export function signInternalAssertion(payload: Omit<InternalAssertion, "exp">, secret: string, ttlSeconds = 120): string {
  if (secret.length < 32) throw new Error("INTERNAL_SERVICE_SECRET must be at least 32 characters");
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + Math.min(ttlSeconds, MAX_TTL_SECONDS) })).toString("base64url");
  return `${body}.${hmacSha256Hex(secret, `inrent-internal:${body}`)}`;
}

export function verifyInternalAssertion(token: string | null | undefined, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): InternalAssertion | null {
  if (!token || secret.length < 32) return null;
  const idx = token.lastIndexOf(".");
  if (idx <= 0) return null;
  const body = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  if (!safeEqual(hmacSha256Hex(secret, `inrent-internal:${body}`), sig)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as InternalAssertion;
    if (typeof parsed.exp !== "number" || parsed.exp < nowSeconds || parsed.exp > nowSeconds + MAX_TTL_SECONDS) return null;
    if (!parsed.organizationId || !parsed.projectId || !parsed.userId) return null;
    return parsed;
  } catch {
    return null;
  }
}
