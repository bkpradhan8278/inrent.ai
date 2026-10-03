import { Errors, estimateMaxCharge, formatUsd, type InrentError, type RouteCandidate } from "@inrent/core";
import { getSpendState, type SpendState } from "@inrent/services";
import type { GatewayAuth, GatewayDeps } from "../types";
import type { CandidateMeta } from "./candidates";

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
  let estimate = 0n;
  for (const c of platform.slice(0, 3)) {
    const price = meta.get(c.endpointId)?.price;
    if (!price) continue;
    const e = estimateMaxCharge(price, estimatedInputTokens, maxOutputTokens);
    if (e > estimate) estimate = e;
  }
  const violation = platform.length ? budgetViolation(auth, spend, estimate) : null;
  if (!violation) {
    if (byokFee && spend.balanceNano <= 0n) {
      const platformOnly = ranked.filter((c) => c.billingMode === "PLATFORM");
      if (!platformOnly.length) throw Errors.insufficientCredits({ balance_usd: formatUsd(spend.balanceNano) });
      return { ranked: platformOnly, spend, estimateNano: estimate };
    }
    return { ranked, spend, estimateNano: estimate };
  }
  const byok = byokFee && spend.balanceNano <= 0n ? [] : ranked.filter((c) => c.billingMode === "BYOK");
  if (byok.length) return { ranked: byok, spend, estimateNano: 0n };
  throw violation;
}
