import type { Context } from "hono";
import {
  computeCost,
  Errors,
  InrentError,
  isInrentError,
  rankCandidates,
  type CostBreakdown,
  type NormalizedUsage,
  type PriceConfig,
  type RateLimitRule,
  type RouteCandidate,
  type RouteDecision,
  type RoutePreferences,
  type RouteRequirements,
  type RoutingPolicy,
} from "@inrent/core";
import { hashIp } from "@inrent/core/server";
import type { ProviderAdapter } from "@inrent/providers";
import type { RequestRecord } from "@inrent/services";
import { isFeatureEnabled } from "@inrent/services";
import type { GatewayState } from "../state";
import type { GatewayAuth, GatewayDeps, GatewayEnv } from "../types";
import { buildCandidates, explainUnavailable, type CandidateMeta, type CandidateSet, type EndpointKind } from "./candidates";
import { preflight } from "./preflight";
import { enforceFreeTierQuota } from "./freeTier";
import { enforceRateLimits, recordTokenUsage } from "./rateLimits";

export interface Attempt {
  provider: string;
  model: string;
  billingMode: string;
  outcome: "success" | "error" | "skipped";
  code?: string;
  status?: number;
  latencyMs?: number;
}

export class PipelineError extends Error {
  constructor(
    readonly error: InrentError,
    readonly attempts: Attempt[],
  ) {
    super(error.message);
  }
}

export interface PrepareInput {
  auth: GatewayAuth;
  kind: EndpointKind;
  modelRequested: string;
  fallbackModels?: string[];
  requirements: RouteRequirements;
  policy: RoutingPolicy;
  preferences: RoutePreferences;
  estimatedInputTokens: number;
  maxOutputTokens: number | null;
}

export interface Prepared {
  ranked: RouteCandidate[];
  meta: Map<string, CandidateMeta>;
  decision: RouteDecision;
  rules: RateLimitRule[];
  rateLimitHeaders: Record<string, string>;
  byokKeys: Map<string, string>;
}

/** Rate limits → catalog → policy → routing → credit/budget checks. */
export async function prepare(c: Context<GatewayEnv>, deps: GatewayDeps, state: GatewayState, input: PrepareInput): Promise<Prepared> {
  const { rules, headers } = await enforceRateLimits(input.auth, c.get("clientIp"), input.estimatedInputTokens, deps);
  const [catalog, byokKeys, betaModels, byokFlag] = await Promise.all([
    state.catalog.get(),
    state.byokKeys(input.auth.organizationId),
    isFeatureEnabled("BETA_MODELS_ENABLED", input.auth.organizationId),
    isFeatureEnabled("BYOK_ENABLED", input.auth.organizationId),
  ]);
  const ctx = {
    auth: input.auth,
    byokProviders: new Set(byokKeys.keys()),
    environment: deps.env.runtime,
    flags: { betaModels, byok: byokFlag },
    circuit: state.circuit,
  };
  const primary = buildCandidates(input.modelRequested, input.kind, catalog, ctx);
  const routeInput = {
    policy: input.policy,
    requirements: input.requirements,
    preferences: input.preferences,
    estimatedInputTokens: input.estimatedInputTokens,
    estimatedOutputTokens: input.maxOutputTokens ?? 512,
  };
  const decision = rankCandidates(primary.candidates, routeInput);
  const meta = new Map(primary.meta);
  let ranked = [...decision.ranked];
  const sets: CandidateSet[] = [primary];

  // Explicit fallback models are tried after the primary model's providers.
  for (const slug of input.fallbackModels ?? []) {
    if (input.preferences.allowFallbacks === false) break;
    let set: CandidateSet;
    try {
      set = buildCandidates(slug, input.kind, catalog, ctx);
    } catch {
      continue;
    }
    sets.push(set);
    const d = rankCandidates(set.candidates, { ...routeInput, preferences: { ...input.preferences, maxAttempts: 2 } });
    for (const [k, v] of set.meta) meta.set(k, v);
    ranked.push(...d.ranked);
    decision.rejected.push(...d.rejected);
  }

  if (!ranked.length) {
    if (!primary.candidates.length) throw explainUnavailable(input.modelRequested, primary);
    const reasons = new Set(decision.rejected.map((r) => r.reason));
    if ([...reasons].every((r) => r === "provider_down")) {
      throw Errors.modelUnavailable(input.modelRequested, "All providers for this model are currently unavailable. Try again shortly or set fallback models.");
    }
    const unsupported = [...reasons].filter((r) => r.endsWith("_not_supported"));
    if (unsupported.length) {
      throw Errors.invalidRequest(`'${input.modelRequested}' does not support this request (${unsupported.map((r) => r.replace(/_not_supported$/, "").replace(/_/g, " ")).join(", ")}).`, "model", "unsupported_capability");
    }
    if (reasons.has("context_length_exceeded")) {
      throw Errors.invalidRequest("The request exceeds the model's context window.", "messages", "context_length_exceeded");
    }
    throw explainUnavailable(input.modelRequested, primary);
  }

  const checked = await preflight(input.auth, ranked, meta, input.estimatedInputTokens, input.maxOutputTokens, deps);
  ranked = checked.ranked;
  await enforceFreeTierQuota(input.auth, ranked[0], deps);
  return { ranked, meta, decision, rules, rateLimitHeaders: headers, byokKeys };
}

