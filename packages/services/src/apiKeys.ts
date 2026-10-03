import { prisma, type KeyEnvironment } from "@inrent/db";
import { API_KEY_PERMISSIONS, type ApiKeyPermission } from "@inrent/core";
import { generateApiKey, hashApiKey, isWellFormedApiKey } from "@inrent/core/server";
import { recordAudit } from "./audit";
import { requireOrgPermission, requireProjectInOrg } from "./authz";
import { getServerEnv } from "./env";
import { NotFoundError, ValidationError } from "./errors";
import { CACHE_KEYS, getRedis } from "./redis";

export interface CreateApiKeyInput {
  organizationId: string;
  projectId: string;
  name: string;
  environment: KeyEnvironment;
  scope?: "PROJECT" | "PERSONAL" | "TEAM";
  permissions?: ApiKeyPermission[];
  allowedModels?: string[];
  spendLimitNano?: bigint | null;
  rpmLimit?: number | null;
  tpmLimit?: number | null;
  expiresAt?: Date | null;
}

export interface Actor {
  type: "USER" | "API_KEY";
  id: string;
  ipHash?: string | null;
  userAgent?: string | null;
}

/** Public shape of a key — never includes the hash. */
export const apiKeyPublicSelect = {
  id: true,
  name: true,
  organizationId: true,
  projectId: true,
  displayPrefix: true,
  lastFour: true,
  environment: true,
  scope: true,
  permissions: true,
  allowedModels: true,
  spendLimitNano: true,
  rpmLimit: true,
  tpmLimit: true,
  expiresAt: true,
  revokedAt: true,
  lastUsedAt: true,
  createdAt: true,
  createdById: true,
  project: { select: { id: true, name: true } },
} as const;

function validate(input: CreateApiKeyInput, planRpm: number | null, planTpm: number | null) {
  const name = input.name.trim();
  if (name.length < 1 || name.length > 64) throw new ValidationError("Key name must be 1–64 characters.");
  for (const p of input.permissions ?? []) {
    if (!API_KEY_PERMISSIONS.includes(p)) throw new ValidationError(`Unknown permission '${p}'.`);
  }
  if ((input.allowedModels ?? []).some((m) => !/^[a-z0-9._-]+\/[A-Za-z0-9._:-]+$/.test(m))) {
    throw new ValidationError("Allowed models must be model slugs like 'vendor/model'.");
  }
  if (input.spendLimitNano !== undefined && input.spendLimitNano !== null && input.spendLimitNano < 0n) {
    throw new ValidationError("Spending limit cannot be negative.");
  }
  if (input.rpmLimit != null && (input.rpmLimit < 1 || (planRpm !== null && input.rpmLimit > planRpm))) {
    throw new ValidationError(`Requests per minute must be between 1 and ${planRpm ?? "your plan limit"}.`);
  }
  if (input.tpmLimit != null && (input.tpmLimit < 1 || (planTpm !== null && input.tpmLimit > planTpm))) {
    throw new ValidationError(`Tokens per minute must be between 1 and ${planTpm ?? "your plan limit"}.`);
  }
  if (input.expiresAt && input.expiresAt.getTime() <= Date.now()) throw new ValidationError("Expiration must be in the future.");
  return name;
}

async function insertKey(input: CreateApiKeyInput, actor: Actor) {
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: input.organizationId }, include: { plan: true } });
  const name = validate(input, org.plan?.rpmLimit ?? null, org.plan?.tpmLimit ?? null);
  await requireProjectInOrg(input.projectId, input.organizationId);
  const generated = generateApiKey(input.environment);
  const record = await prisma.apiKey.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      createdById: actor.type === "USER" ? actor.id : null,
      name,
      displayPrefix: generated.displayPrefix,
      lastFour: generated.lastFour,
      keyHash: hashApiKey(generated.secret, getServerEnv().API_KEY_PEPPER),
      environment: input.environment,
      scope: input.scope ?? "PROJECT",
      permissions: input.permissions?.length ? input.permissions : ["inference"],
      allowedModels: input.allowedModels ?? [],
      spendLimitNano: input.spendLimitNano ?? null,
      rpmLimit: input.rpmLimit ?? null,
      tpmLimit: input.tpmLimit ?? null,
      expiresAt: input.expiresAt ?? null,
    },
    select: apiKeyPublicSelect,
  });
  return { record, secret: generated.secret };
}

