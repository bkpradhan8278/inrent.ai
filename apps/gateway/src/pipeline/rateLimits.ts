import { evaluateRateLimits, type RateLimitRule } from "@inrent/core";
import { Errors } from "@inrent/core";
import type { GatewayAuth, GatewayDeps } from "../types";

const MINUTE = 60_000;
const IP_RPM = Number(process.env.GATEWAY_IP_RPM ?? 1_200);

export function buildRules(auth: GatewayAuth, ip: string | null, estimatedTokens: number): RateLimitRule[] {
  const rules: RateLimitRule[] = [];
  if (ip) rules.push({ id: "ip:rpm", kind: "requests", key: `rl:ip:${ip}:rpm`, limit: IP_RPM, windowMs: MINUTE, cost: 1 });
  if (auth.keyId) {
    rules.push({ id: "api_key:rpm", kind: "requests", key: `rl:key:${auth.keyId}:rpm`, limit: auth.keyRpm ?? auth.planRpm, windowMs: MINUTE, cost: 1 });
    rules.push({ id: "api_key:tpm", kind: "tokens", key: `rl:key:${auth.keyId}:tpm`, limit: auth.keyTpm ?? auth.planTpm, windowMs: MINUTE, cost: estimatedTokens });
  } else if (auth.userId) {
    rules.push({ id: "user:rpm", kind: "requests", key: `rl:user:${auth.userId}:rpm`, limit: auth.keyRpm ?? 30, windowMs: MINUTE, cost: 1 });
  }
  rules.push({ id: "organization:rpm", kind: "requests", key: `rl:org:${auth.organizationId}:rpm`, limit: auth.planRpm, windowMs: MINUTE, cost: 1 });
  rules.push({ id: "organization:tpm", kind: "tokens", key: `rl:org:${auth.organizationId}:tpm`, limit: auth.planTpm, windowMs: MINUTE, cost: estimatedTokens });
  return rules;
}

/** Applies request and token limits; throws a 429 with standard headers when exceeded. */
export async function enforceRateLimits(auth: GatewayAuth, ip: string | null, estimatedTokens: number, deps: GatewayDeps) {
  const rules = buildRules(auth, ip, estimatedTokens);
  const outcome = await evaluateRateLimits(deps.rateLimitStore, rules, deps.now());
  if (!outcome.allowed) {
    const scope = outcome.violated!.id;
    deps.metrics.rateLimited.inc({ scope });
    const what = scope.endsWith("tpm") ? "tokens per minute" : "requests per minute";
    const who = scope.startsWith("api_key") ? "this API key" : scope.startsWith("organization") ? "your organization" : scope.startsWith("ip") ? "this IP address" : "your account";
    throw Errors.rateLimited(`Rate limit exceeded: ${what} for ${who}. Retry after ${outcome.headers["retry-after"]}s.`, outcome.headers);
  }
  return { rules, headers: outcome.headers };
}

/** Post-hoc token accounting once the real usage is known. */
export async function recordTokenUsage(rules: RateLimitRule[], actualTokens: number, deps: GatewayDeps) {
  for (const rule of rules) {
    if (rule.kind !== "tokens") continue;
    const extra = actualTokens - rule.cost;
    if (extra > 0) await deps.rateLimitStore.add(rule.key, rule.windowMs, extra, deps.now()).catch(() => undefined);
  }
}