function toInrentError(e: unknown): InrentError {
  if (isInrentError(e)) return e;
  return Errors.providerError(e instanceof Error ? e.message : "Upstream failure", { retryable: true });
}

/** Tries ranked candidates in order, falling back on retryable failures. */
export async function runWithFallback<T>(
  deps: GatewayDeps,
  state: GatewayState,
  prepared: Prepared,
  requestId: string,
  call: (adapter: ProviderAdapter, candidate: RouteCandidate, meta: CandidateMeta) => Promise<T>,
): Promise<{ result: T; candidate: RouteCandidate; meta: CandidateMeta; attempts: Attempt[]; providerLatencyMs: number }> {
  const attempts: Attempt[] = [];
  let lastError: InrentError | null = null;
  for (const candidate of prepared.ranked) {
    const meta = prepared.meta.get(candidate.endpointId)!;
    const provider = meta.endpoint.provider;
    const base = { provider: provider.slug, model: candidate.modelSlug, billingMode: candidate.billingMode };
    if (provider.rpmLimit) {
      const rl = await deps.rateLimitStore.hit(`rl:provider:${provider.slug}:rpm`, provider.rpmLimit, 60_000, 1, deps.now()).catch(() => null);
      if (rl && !rl.allowed) {
        attempts.push({ ...base, outcome: "skipped", code: "provider_capacity" });
        continue;
      }
    }
    const apiKey =
      candidate.billingMode === "BYOK"
        ? (prepared.byokKeys.get(provider.id) ?? null)
        : provider.credentialRef
          ? await deps.secretResolver(provider.credentialRef)
          : null;
    const adapter = deps.createAdapter({ slug: provider.slug, adapter: provider.adapter, baseUrl: provider.baseUrl, apiKey });
    const started = performance.now();
    try {
      const result = await call(adapter, candidate, meta);
      const latencyMs = Math.round(performance.now() - started);
      state.circuit.record(provider.slug, true);
      attempts.push({ ...base, outcome: "success", latencyMs });
      if (attempts.length > 1) {
        const from = attempts.find((a) => a.outcome === "error")?.provider ?? "unknown";
        deps.metrics.fallbacks.inc({ from, to: provider.slug });
      }
      return { result, candidate, meta, attempts, providerLatencyMs: latencyMs };
    } catch (e) {
      const err = toInrentError(e);
      const latencyMs = Math.round(performance.now() - started);
      if (err.code === "client_closed_request") throw new PipelineError(err, attempts);
      if (err.retryable) state.circuit.record(provider.slug, false);
      deps.metrics.providerErrors.inc({ provider: provider.slug, code: err.code });
      attempts.push({ ...base, outcome: "error", code: err.code, status: err.status, latencyMs });
      if (!err.retryable) throw new PipelineError(err, attempts);
      lastError = err;
    }
  }
  const failed = attempts.filter((a) => a.outcome === "error").length;
  const error =
    lastError && failed > 1
      ? new InrentError(lastError.type, lastError.code, `All ${failed} providers failed. Last error: ${lastError.message}`, { status: lastError.status, details: { attempts: failed } })
      : (lastError ?? Errors.modelUnavailable("requested model", "All providers are at capacity. Retry shortly."));
  throw new PipelineError(error, attempts);
}