/** Creates a key. The plaintext secret is returned exactly once and never stored. */
export async function createApiKey(actor: Actor, input: CreateApiKeyInput) {
  if (actor.type === "USER") await requireOrgPermission(actor.id, input.organizationId, "keys:write");
  const result = await insertKey(input, actor);
  await recordAudit({
    organizationId: input.organizationId,
    actorType: actor.type,
    actorId: actor.id,
    action: "api_key.created",
    targetType: "api_key",
    targetId: result.record.id,
    metadata: { name: result.record.name, environment: input.environment, projectId: input.projectId },
    ipHash: actor.ipHash,
    userAgent: actor.userAgent,
  });
  return result;
}

async function invalidateCache(keyId: string) {
  const key = await prisma.apiKey.findUnique({ where: { id: keyId }, select: { keyHash: true } });
  if (!key) return;
  try {
    await getRedis().del(CACHE_KEYS.apiKey(key.keyHash));
  } catch {
    // Cache entries also expire on their own (short TTL); revocation is enforced by the DB.
  }
}

async function findOrgKey(organizationId: string, keyId: string) {
  const key = await prisma.apiKey.findFirst({ where: { id: keyId, organizationId, deletedAt: null } });
  if (!key) throw new NotFoundError("API key");
  return key;
}

export async function revokeApiKey(actor: Actor, organizationId: string, keyId: string, reason = "revoked_by_user") {
  if (actor.type === "USER") await requireOrgPermission(actor.id, organizationId, "keys:write");
  const key = await findOrgKey(organizationId, keyId);
  if (!key.revokedAt) {
    await prisma.apiKey.update({ where: { id: key.id }, data: { revokedAt: new Date(), revokedReason: reason } });
  }
  await invalidateCache(key.id);
  await recordAudit({ organizationId, actorType: actor.type, actorId: actor.id, action: "api_key.revoked", targetType: "api_key", targetId: key.id, metadata: { reason } });
}

export async function deleteApiKey(actor: Actor, organizationId: string, keyId: string) {
  if (actor.type === "USER") await requireOrgPermission(actor.id, organizationId, "keys:write");
  const key = await findOrgKey(organizationId, keyId);
  const now = new Date();
  await prisma.apiKey.update({ where: { id: key.id }, data: { deletedAt: now, revokedAt: key.revokedAt ?? now, revokedReason: key.revokedReason ?? "deleted" } });
  await invalidateCache(key.id);
  await recordAudit({ organizationId, actorType: actor.type, actorId: actor.id, action: "api_key.deleted", targetType: "api_key", targetId: key.id });
}

/** Issues a replacement key with identical settings and revokes the old one. */
export async function rotateApiKey(actor: Actor, organizationId: string, keyId: string) {
  if (actor.type === "USER") await requireOrgPermission(actor.id, organizationId, "keys:write");
  const old = await findOrgKey(organizationId, keyId);
  if (old.revokedAt) throw new ValidationError("Revoked keys cannot be rotated. Create a new key instead.");
  const result = await insertKey(
    {
      organizationId,
      projectId: old.projectId,
      name: old.name,
      environment: old.environment,
      scope: old.scope,
      permissions: old.permissions as ApiKeyPermission[],
      allowedModels: old.allowedModels,
      spendLimitNano: old.spendLimitNano,
      rpmLimit: old.rpmLimit,
      tpmLimit: old.tpmLimit,
      expiresAt: old.expiresAt && old.expiresAt > new Date() ? old.expiresAt : null,
    },
    actor,
  );
  await prisma.$transaction([
    prisma.apiKey.update({ where: { id: result.record.id }, data: { rotatedFromId: old.id } }),
    prisma.apiKey.update({ where: { id: old.id }, data: { revokedAt: new Date(), revokedReason: "rotated" } }),
  ]);
  await invalidateCache(old.id);
  await recordAudit({ organizationId, actorType: actor.type, actorId: actor.id, action: "api_key.rotated", targetType: "api_key", targetId: old.id, metadata: { newKeyId: result.record.id } });
  return result;
}

export async function updateApiKeyLimits(
  actor: Actor,
  organizationId: string,
  keyId: string,
  input: { name?: string; allowedModels?: string[]; spendLimitNano?: bigint | null; rpmLimit?: number | null; tpmLimit?: number | null; expiresAt?: Date | null },
) {
  if (actor.type === "USER") await requireOrgPermission(actor.id, organizationId, "keys:write");
  const key = await findOrgKey(organizationId, keyId);
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  validate(
    {
      organizationId,
      projectId: key.projectId,
      environment: key.environment,
      name: input.name ?? key.name,
      allowedModels: input.allowedModels,
      spendLimitNano: input.spendLimitNano,
      rpmLimit: input.rpmLimit,
      tpmLimit: input.tpmLimit,
      expiresAt: input.expiresAt,
    },
    org.plan?.rpmLimit ?? null,
    org.plan?.tpmLimit ?? null,
  );
  const updated = await prisma.apiKey.update({
    where: { id: key.id },
    data: {
      name: input.name?.trim() || undefined,
      allowedModels: input.allowedModels,
      spendLimitNano: input.spendLimitNano,
      rpmLimit: input.rpmLimit,
      tpmLimit: input.tpmLimit,
      expiresAt: input.expiresAt,
    },
    select: apiKeyPublicSelect,
  });
  await invalidateCache(key.id);
  await recordAudit({ organizationId, actorType: actor.type, actorId: actor.id, action: "api_key.updated", targetType: "api_key", targetId: key.id, metadata: { fields: Object.keys(input) } });
  return updated;
}

