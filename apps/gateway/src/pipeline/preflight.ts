import { Errors, estimateMaxCharge, formatUsd, type InrentError, type RouteCandidate } from "@inrent/core";
import { getSpendState, type SpendState } from "@inrent/services";
import type { GatewayAuth, GatewayDeps } from "../types";
import type { CandidateMeta } from "./candidates";
import { isFreeCandidate } from "./freeTier";

function exceeds(spent: bigint, estimate: bigint, limit: bigint | null): boolean {
  if (limit === null) return false;
  return spent >= limit || spent + estimate > limit;
}

export function budgetViolation(auth: GatewayAuth, spend: SpendState, estimate: bigint): InrentError | null {
  if (exceeds(spend.keyTotalNano, estimate, auth.keySpendLimitNano)) {
    return Errors.budgetExceeded("api_key", { limit_usd: formatUsd(auth.keySpendLimitNano!), spent_usd: formatUsd(spend.keyTotalNano) });
  }
  if (exceeds(spend.projectMonthNano, estimate, auth.projectBudgetNano)) {
    return Errors.budgetExceeded("project", { limit_usd: formatUsd(auth.projectBudgetNano!), spent_usd: formatUsd(spend.projectMonthNano) });
  }
  if (exceeds(spend.orgMonthNano, estimate, auth.orgMonthlyCapNano)) {
    return Errors.budgetExceeded("organization", { limit_usd: formatUsd(auth.orgMonthlyCapNano!), spent_usd: formatUsd(spend.orgMonthNano) });
  }
  if (spend.balanceNano <= 0n || spend.balanceNano < estimate) {
    return Errors.insufficientCredits({ balance_usd: formatUsd(spend.balanceNano), estimated_cost_usd: formatUsd(estimate, { precise: true }) });
  }
  return null;
}

export interface PreflightResult {
  ranked: RouteCandidate[];
  spend: SpendState | null;
  estimateNano: bigint;
}

/**
 * Server-side credit and budget checks before any provider is called. Platform-funded
 * candidates require a positive balance covering the estimated maximum charge and must fit
 * every configured budget; if they don't, BYOK candidates (if any) can still serve.
 * Free (zero-priced) routes cost nothing, so they never need a balance; the daily free-tier
 * quota limits them instead.
 */
export async function preflight(
  auth: GatewayAuth,
  ranked: RouteCandidate[],
  meta: Map<string, CandidateMeta>,
  estimatedInputTokens: number,
  maxOutputTokens: number | null,
  deps: Pick<GatewayDeps, "env">,
): Promise<PreflightResult> {
  const byokFee = deps.env.BYOK_FEE_PCT !== "0" && deps.env.BYOK_FEE_PCT !== "0.0";
  const platform = ranked.filter((c) => c.billingMode === "PLATFORM");
  if (!platform.length && !byokFee) return { ranked, spend: null, estimateNano: 0n };

  const spend = await getSpendState(auth.organizationId, auth.projectId, auth.keyId);
  const paid = platform.filter((c) => !isFreeCandidate(c));
  let estimate = 0n;
  for (const c of paid.slice(0, 3)) {
    const price = meta.get(c.endpointId)?.price;
    if (!price) continue;
    const e = estimateMaxCharge(price, estimatedInputTokens, maxOutputTokens);
    if (e > estimate) estimate = e;
  }
  const violation = paid.length ? budgetViolation(auth, spend, estimate) : null;
  if (!violation) {
    if (byokFee && spend.balanceNano <= 0n) {
      const platformOnly = ranked.filter((c) => c.billingMode === "PLATFORM");
      if (!platformOnly.length) throw Errors.insufficientCredits({ balance_usd: formatUsd(spend.balanceNano) });
      return { ranked: platformOnly, spend, estimateNano: estimate };
    }
    return { ranked, spend, estimateNano: estimate };
  }
  const allowByok = !(byokFee && spend.balanceNano <= 0n);
  const fallback = ranked.filter((c) => isFreeCandidate(c) || (allowByok && c.billingMode === "BYOK"));
  if (fallback.length) return { ranked: fallback, spend, estimateNano: 0n };
  throw violation;
}