const ZERO_PRICE: PriceConfig = { inputPerMTok: null, outputPerMTok: null, platformMarkupPct: "0" };

export function costFor(candidate: RouteCandidate, meta: CandidateMeta, usage: NormalizedUsage, deps: GatewayDeps): CostBreakdown {
  return computeCost(meta.price ?? ZERO_PRICE, { ...usage, requests: 1 }, {
    billingMode: candidate.billingMode,
    costMultiplier: meta.endpoint.provider.costMultiplier.toString(),
    byokFeePct: deps.env.BYOK_FEE_PCT,
  });
}

const PAYLOAD_LIMIT = 64 * 1024;

export function capPayload(value: unknown): RequestRecord["promptPayload"] {
  if (value === undefined || value === null) return null;
  const json = JSON.stringify(value);
  if (json.length <= PAYLOAD_LIMIT) return JSON.parse(json);
  return { truncated: true, bytes: json.length, preview: json.slice(0, PAYLOAD_LIMIT) };
}

export interface RecordInput {
  c: Context<GatewayEnv>;
  auth: GatewayAuth;
  endpoint: string;
  modelRequested: string;
  stream: boolean;
  candidate?: RouteCandidate | null;
  meta?: CandidateMeta | null;
  status: "SUCCESS" | "ERROR" | "CANCELLED";
  httpStatus: number;
  error?: InrentError | null;
  usage?: NormalizedUsage | null;
  units?: number;
  cost?: CostBreakdown | null;
  finishReason?: string | null;
  ttftMs?: number | null;
  providerLatencyMs?: number | null;
  attempts: Attempt[];
  decision?: RouteDecision | null;
  prompt?: unknown;
  response?: unknown;
}

export function buildRecord(deps: GatewayDeps, i: RecordInput): RequestRecord {
  const startedAt = i.c.get("startedAt");
  const logPayloads = !i.auth.zeroRetention;
  return {
    requestId: i.c.get("requestId"),
    traceId: i.c.get("traceId"),
    organizationId: i.auth.organizationId,
    projectId: i.auth.projectId,
    apiKeyId: i.auth.keyId,
    userId: i.auth.userId,
    source: i.auth.source,
    endpoint: i.endpoint,
    modelRequested: i.modelRequested,
    modelSlug: i.candidate?.modelSlug ?? null,
    providerSlug: i.candidate?.providerSlug ?? null,
    modelProviderId: i.candidate?.endpointId ?? null,
    providerModelId: i.candidate?.providerModelId ?? null,
    billingMode: i.candidate?.billingMode ?? "PLATFORM",
    status: i.status,
    httpStatus: i.httpStatus,
    errorType: i.error?.type ?? null,
    errorCode: i.error?.code ?? null,
    errorMessage: i.error?.message ?? null,
    stream: i.stream,
    finishReason: i.finishReason ?? null,
    inputTokens: i.usage?.inputTokens ?? 0,
    outputTokens: i.usage?.outputTokens ?? 0,
    cachedTokens: i.usage?.cachedTokens ?? 0,
    reasoningTokens: i.usage?.reasoningTokens ?? 0,
    units: i.units ?? 0,
    usageEstimated: i.usage?.estimated ?? false,
    providerCostNano: (i.cost?.providerCostNano ?? 0n).toString(),
    userChargeNano: (i.cost?.userChargeNano ?? 0n).toString(),
    marginNano: (i.cost?.marginNano ?? 0n).toString(),
    latencyMs: Math.round(performance.now() - startedAt),
    ttftMs: i.ttftMs ?? null,
    providerLatencyMs: i.providerLatencyMs ?? null,
    fallbackCount: Math.max(0, i.attempts.filter((a) => a.outcome !== "success").length),
    routing: {
      policy: i.decision?.policy ?? null,
      attempts: i.attempts,
      rejected: (i.decision?.rejected ?? []).slice(0, 20),
    } as unknown as RequestRecord["routing"],
    promptPayload: logPayloads && i.auth.promptLogging ? capPayload(i.prompt) : null,
    responsePayload: logPayloads && i.auth.responseLogging ? capPayload(i.response) : null,
    ipHash: hashIp(i.c.get("clientIp"), deps.env.IP_HASH_SALT),
    userAgent: i.c.req.header("user-agent") ?? null,
    isDemo: false,
    createdAt: new Date(Date.now() - Math.round(performance.now() - startedAt)).toISOString(),
  };
}

