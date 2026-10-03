/**
 * Time-sortable identifiers (ULID layout, Crockford base32) for request/event ids.
 * Uses Web Crypto so it works in Node and edge runtimes.
 */

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(ms: number, length = 10): string {
  let out = "";
  let t = ms;
  for (let i = 0; i < length; i++) {
    out = CROCKFORD[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(length = 16): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += CROCKFORD[b % 32];
  return out;
}

export function ulid(now: number = Date.now()): string {
  return encodeTime(now) + encodeRandom();
}

export const newRequestId = (): string => `req_${ulid()}`;
export const newTraceId = (): string => {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
};
export const newEventId = (): string => `evt_${ulid()}`;
export const newCompletionId = (): string => `chatcmpl-${ulid()}`;

const BASE62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Unbiased random base62 string (rejection sampling). */
export function randomBase62(length: number): string {
  let out = "";
  const buf = new Uint8Array(length * 2);
  while (out.length < length) {
    globalThis.crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b < 248) out += BASE62[b % 62];
      if (out.length === length) break;
    }
  }
  return out;
}
