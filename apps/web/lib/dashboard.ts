import "server-only";
import { nanoToUsdString } from "@inrent/core";
import type { UsageOverview } from "@inrent/services";
import type { ChartPoint } from "@/components/dashboard/charts";

export const usd = (nano: bigint | null | undefined, digits = 2) => nanoToUsdString(nano ?? 0n, digits);

export function toChartPoints(overview: UsageOverview): ChartPoint[] {
  return overview.series.map((p) => ({
    date: p.date,
    requests: p.requests,
    errors: p.errors,
    tokens: p.inputTokens + p.outputTokens,
    spendUsd: Number(nanoToUsdString(p.spendNano, 6)),
    latencyMs: p.avgLatencyMs,
  }));
}

export function pct(n: number, digits = 1) {
  return `${(n * 100).toFixed(digits)}%`;
}

/** Reads a `days` search param, clamped to the supported windows. */
export function parseDays(v: string | undefined, fallback = 30) {
  const n = Number(v);
  return [7, 14, 30, 90].includes(n) ? n : fallback;
}
