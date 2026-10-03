import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM envelope encryption for secrets at rest (BYOK keys, webhook secrets, MCP auth).
 *
 * Format: v1.<keyId>.<iv>.<authTag>.<ciphertext>   (base64url segments)
 *
 * Keys come from INRENT_ENCRYPTION_KEYS="k2:<base64 32 bytes>,k1:<base64 32 bytes>".
 * The first key encrypts; all keys can decrypt, which allows rotation without downtime.
 * In production these keys should be sourced from a KMS / secret manager.
 *
 * Callers pass an "associated data" string (e.g. "byok:<orgId>") so a ciphertext copied
 * into another record or organization fails authentication.
 */

export interface Keyring {
  activeKeyId: string;
  keys: Map<string, Buffer>;
}

export function parseKeyring(spec: string | undefined): Keyring {
  if (!spec) throw new Error("INRENT_ENCRYPTION_KEYS is not configured");
  const keys = new Map<string, Buffer>();
  let activeKeyId: string | null = null;
  for (const part of spec.split(",").map((s) => s.trim()).filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx <= 0) throw new Error("INRENT_ENCRYPTION_KEYS entries must look like '<id>:<base64>'");
    const id = part.slice(0, idx);
    const key = Buffer.from(part.slice(idx + 1), "base64");
    if (key.length !== 32) throw new Error(`Encryption key '${id}' must be 32 bytes (base64)`);
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(id)) throw new Error(`Invalid encryption key id '${id}'`);
    keys.set(id, key);
    activeKeyId ??= id;
  }
  if (!activeKeyId) throw new Error("INRENT_ENCRYPTION_KEYS is empty");
  return { activeKeyId, keys };
}

export function encryptSecret(plaintext: string, keyring: Keyring, associatedData: string): string {
  const key = keyring.keys.get(keyring.activeKeyId);
  if (!key) throw new Error("Active encryption key missing");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(associatedData, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", keyring.activeKeyId, iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(envelope: string, keyring: Keyring, associatedData: string): string {
  const parts = envelope.split(".");
  if (parts.length !== 5 || parts[0] !== "v1") throw new Error("Unsupported secret envelope");
  const [, keyId, ivB64, tagB64, ctB64] = parts as [string, string, string, string, string];
  const key = keyring.keys.get(keyId);
  if (!key) throw new Error(`Unknown encryption key '${keyId}'`);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64url"));
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(ctB64, "base64url")), decipher.final()]);
  return plaintext.toString("utf8");
}

/** True when the envelope was produced by a key other than the active one (needs re-encryption). */
export function needsReencryption(envelope: string, keyring: Keyring): boolean {
  return envelope.split(".")[1] !== keyring.activeKeyId;
}

/** Last four characters for display ("…a1B2"); never more. */
export function secretHint(secret: string): string {
  return secret.length <= 8 ? "••••" : `…${secret.slice(-4)}`;
}
