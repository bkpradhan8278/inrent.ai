import type { Context } from "hono";
import { prisma } from "@inrent/db";
import { Errors, InrentError } from "@inrent/core";
import { extractBearer, hashApiKey, INTERNAL_ASSERTION_HEADER, isWellFormedApiKey, verifyInternalAssertion } from "@inrent/core/server";
import { checkKeyStatus, loadApiKeyAuth, type ApiKeyAuth } from "@inrent/services";
import { CACHE_KEYS } from "@inrent/services/redis";
import type { GatewayAuth, GatewayDeps, GatewayEnv } from "./types";

const KEY_CACHE_TTL = 60;
const NEGATIVE_CACHE_TTL = 15;
const AUTH_FAIL_LIMIT_PER_MIN = 60;

function fromApiKey(a: ApiKeyAuth): GatewayAuth {
  const big = (v: string | null) => (v === null ? null : BigInt(v));
  return {
    kind: "api_key",
    keyId: a.keyId,
    organizationId: a.organizationId,
    projectId: a.projectId,
    userId: null,
    source: "api",
    permissions: a.permissions,
    allowedModels: a.allowedModels,
    projectAllowedModels: a.projectAllowedModels,
    keyRpm: a.rpmLimit,
    keyTpm: a.tpmLimit,
    planRpm: a.planRpm,
    planTpm: a.planTpm,
    keySpendLimitNano: big(a.spendLimitNano),
    projectBudgetNano: big(a.projectBudgetNano),
    orgMonthlyCapNano: big(a.orgMonthlyCapNano),
    lowBalanceThresholdNano: big(a.lowBalanceThresholdNano),
    autoRechargeEnabled: a.autoRechargeEnabled,
    routingPolicy: a.routingPolicy,
    preferByok: a.preferByok,
    promptLogging: a.promptLogging,
    responseLogging: a.responseLogging,
    zeroRetention: a.zeroRetention,
    isDemo: a.isDemo,
  };
}

async function internalAuth(token: string, deps: GatewayDeps): Promise<GatewayAuth> {
  const assertion = verifyInternalAssertion(token, deps.env.INTERNAL_SERVICE_SECRET);
  if (!assertion) throw Errors.invalidApiKey();
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId: assertion.organizationId, userId: assertion.userId } },
    include: { organization: { include: { plan: true } } },
  });
  const project = await prisma.project.findFirst({ where: { id: assertion.projectId, organizationId: assertion.organizationId, deletedAt: null } });
  if (!membership || !project || membership.organization.deletedAt) throw Errors.invalidApiKey();
  if (membership.role === "BILLING") throw Errors.permissionDenied("Your role cannot use the playground.");
  const org = membership.organization;
  if (org.suspendedAt) throw Errors.suspended();
  return {
    kind: "internal",
    keyId: null,
    organizationId: org.id,
    projectId: project.id,
    userId: assertion.userId,
    source: assertion.source,
    permissions: ["inference"],
    allowedModels: [],
    projectAllowedModels: project.allowedModels,
    keyRpm: 30,
    keyTpm: null,
    planRpm: org.plan?.rpmLimit ?? 20,
    planTpm: org.plan?.tpmLimit ?? 40_000,
    keySpendLimitNano: null,
    projectBudgetNano: project.monthlyBudgetNano,
    orgMonthlyCapNano: org.monthlySpendCapNano,
    lowBalanceThresholdNano: org.lowBalanceThresholdNano,
    autoRechargeEnabled: org.autoRechargeEnabled,
    routingPolicy: org.routingPolicy,
    preferByok: org.preferByok,
    promptLogging: org.promptLogging,
    responseLogging: org.responseLogging,
    zeroRetention: org.zeroRetention,
    isDemo: org.isDemo,
  };
}

async function recordFailure(deps: GatewayDeps, ip: string | null, reason: string) {
  deps.metrics.authFailures.inc({ reason });
  if (!ip) return;
  await deps.rateLimitStore.add(`rl:authfail:${ip}`, 60_000, 1, deps.now()).catch(() => undefined);
}

/**
 * Authenticates a request: an internal assertion (dashboard playground) or a bearer API key.
 * Key contexts are cached briefly in Redis; revocation deletes the cache entry immediately.
 */
export async function authenticate(c: Context<GatewayEnv>, deps: GatewayDeps): Promise<GatewayAuth> {
  const ip = c.get("clientIp");
  if (ip) {
    const blocked = await deps.rateLimitStore.hit(`rl:authfail:${ip}`, AUTH_FAIL_LIMIT_PER_MIN, 60_000, 0, deps.now()).catch(() => null);
    if (blocked && !blocked.allowed) {
      throw Errors.rateLimited("Too many failed authentication attempts from this address. Try again shortly.", { "retry-after": String(Math.ceil(blocked.retryAfterMs / 1000)) }, "auth_rate_limited");
    }
  }

  const assertion = c.req.header(INTERNAL_ASSERTION_HEADER);
  if (assertion) {
    try {
      return await internalAuth(assertion, deps);
    } catch (e) {
      await recordFailure(deps, ip, "invalid_assertion");
      throw e;
    }
  }

  const token = extractBearer(c.req.header("authorization")) ?? c.req.header("x-api-key")?.trim() ?? null;
  if (!token) {
    deps.metrics.authFailures.inc({ reason: "missing" });
    throw Errors.missingApiKey();
  }
  if (!isWellFormedApiKey(token)) {
    await recordFailure(deps, ip, "malformed");
    throw Errors.invalidApiKey();
  }
  const hash = hashApiKey(token, deps.env.API_KEY_PEPPER);
  const cacheKey = CACHE_KEYS.apiKey(hash);
  let keyAuth: ApiKeyAuth | null = null;
  const cached = await deps.kv.get(cacheKey).catch(() => null);
  if (cached === "null") {
    await recordFailure(deps, ip, "unknown");
    throw Errors.invalidApiKey();
  }
  if (cached) {
    keyAuth = JSON.parse(cached) as ApiKeyAuth;
  } else {
    keyAuth = await loadApiKeyAuth(hash);
    await deps.kv.set(cacheKey, keyAuth ? JSON.stringify(keyAuth) : "null", keyAuth ? KEY_CACHE_TTL : NEGATIVE_CACHE_TTL).catch(() => undefined);
  }
  if (!keyAuth) {
    await recordFailure(deps, ip, "unknown");
    throw Errors.invalidApiKey();
  }
  const status = checkKeyStatus(keyAuth, new Date(deps.now()));
  if (!status.ok) {
    await recordFailure(deps, ip, status.reason);
    if (status.reason === "revoked") throw Errors.revokedApiKey();
    if (status.reason === "expired") throw Errors.expiredApiKey();
    if (status.reason === "suspended") throw Errors.suspended();
    throw Errors.invalidApiKey();
  }
  return fromApiKey(keyAuth);
}

export function requirePermission(auth: GatewayAuth, permission: string): void {
  if (!auth.permissions.includes(permission)) {
    throw new InrentError("permission_error", "insufficient_key_permissions", `This API key lacks the '${permission}' permission.`);
  }
}
