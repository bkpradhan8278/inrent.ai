/**
 * Routing engine — a pure function from (candidates, policy, requirements, preferences)
 * to an ordered list of endpoints to try. The gateway executes the list in order and falls
 * back to the next candidate on retryable failures. Every decision is returned with reasons
 * so it can be logged and inspected.
 */

export type HealthStatus = "UNKNOWN" | "HEALTHY" | "DEGRADED" | "DOWN";
export type RoutingPolicy = "BALANCED" | "LOWEST_COST" | "LOWEST_LATENCY" | "BEST_QUALITY" | "CUSTOM";
export type CandidateBillingMode = "PLATFORM" | "BYOK";

export interface RouteCandidate {
  endpointId: string;
  modelId: string;
  modelSlug: string;
  providerId: string;
  providerSlug: string;
  providerModelId: string;
  billingMode: CandidateBillingMode;
  endpointPriority: number;
  providerPriority: number;
  health: HealthStatus;
  latencyP50Ms: number | null;
  ttftP50Ms: number | null;
  /** Customer-facing price in pico-USD per token, null when not configured. */
  inputPicoPerToken: bigint | null;
  outputPicoPerToken: bigint | null;
  qualityTier: number;
  contextLength: number | null;
  supports: {
    tools: boolean;
    vision: boolean;
    jsonMode: boolean;
    structuredOutput: boolean;
    streaming: boolean;
  };
}

export interface RouteRequirements {
  tools?: boolean;
  vision?: boolean;
  jsonMode?: boolean;
  structuredOutput?: boolean;
  streaming?: boolean;
}

export interface RoutePreferences {
  /** Providers to try first, in this order. */
  order?: string[];
  /** Only these providers may be used. */
  only?: string[];
  /** Never use these providers. */
  ignore?: string[];
  allowFallbacks?: boolean;
  preferByok?: boolean;
  /** Maximum attempts (including the first). */
  maxAttempts?: number;
}

export interface RouteInput {
  policy: RoutingPolicy;
  requirements: RouteRequirements;
  preferences?: RoutePreferences;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}

export interface RejectedCandidate {
  endpointId: string;
  providerSlug: string;
  modelSlug: string;
  reason: string;
}

export interface RouteDecision {
  policy: RoutingPolicy;
  ranked: RouteCandidate[];
  rejected: RejectedCandidate[];
  scores: Record<string, number>;
}

const DEFAULT_LATENCY_MS = 1500;
const MAX_ATTEMPTS_DEFAULT = 3;

function requirementReason(c: RouteCandidate, r: RouteRequirements): string | null {
  if (r.tools && !c.supports.tools) return "tools_not_supported";
  if (r.vision && !c.supports.vision) return "vision_not_supported";
  if (r.structuredOutput && !c.supports.structuredOutput) return "structured_output_not_supported";
  if (r.jsonMode && !c.supports.jsonMode && !c.supports.structuredOutput) return "json_mode_not_supported";
  if (r.streaming && !c.supports.streaming) return "streaming_not_supported";
  return null;
}

function estimatedCost(c: RouteCandidate, input: RouteInput): number | null {
  if (c.inputPicoPerToken === null && c.outputPicoPerToken === null) return null;
  const cost =
    BigInt(input.estimatedInputTokens) * (c.inputPicoPerToken ?? 0n) +
    BigInt(input.estimatedOutputTokens) * (c.outputPicoPerToken ?? 0n);
  return Number(cost);
}

function normalize(values: Array<number | null>): number[] {
  const known = values.filter((v): v is number => v !== null);
  const min = known.length ? Math.min(...known) : 0;
  const max = known.length ? Math.max(...known) : 0;
  return values.map((v) => {
    if (v === null) return 0.5; // unknown sits in the middle
    if (max === min) return 0;
    return (v - min) / (max - min);
  });
}

export function rankCandidates(candidates: RouteCandidate[], input: RouteInput): RouteDecision {
  const prefs = input.preferences ?? {};
  const rejected: RejectedCandidate[] = [];
  const reject = (c: RouteCandidate, reason: string) =>
    rejected.push({ endpointId: c.endpointId, providerSlug: c.providerSlug, modelSlug: c.modelSlug, reason });

  const only = prefs.only?.length ? new Set(prefs.only) : null;
  const ignore = new Set(prefs.ignore ?? []);
  const needed = input.estimatedInputTokens + input.estimatedOutputTokens;

  const eligible = candidates.filter((c) => {
    if (c.health === "DOWN") return reject(c, "provider_down"), false;
    if (only && !only.has(c.providerSlug)) return reject(c, "excluded_by_only"), false;
    if (ignore.has(c.providerSlug)) return reject(c, "excluded_by_ignore"), false;
    const reqReason = requirementReason(c, input.requirements);
    if (reqReason) return reject(c, reqReason), false;
    if (c.contextLength !== null && needed > c.contextLength) return reject(c, "context_length_exceeded"), false;
    return true;
  });

  const costs = normalize(eligible.map((c) => estimatedCost(c, input)));
  const latencies = normalize(eligible.map((c) => c.ttftP50Ms ?? c.latencyP50Ms ?? DEFAULT_LATENCY_MS));
  const qualities = normalize(eligible.map((c) => c.qualityTier));

  const scores: Record<string, number> = {};
  eligible.forEach((c, i) => {
    const cost = costs[i] ?? 0.5;
    const latency = latencies[i] ?? 0.5;
    const quality = qualities[i] ?? 0.5;
    let score: number;
    switch (input.policy) {
      case "LOWEST_COST":
        score = cost + latency * 0.05;
        break;
      case "LOWEST_LATENCY":
        score = latency + cost * 0.05;
        break;
      case "BEST_QUALITY":
        score = (1 - quality) + cost * 0.05 + latency * 0.05;
        break;
      case "CUSTOM":
      case "BALANCED":
      default:
        score = cost * 0.45 + latency * 0.35 + (1 - quality) * 0.2;
    }
    // Degraded endpoints stay eligible as fallbacks but rank behind healthy ones.
    if (c.health === "DEGRADED") score += 1.5;
    if (c.health === "UNKNOWN") score += 0.05;
    if (prefs.preferByok && c.billingMode === "BYOK") score -= 3;
    scores[c.endpointId] = Number(score.toFixed(6));
  });

  const orderIndex = new Map((prefs.order ?? []).map((slug, i) => [slug, i]));
  const ranked = [...eligible].sort((a, b) => {
    const oa = orderIndex.get(a.providerSlug);
    const ob = orderIndex.get(b.providerSlug);
    if (oa !== undefined || ob !== undefined) {
      if (oa === undefined) return 1;
      if (ob === undefined) return -1;
      if (oa !== ob) return oa - ob;
    }
    const diff = (scores[a.endpointId] ?? 0) - (scores[b.endpointId] ?? 0);
    if (Math.abs(diff) > 1e-9) return diff;
    if (a.providerPriority !== b.providerPriority) return a.providerPriority - b.providerPriority;
    if (a.endpointPriority !== b.endpointPriority) return a.endpointPriority - b.endpointPriority;
    return a.providerSlug.localeCompare(b.providerSlug) || a.endpointId.localeCompare(b.endpointId);
  });

  const maxAttempts = prefs.allowFallbacks === false ? 1 : Math.max(1, prefs.maxAttempts ?? MAX_ATTEMPTS_DEFAULT);
  return { policy: input.policy, ranked: ranked.slice(0, maxAttempts), rejected, scores };
}
