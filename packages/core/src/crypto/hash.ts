import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function sha256Hex(input: string | Buffer): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacSha256Hex(secret: string | Buffer, input: string | Buffer): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

/** Constant-time string comparison (length-safe). */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    // Compare against itself to keep timing roughly constant, then fail.
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

/** One-way IP hash for logs/audit — lets us correlate abuse without storing raw IPs. */
export function hashIp(ip: string | null | undefined, salt: string): string | null {
  if (!ip) return null;
  return hmacSha256Hex(salt, ip).slice(0, 32);
}
