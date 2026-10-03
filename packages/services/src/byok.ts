import { prisma } from "@inrent/db";
import { secretHint } from "@inrent/core/server";
import { createAdapter } from "@inrent/providers";
import { recordAudit } from "./audit";
import { requireOrgPermission } from "./authz";
import { NotFoundError, ValidationError } from "./errors";
import { isFeatureEnabled } from "./flags";
import { aad, decrypt, encrypt } from "./secrets";

/**
 * Bring-your-own-key credentials. Keys are encrypted with AES-256-GCM bound to the
 * organization and provider, are never returned after storage, and are only decrypted
 * inside the gateway for the duration of a request.
 */

export const byokPublicSelect = {
  id: true,
  label: true,
  keyHint: true,
  enabled: true,
  lastTestedAt: true,
  lastTestOk: true,
  lastTestError: true,
  createdAt: true,
  updatedAt: true,
  provider: { select: { id: true, slug: true, name: true } },
} as const;

async function assertProvider(providerId: string) {
  const provider = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!provider || provider.adapter === "MOCK") throw new NotFoundError("Provider");
  if (!provider.byokSupported) throw new ValidationError(`${provider.name} does not support bring-your-own-key.`);
  return provider;
}

export async function addByokCredential(userId: string, organizationId: string, input: { providerId: string; label: string; apiKey: string }) {
  await requireOrgPermission(userId, organizationId, "byok:write");
  if (!(await isFeatureEnabled("BYOK_ENABLED", organizationId))) throw new ValidationError("BYOK is not enabled.");
  const provider = await assertProvider(input.providerId);
  const key = input.apiKey.trim();
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) throw new ValidationError("That doesn't look like a valid API key.");
  const label = input.label.trim().slice(0, 64) || `${provider.name} key`;
  const credential = await prisma.byokCredential.create({
    data: {
      organizationId,
      providerId: provider.id,
      label,
      encryptedKey: encrypt(key, aad.byok(organizationId, provider.id)),
      keyHint: secretHint(key),
      createdById: userId,
    },
    select: byokPublicSelect,
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "byok.created", targetType: "byok_credential", targetId: credential.id, metadata: { provider: provider.slug } });
  return credential;
}

async function findCredential(organizationId: string, id: string) {
  const c = await prisma.byokCredential.findFirst({ where: { id, organizationId, deletedAt: null }, include: { provider: true } });
  if (!c) throw new NotFoundError("Credential");
  return c;
}

export async function rotateByokCredential(userId: string, organizationId: string, id: string, apiKey: string) {
  await requireOrgPermission(userId, organizationId, "byok:write");
  const c = await findCredential(organizationId, id);
  const key = apiKey.trim();
  if (key.length < 8 || key.length > 512 || /\s/.test(key)) throw new ValidationError("That doesn't look like a valid API key.");
  await prisma.byokCredential.update({
    where: { id: c.id },
    data: { encryptedKey: encrypt(key, aad.byok(organizationId, c.providerId)), keyHint: secretHint(key), lastTestedAt: null, lastTestOk: null, lastTestError: null },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "byok.rotated", targetType: "byok_credential", targetId: c.id });
}

export async function setByokEnabled(userId: string, organizationId: string, id: string, enabled: boolean) {
  await requireOrgPermission(userId, organizationId, "byok:write");
  const c = await findCredential(organizationId, id);
  await prisma.byokCredential.update({ where: { id: c.id }, data: { enabled } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: enabled ? "byok.enabled" : "byok.disabled", targetType: "byok_credential", targetId: c.id });
}

export async function deleteByokCredential(userId: string, organizationId: string, id: string) {
  await requireOrgPermission(userId, organizationId, "byok:write");
  const c = await findCredential(organizationId, id);
  // Crypto-shred: drop the ciphertext as well as soft-deleting the row.
  await prisma.byokCredential.update({ where: { id: c.id }, data: { deletedAt: new Date(), enabled: false, encryptedKey: "" } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "byok.deleted", targetType: "byok_credential", targetId: c.id });
}

/** Verifies the key against the provider's model listing endpoint. */
export async function testByokCredential(userId: string, organizationId: string, id: string) {
  await requireOrgPermission(userId, organizationId, "byok:write");
  const c = await findCredential(organizationId, id);
  const apiKey = decrypt(c.encryptedKey, aad.byok(organizationId, c.providerId));
  const adapter = createAdapter({ slug: c.provider.slug, adapter: c.provider.adapter, baseUrl: c.provider.baseUrl, apiKey }, { allowMock: false });
  const result = await adapter.healthCheck({ requestId: `byok-test-${c.id}`, timeoutMs: 10_000 });
  const error = result.ok ? null : result.status === 401 || result.status === 403 ? "The provider rejected this key." : (result.error ?? "Test failed");
  await prisma.byokCredential.update({ where: { id: c.id }, data: { lastTestedAt: new Date(), lastTestOk: result.ok, lastTestError: error } });
  return { ok: result.ok, latencyMs: result.latencyMs, error };
}

export async function listByokCredentials(organizationId: string) {
  return prisma.byokCredential.findMany({ where: { organizationId, deletedAt: null }, select: byokPublicSelect, orderBy: { createdAt: "desc" } });
}

/** Gateway-side lookup: returns decrypted keys for enabled credentials, keyed by provider id. */
export async function loadByokKeys(organizationId: string): Promise<Map<string, string>> {
  const creds = await prisma.byokCredential.findMany({
    where: { organizationId, enabled: true, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
  const map = new Map<string, string>();
  for (const c of creds) {
    if (map.has(c.providerId) || !c.encryptedKey) continue;
    try {
      map.set(c.providerId, decrypt(c.encryptedKey, aad.byok(organizationId, c.providerId)));
    } catch {
      // Undecryptable credentials are skipped (e.g. key ring misconfiguration) rather than failing requests.
    }
  }
  return map;
}
