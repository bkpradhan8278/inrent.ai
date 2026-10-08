import { Errors, type RouteCandidate } from "@inrent/core";
import type { GatewayAuth, GatewayDeps } from "../types";

const DAY = 86_400_000;

/** Requests per organization per UTC day on free (zero-priced) models. 0 turns the quota off. */
export function freeTierDailyLimit(raw = process.env.FREE_TIER_DAILY_REQUESTS): number {
  const n = Number(raw ?? 10);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 10;
}

export function isFreeCandidate(c: Pick<RouteCandidate, "billingMode" | "inputPicoPerToken" | "outputPicoPerToken">): boolean {
  return c.billingMode === "PLATFORM" && c.inputPicoPerToken === 0n && c.outputPicoPerToken === 0n;
}

/**
 * Free models are a marketing allowance, not unlimited compute: the request counts against the
 * daily quota when the route we will try first is free. Paid fallbacks behind it are unaffected.
 */
export async function enforceFreeTierQuota(auth: GatewayAuth, first: RouteCandidate | undefined, deps: Pick<GatewayDeps, "rateLimitStore" | "metrics" | "now">, limit = freeTierDailyLimit()) {
  if (limit === 0 || !first || !isFreeCandidate(first)) return;
  const now = deps.now();
  const day = new Date(now).toISOString().slice(0, 10);
  // Day-aligned window plus the date in the key: a fixed UTC-day counter, not a sliding one.
  const result = await deps.rateLimitStore.hit(`freeq:org:${auth.organizationId}:${day}`, limit, DAY, 1, now);
  if (result.allowed) return;
  deps.metrics.rateLimited.inc({ scope: "free_tier:daily" });
  throw Errors.rateLimited(
    `Free tier limit reached: ${limit} requests per day on free models. It resets at 00:00 UTC. Add credits to keep going with paid models.`,
    { "retry-after": String(Math.ceil(result.resetMs / 1000)), "x-inrent-free-daily-limit": String(limit), "x-inrent-free-daily-remaining": "0" },
    "free_tier_limit_exceeded",
  );
}
