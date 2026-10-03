import { prisma } from "@inrent/db";
import { evaluateFlag, FEATURE_FLAG_KEYS, type FeatureFlagKey, type FlagRecord } from "@inrent/core";
import { recordAudit } from "./audit";
import { requireAdminPermission } from "./authz";
import { ValidationError } from "./errors";

const TTL_MS = 15_000;
let cache: { at: number; flags: Map<string, FlagRecord> } | null = null;

async function load(): Promise<Map<string, FlagRecord>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.flags;
  const rows = await prisma.featureFlag.findMany();
  const flags = new Map(rows.map((r) => [r.key, { key: r.key, enabled: r.enabled, orgAllowlist: r.orgAllowlist }]));
  cache = { at: Date.now(), flags };
  return flags;
}

export function invalidateFlagCache() {
  cache = null;
}

export async function isFeatureEnabled(key: FeatureFlagKey, organizationId?: string | null): Promise<boolean> {
  const flags = await load();
  return evaluateFlag(key, flags.get(key), { organizationId, env: process.env });
}

export async function listFlags() {
  return prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
}

export async function setFeatureFlag(adminUserId: string, key: string, input: { enabled?: boolean; orgAllowlist?: string[] }) {
  await requireAdminPermission(adminUserId, "flags:write");
  if (!FEATURE_FLAG_KEYS.includes(key as FeatureFlagKey)) throw new ValidationError(`Unknown flag ${key}`);
  const before = await prisma.featureFlag.findUnique({ where: { key } });
  const flag = await prisma.featureFlag.upsert({
    where: { key },
    create: { key, description: key, enabled: input.enabled ?? false, orgAllowlist: input.orgAllowlist ?? [], updatedById: adminUserId },
    update: { enabled: input.enabled, orgAllowlist: input.orgAllowlist, updatedById: adminUserId },
  });
  invalidateFlagCache();
  await recordAudit({ actorType: "ADMIN", actorId: adminUserId, action: "flag.updated", targetType: "feature_flag", targetId: key, metadata: { from: before?.enabled ?? null, to: flag.enabled } });
  return flag;
}
