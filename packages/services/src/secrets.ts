import { decryptSecret, encryptSecret, parseKeyring, type Keyring } from "@inrent/core/server";
import { getServerEnv } from "./env";

let keyring: Keyring | null = null;

function ring(): Keyring {
  keyring ??= parseKeyring(getServerEnv().INRENT_ENCRYPTION_KEYS);
  return keyring;
}

/** Associated-data namespaces bind ciphertexts to the record they belong to. */
export const aad = {
  byok: (orgId: string, providerId: string) => `byok:${orgId}:${providerId}`,
  webhook: (orgId: string) => `webhook:${orgId}`,
  mcp: (orgId: string, serverId: string) => `mcp:${orgId}:${serverId}`,
};

export function encrypt(plaintext: string, associatedData: string): string {
  return encryptSecret(plaintext, ring(), associatedData);
}

export function decrypt(envelope: string, associatedData: string): string {
  return decryptSecret(envelope, ring(), associatedData);
}