/**
 * Persists the request log + charge. If the database write fails, the record is queued for
 * the worker to retry (idempotent on requestId) so usage is never silently lost.
 */
export async function finalize(deps: GatewayDeps, auth: GatewayAuth, record: RequestRecord, rules: RateLimitRule[] | null): Promise<void> {
  const endpointLabel = record.endpoint;
  deps.metrics.requests.inc({ endpoint: endpointLabel, model: record.modelSlug ?? "none", provider: record.providerSlug ?? "none", status: record.status.toLowerCase(), billing_mode: record.billingMode.toLowerCase() });
  deps.metrics.latency.observe({ endpoint: endpointLabel, provider: record.providerSlug ?? "none", stream: String(record.stream) }, (record.latencyMs ?? 0) / 1000);
  if (record.ttftMs !== null && record.providerSlug) deps.metrics.ttft.observe({ provider: record.providerSlug }, record.ttftMs / 1000);
  if (record.providerSlug) {
    deps.metrics.tokens.inc({ type: "input", provider: record.providerSlug }, record.inputTokens);
    deps.metrics.tokens.inc({ type: "output", provider: record.providerSlug }, record.outputTokens);
    deps.metrics.revenue.inc({ provider: record.providerSlug }, Number(record.userChargeNano));
    deps.metrics.providerCost.inc({ provider: record.providerSlug }, Number(record.providerCostNano));
  }
  if (rules) await recordTokenUsage(rules, record.inputTokens + record.outputTokens, deps);

  let balanceAfter: bigint | null = null;
  try {
    const result = await deps.persistRequest(record);
    balanceAfter = result.balanceAfterNano;
  } catch (e) {
    deps.reporter.captureException(e, { requestId: record.requestId, organizationId: record.organizationId, tags: { stage: "finalize" } });
    await deps.enqueue("usage", "finalize", { payload: JSON.stringify(record) }).catch((qe) => {
      deps.logger.error({ err: qe, requestId: record.requestId }, "failed to queue usage finalize — usage record lost");
    });
  }
  void deps.afterRequest(record, auth, balanceAfter).catch((e) => deps.logger.warn({ err: e }, "afterRequest failed"));
}

export function responseHeaders(c: Context<GatewayEnv>, extra: { candidate?: RouteCandidate | null; attempts?: Attempt[]; rateLimit?: Record<string, string>; chargeNano?: bigint | null }): Record<string, string> {
  const h: Record<string, string> = { "x-request-id": c.get("requestId"), "x-inrent-trace-id": c.get("traceId"), ...(extra.rateLimit ?? {}) };
  if (extra.candidate) {
    h["x-inrent-provider"] = extra.candidate.providerSlug;
    h["x-inrent-model"] = extra.candidate.modelSlug;
    h["x-inrent-billing-mode"] = extra.candidate.billingMode.toLowerCase();
  }
  if (extra.attempts) h["x-inrent-fallbacks"] = String(Math.max(0, extra.attempts.filter((a) => a.outcome !== "success").length));
  if (extra.chargeNano !== undefined && extra.chargeNano !== null) h["x-inrent-cost-usd"] = (Number(extra.chargeNano) / 1e9).toFixed(9);
  return h;
}