export async function listApiKeys(organizationId: string, opts: { projectId?: string; includeRevoked?: boolean } = {}) {
  return prisma.apiKey.findMany({
    where: {
      organizationId,
      deletedAt: null,
      ...(opts.projectId ? { projectId: opts.projectId } : {}),
      ...(opts.includeRevoked ? {} : { revokedAt: null }),
    },
    select: apiKeyPublicSelect,
    orderBy: { createdAt: "desc" },
  });
}

/** Authenticated key context used by the gateway. */
export interface ApiKeyAuth {
  keyId: string;
  keyHash: string;
  organizationId: string;
  projectId: string;
  environment: KeyEnvironment;
  permissions: string[];
  allowedModels: string[];
  projectAllowedModels: string[];
  spendLimitNano: string | null;
  projectBudgetNano: string | null;
  orgMonthlyCapNano: string | null;
  rpmLimit: number | null;
  tpmLimit: number | null;
  planRpm: number;
  planTpm: number;
  expiresAt: string | null;
  revokedAt: string | null;
  orgSuspended: boolean;
  routingPolicy: string;
  preferByok: boolean;
  promptLogging: boolean;
  responseLogging: boolean;
  zeroRetention: boolean;
  isDemo: boolean;
}

export type ResolveResult = { ok: true; auth: ApiKeyAuth } | { ok: false; reason: "malformed" | "unknown" | "revoked" | "expired" | "suspended" };

/** Loads key + org context by hash (DB). Callers add caching. */
export async function loadApiKeyAuth(keyHash: string): Promise<ApiKeyAuth | null> {
  const key = await prisma.apiKey.findUnique({
    where: { keyHash },
    include: { project: true, organization: { include: { plan: true } } },
  });
  if (!key || key.deletedAt || key.project.deletedAt || key.organization.deletedAt) return null;
  return {
    keyId: key.id,
    keyHash,
    organizationId: key.organizationId,
    projectId: key.projectId,
    environment: key.environment,
    permissions: key.permissions,
    allowedModels: key.allowedModels,
    projectAllowedModels: key.project.allowedModels,
    spendLimitNano: key.spendLimitNano?.toString() ?? null,
    projectBudgetNano: key.project.monthlyBudgetNano?.toString() ?? null,
    orgMonthlyCapNano: key.organization.monthlySpendCapNano?.toString() ?? null,
    rpmLimit: key.rpmLimit,
    tpmLimit: key.tpmLimit,
    planRpm: key.organization.plan?.rpmLimit ?? 20,
    planTpm: key.organization.plan?.tpmLimit ?? 40_000,
    expiresAt: key.expiresAt?.toISOString() ?? null,
    revokedAt: key.revokedAt?.toISOString() ?? null,
    orgSuspended: Boolean(key.organization.suspendedAt),
    routingPolicy: key.organization.routingPolicy,
    preferByok: key.organization.preferByok,
    promptLogging: key.organization.promptLogging,
    responseLogging: key.organization.responseLogging,
    zeroRetention: key.organization.zeroRetention,
    isDemo: key.organization.isDemo,
  };
}

export function checkKeyStatus(auth: ApiKeyAuth, now = new Date()): ResolveResult {
  if (auth.revokedAt) return { ok: false, reason: "revoked" };
  if (auth.expiresAt && new Date(auth.expiresAt) <= now) return { ok: false, reason: "expired" };
  if (auth.orgSuspended) return { ok: false, reason: "suspended" };
  return { ok: true, auth };
}

export async function resolveApiKey(secret: string): Promise<ResolveResult> {
  if (!isWellFormedApiKey(secret)) return { ok: false, reason: "malformed" };
  const auth = await loadApiKeyAuth(hashApiKey(secret, getServerEnv().API_KEY_PEPPER));
  if (!auth) return { ok: false, reason: "unknown" };
  return checkKeyStatus(auth);
}
