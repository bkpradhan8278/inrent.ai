import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  extractBearer,
  generateApiKey,
  generateWebhookSecret,
  hashApiKey,
  isWellFormedApiKey,
  keyEnvironmentFromSecret,
  needsReencryption,
  parseKeyring,
  safeEqual,
  signWebhookPayload,
  verifyWebhookSignature,
} from "../src/server";

const PEPPER = "x".repeat(48);

describe("api keys", () => {
  it("generates environment-tagged keys with high entropy", () => {
    const prod = generateApiKey("PRODUCTION");
    expect(prod.secret).toMatch(/^sk-inrent-prod-[0-9A-Za-z]{43}$/);
    expect(isWellFormedApiKey(prod.secret)).toBe(true);
    expect(keyEnvironmentFromSecret(prod.secret)).toBe("PRODUCTION");
    expect(prod.displayPrefix.startsWith("sk-inrent-prod-")).toBe(true);
    expect(prod.secret.endsWith(prod.lastFour)).toBe(true);
    const dev = generateApiKey("DEVELOPMENT");
    expect(dev.secret.startsWith("sk-inrent-dev-")).toBe(true);
    expect(dev.secret).not.toBe(generateApiKey("DEVELOPMENT").secret);
  });

  it("hashes deterministically with a pepper and never returns the secret", () => {
    const { secret } = generateApiKey("STAGING");
    const h1 = hashApiKey(secret, PEPPER);
    expect(h1).toBe(hashApiKey(secret, PEPPER));
    expect(h1).not.toContain(secret);
    expect(h1).not.toBe(hashApiKey(secret, "y".repeat(48)));
    expect(() => hashApiKey(secret, "short")).toThrow();
  });

  it("rejects malformed keys", () => {
    expect(isWellFormedApiKey("sk-inrent-prod-short")).toBe(false);
    expect(isWellFormedApiKey("sk-other-prod-" + "a".repeat(43))).toBe(false);
  });

  it("extracts bearer tokens", () => {
    expect(extractBearer("Bearer abc")).toBe("abc");
    expect(extractBearer("bearer  abc ")).toBe("abc");
    expect(extractBearer("Basic abc")).toBeNull();
    expect(extractBearer(null)).toBeNull();
  });
});

describe("encryption", () => {
  const k1 = randomBytes(32).toString("base64");
  const k2 = randomBytes(32).toString("base64");

  it("round-trips with associated data", () => {
    const ring = parseKeyring(`k1:${k1}`);
    const env = encryptSecret("sk-provider-secret", ring, "byok:org-1");
    expect(env.startsWith("v1.k1.")).toBe(true);
    expect(env).not.toContain("sk-provider-secret");
    expect(decryptSecret(env, ring, "byok:org-1")).toBe("sk-provider-secret");
  });

  it("fails when associated data differs (ciphertext moved to another org)", () => {
    const ring = parseKeyring(`k1:${k1}`);
    const env = encryptSecret("secret", ring, "byok:org-1");
    expect(() => decryptSecret(env, ring, "byok:org-2")).toThrow();
  });

  it("fails on tampering", () => {
    const ring = parseKeyring(`k1:${k1}`);
    const env = encryptSecret("secret", ring, "a");
    const parts = env.split(".");
    parts[4] = Buffer.from("tampered").toString("base64url");
    expect(() => decryptSecret(parts.join("."), ring, "a")).toThrow();
  });

  it("supports key rotation", () => {
    const old = parseKeyring(`k1:${k1}`);
    const env = encryptSecret("secret", old, "a");
    const rotated = parseKeyring(`k2:${k2},k1:${k1}`);
    expect(decryptSecret(env, rotated, "a")).toBe("secret");
    expect(needsReencryption(env, rotated)).toBe(true);
    expect(encryptSecret("secret", rotated, "a").startsWith("v1.k2.")).toBe(true);
  });

  it("validates keyring configuration", () => {
    expect(() => parseKeyring(undefined)).toThrow();
    expect(() => parseKeyring("k1:short")).toThrow();
  });
});

describe("webhook signatures", () => {
  it("signs and verifies", () => {
    const secret = generateWebhookSecret();
    const body = JSON.stringify({ id: "evt_1" });
    const header = signWebhookPayload(secret, body, 1_700_000_000);
    expect(verifyWebhookSignature(secret, body, header, { nowSeconds: 1_700_000_010 })).toBe(true);
  });

  it("rejects forged, modified or replayed payloads", () => {
    const secret = generateWebhookSecret();
    const body = "{}";
    const header = signWebhookPayload(secret, body, 1_700_000_000);
    expect(verifyWebhookSignature("whsec_wrong", body, header, { nowSeconds: 1_700_000_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, '{"a":1}', header, { nowSeconds: 1_700_000_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, body, header, { nowSeconds: 1_700_001_000 })).toBe(false);
    expect(verifyWebhookSignature(secret, body, null)).toBe(false);
    expect(verifyWebhookSignature(secret, body, "garbage")).toBe(false);
  });

  it("compares in constant time", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });
});

import { signInternalAssertion, verifyInternalAssertion } from "../src/server";

describe("internal assertions", () => {
  const secret = "s".repeat(40);
  it("round-trips and expires", () => {
    const token = signInternalAssertion({ organizationId: "o", projectId: "p", userId: "u", source: "playground" }, secret, 60);
    expect(verifyInternalAssertion(token, secret)?.projectId).toBe("p");
    expect(verifyInternalAssertion(token, "x".repeat(40))).toBeNull();
    expect(verifyInternalAssertion(token, secret, Math.floor(Date.now() / 1000) + 3600)).toBeNull();
  });
  it("rejects tampered payloads", () => {
    const token = signInternalAssertion({ organizationId: "o", projectId: "p", userId: "u", source: "playground" }, secret);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(body!, "base64url").toString()), organizationId: "victim" })).toString("base64url");
    expect(verifyInternalAssertion(`${forged}.${sig}`, secret)).toBeNull();
  });
});
