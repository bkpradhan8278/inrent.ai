import { randomBytes } from "node:crypto";
import { hmacSha256Hex, safeEqual } from "./hash";

/**
 * Webhook signatures.
 * Header:  Inrent-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>
 * Receivers must verify the HMAC and reject timestamps outside the tolerance window to stop replays.
 */

export const WEBHOOK_SIGNATURE_HEADER = "Inrent-Signature";
export const DEFAULT_TOLERANCE_SECONDS = 300;

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("base64url")}`;
}

export function signWebhookPayload(secret: string, body: string, timestampSeconds: number): string {
  const sig = hmacSha256Hex(secret, `${timestampSeconds}.${body}`);
  return `t=${timestampSeconds},v1=${sig}`;
}

export function verifyWebhookSignature(
  secret: string,
  body: string,
  header: string | null | undefined,
  opts: { toleranceSeconds?: number; nowSeconds?: number } = {},
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  ) as Record<string, string | undefined>;
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || !v1) return false;
  const now = opts.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > (opts.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS)) return false;
  return safeEqual(hmacSha256Hex(secret, `${t}.${body}`), v1);
}
