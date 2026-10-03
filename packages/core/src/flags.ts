export const FEATURE_FLAG_KEYS = [
  "GPU_CLOUD_ENABLED",
  "MCP_ENABLED",
  "AGENTS_ENABLED",
  "BYOK_ENABLED",
  "NEW_ROUTER_ENABLED",
  "BETA_MODELS_ENABLED",
  "WEBHOOKS_ENABLED",
  "SIGNUPS_ENABLED",
] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

export interface FlagRecord {
  key: string;
  enabled: boolean;
  orgAllowlist: string[];
}

/**
 * Resolution order: environment override (INRENT_FLAG_<KEY>=true|false) → org allowlist →
 * stored global value → false.
 */
export function evaluateFlag(
  key: FeatureFlagKey,
  record: FlagRecord | undefined,
  opts: { organizationId?: string | null; env?: Record<string, string | undefined> } = {},
): boolean {
  const override = opts.env?.[`INRENT_FLAG_${key}`];
  if (override === "true") return true;
  if (override === "false") return false;
  if (!record) return false;
  if (opts.organizationId && record.orgAllowlist.includes(opts.organizationId)) return true;
  return record.enabled;
}
