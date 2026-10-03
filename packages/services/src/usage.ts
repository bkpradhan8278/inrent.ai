import { Prisma, prisma } from "@inrent/db";

/**
 * Analytics queries for the dashboard. Reads the Request table for recent windows (≤ 90 days)
 * with the (organizationId, createdAt) index; long ranges should read UsageDaily rollups.
 */

export interface DailyPoint {
  date: string;
  requests: number;
  errors: number;
  inputTokens: number;
  outputTokens: number;
  spendNano: bigint;
  avgLatencyMs: number | null;
}

export interface UsageOverview {
  days: number;
  totals: {
    requests: number;
    errors: number;
    inputTokens: number;
    outputTokens: number;
    spendNano: bigint;
    avgLatencyMs: number | null;
    p95LatencyMs: number | null;
    avgTtftMs: number | null;
    errorRate: number;
    fallbackRate: number;
  };
  series: DailyPoint[];
  byModel: Array<{ model: string; requests: number; tokens: number; spendNano: bigint }>;
  byProvider: Array<{ provider: string; requests: number; errors: number; avgLatencyMs: number | null; spendNano: bigint }>;
  hasDemoData: boolean;
}

function since(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

export async function getUsageOverview(organizationId: string, opts: { days?: number; projectId?: string | null } = {}): Promise<UsageOverview> {
  const days = Math.min(Math.max(opts.days ?? 30, 1), 90);
  const from = since(days);
  const projectFilter = opts.projectId ? Prisma.sql`AND "projectId" = ${opts.projectId}::uuid` : Prisma.empty;

  const [totals] = await prisma.$queryRaw<
    Array<{ requests: bigint; errors: bigint; input: bigint | null; output: bigint | null; spend: bigint | null; avg_latency: number | null; p95: number | null; avg_ttft: number | null; fallbacks: bigint; demo: bigint }>
  >`
    SELECT count(*) AS requests,
           count(*) FILTER (WHERE status = 'ERROR') AS errors,
           sum("inputTokens")::bigint AS input,
           sum("outputTokens")::bigint AS output,
           sum("userChargeNano")::bigint AS spend,
           avg("latencyMs")::float AS avg_latency,
           percentile_cont(0.95) WITHIN GROUP (ORDER BY "latencyMs")::float AS p95,
           avg("ttftMs")::float AS avg_ttft,
           count(*) FILTER (WHERE "fallbackCount" > 0) AS fallbacks,
           count(*) FILTER (WHERE "isDemo") AS demo
    FROM "Request"
    WHERE "organizationId" = ${organizationId}::uuid AND "createdAt" >= ${from} ${projectFilter}`;

  const seriesRows = await prisma.$queryRaw<
    Array<{ day: Date; requests: bigint; errors: bigint; input: bigint | null; output: bigint | null; spend: bigint | null; avg_latency: number | null }>
  >`
    SELECT date_trunc('day', "createdAt") AS day,
           count(*) AS requests,
           count(*) FILTER (WHERE status = 'ERROR') AS errors,
           sum("inputTokens")::bigint AS input,
           sum("outputTokens")::bigint AS output,
           sum("userChargeNano")::bigint AS spend,
           avg("latencyMs")::float AS avg_latency
    FROM "Request"
    WHERE "organizationId" = ${organizationId}::uuid AND "createdAt" >= ${from} ${projectFilter}
    GROUP BY 1 ORDER BY 1`;

  const byModel = await prisma.$queryRaw<Array<{ model: string | null; requests: bigint; tokens: bigint | null; spend: bigint | null }>>`
    SELECT coalesce("modelSlug", "modelRequested") AS model, count(*) AS requests,
           sum("totalTokens")::bigint AS tokens, sum("userChargeNano")::bigint AS spend
    FROM "Request"
    WHERE "organizationId" = ${organizationId}::uuid AND "createdAt" >= ${from} ${projectFilter}
    GROUP BY 1 ORDER BY requests DESC LIMIT 12`;

  const byProvider = await prisma.$queryRaw<Array<{ provider: string | null; requests: bigint; errors: bigint; avg_latency: number | null; spend: bigint | null }>>`
    SELECT coalesce("providerSlug", 'unrouted') AS provider, count(*) AS requests,
           count(*) FILTER (WHERE status = 'ERROR') AS errors,
           avg("latencyMs")::float AS avg_latency, sum("userChargeNano")::bigint AS spend
    FROM "Request"
    WHERE "organizationId" = ${organizationId}::uuid AND "createdAt" >= ${from} ${projectFilter}
    GROUP BY 1 ORDER BY requests DESC LIMIT 12`;

  // Fill missing days with zeros so charts have a continuous axis.
  const byDay = new Map(seriesRows.map((r) => [r.day.toISOString().slice(0, 10), r]));
  const series: DailyPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    const r = byDay.get(d);
    series.push({
      date: d,
      requests: Number(r?.requests ?? 0),
      errors: Number(r?.errors ?? 0),
      inputTokens: Number(r?.input ?? 0),
      outputTokens: Number(r?.output ?? 0),
      spendNano: r?.spend ?? 0n,
      avgLatencyMs: r?.avg_latency ? Math.round(r.avg_latency) : null,
    });
  }

  const requests = Number(totals?.requests ?? 0);
  const errors = Number(totals?.errors ?? 0);
  return {
    days,
    totals: {
      requests,
      errors,
      inputTokens: Number(totals?.input ?? 0),
      outputTokens: Number(totals?.output ?? 0),
      spendNano: totals?.spend ?? 0n,
      avgLatencyMs: totals?.avg_latency ? Math.round(totals.avg_latency) : null,
      p95LatencyMs: totals?.p95 ? Math.round(totals.p95) : null,
      avgTtftMs: totals?.avg_ttft ? Math.round(totals.avg_ttft) : null,
      errorRate: requests ? errors / requests : 0,
      fallbackRate: requests ? Number(totals?.fallbacks ?? 0) / requests : 0,
    },
    series,
    byModel: byModel.map((r) => ({ model: r.model ?? "unknown", requests: Number(r.requests), tokens: Number(r.tokens ?? 0), spendNano: r.spend ?? 0n })),
    byProvider: byProvider.map((r) => ({ provider: r.provider ?? "unrouted", requests: Number(r.requests), errors: Number(r.errors), avgLatencyMs: r.avg_latency ? Math.round(r.avg_latency) : null, spendNano: r.spend ?? 0n })),
    hasDemoData: Number(totals?.demo ?? 0) > 0,
  };
}

/** Rolls up one UTC day of Request rows into UsageDaily (idempotent upsert). Used by the worker. */
export async function rollupUsageDay(day: Date): Promise<number> {
  const start = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const end = new Date(start.getTime() + 86_400_000);
  return prisma.$executeRaw`
    INSERT INTO "UsageDaily" ("id", "date", "organizationId", "projectId", "apiKeyId", "modelSlug", "providerSlug", "billingMode",
      "requests", "errors", "inputTokens", "outputTokens", "cachedTokens", "providerCostNano", "userChargeNano", "latencyMsSum", "isDemo", "updatedAt")
    SELECT gen_random_uuid(), ${start}::date, "organizationId", "projectId", coalesce("apiKeyId"::text, ''),
           coalesce("modelSlug", "modelRequested"), coalesce("providerSlug", 'unrouted'), "billingMode",
           count(*), count(*) FILTER (WHERE status = 'ERROR'), sum("inputTokens"), sum("outputTokens"), sum("cachedTokens"),
           sum("providerCostNano"), sum("userChargeNano"), coalesce(sum("latencyMs"), 0), bool_or("isDemo"), now()
    FROM "Request"
    WHERE "createdAt" >= ${start} AND "createdAt" < ${end}
    GROUP BY "organizationId", "projectId", coalesce("apiKeyId"::text, ''), coalesce("modelSlug", "modelRequested"), coalesce("providerSlug", 'unrouted'), "billingMode"
    ON CONFLICT ("date", "organizationId", "projectId", "apiKeyId", "modelSlug", "providerSlug", "billingMode")
    DO UPDATE SET "requests" = EXCLUDED."requests", "errors" = EXCLUDED."errors", "inputTokens" = EXCLUDED."inputTokens",
      "outputTokens" = EXCLUDED."outputTokens", "cachedTokens" = EXCLUDED."cachedTokens", "providerCostNano" = EXCLUDED."providerCostNano",
      "userChargeNano" = EXCLUDED."userChargeNano", "latencyMsSum" = EXCLUDED."latencyMsSum", "updatedAt" = now()`;
}

/** Platform-wide revenue and margin analytics for the admin console. */
export async function getRevenueAnalytics(days = 30) {
  const from = since(days);
  const [totals] = await prisma.$queryRaw<
    Array<{ requests: bigint; tokens: bigint | null; revenue: bigint | null; cost: bigint | null; orgs: bigint }>
  >`SELECT count(*) AS requests, sum("totalTokens")::bigint AS tokens, sum("userChargeNano")::bigint AS revenue,
           sum("providerCostNano")::bigint AS cost, count(DISTINCT "organizationId") AS orgs
    FROM "Request" WHERE "createdAt" >= ${from} AND NOT "isDemo"`;
  const byModel = await prisma.$queryRaw<Array<{ key: string | null; requests: bigint; revenue: bigint | null; cost: bigint | null }>>`
    SELECT "modelSlug" AS key, count(*) AS requests, sum("userChargeNano")::bigint AS revenue, sum("providerCostNano")::bigint AS cost
    FROM "Request" WHERE "createdAt" >= ${from} AND NOT "isDemo" AND status = 'SUCCESS'
    GROUP BY 1 ORDER BY revenue DESC NULLS LAST LIMIT 20`;
  const byProvider = await prisma.$queryRaw<Array<{ key: string | null; requests: bigint; revenue: bigint | null; cost: bigint | null }>>`
    SELECT "providerSlug" AS key, count(*) AS requests, sum("userChargeNano")::bigint AS revenue, sum("providerCostNano")::bigint AS cost
    FROM "Request" WHERE "createdAt" >= ${from} AND NOT "isDemo" AND status = 'SUCCESS'
    GROUP BY 1 ORDER BY revenue DESC NULLS LAST LIMIT 20`;
  const daily = await prisma.$queryRaw<Array<{ day: Date; revenue: bigint | null; cost: bigint | null; requests: bigint }>>`
    SELECT date_trunc('day', "createdAt") AS day, sum("userChargeNano")::bigint AS revenue, sum("providerCostNano")::bigint AS cost, count(*) AS requests
    FROM "Request" WHERE "createdAt" >= ${from} AND NOT "isDemo" GROUP BY 1 ORDER BY 1`;
  const [users] = await prisma.$queryRaw<Array<{ total: bigint; new_users: bigint }>>`
    SELECT count(*) AS total, count(*) FILTER (WHERE "createdAt" >= ${from}) AS new_users FROM "user" WHERE "deletedAt" IS NULL`;
  const [purchases] = await prisma.$queryRaw<Array<{ gmv: bigint | null }>>`
    SELECT sum("creditsNano")::bigint AS gmv FROM "Payment" WHERE status = 'SUCCEEDED' AND "createdAt" >= ${from}`;

  const revenue = totals?.revenue ?? 0n;
  const cost = totals?.cost ?? 0n;
  const activeOrgs = Number(totals?.orgs ?? 0);
  const row = (r: { key: string | null; requests: bigint; revenue: bigint | null; cost: bigint | null }) => {
    const rev = r.revenue ?? 0n;
    const c = r.cost ?? 0n;
    return { key: r.key ?? "unknown", requests: Number(r.requests), revenueNano: rev, costNano: c, marginNano: rev - c, marginPct: rev > 0n ? Number(((rev - c) * 10000n) / rev) / 100 : null };
  };
  return {
    days,
    gmvNano: purchases?.gmv ?? 0n,
    revenueNano: revenue,
    providerCostNano: cost,
    grossProfitNano: revenue - cost,
    marginPct: revenue > 0n ? Number(((revenue - cost) * 10000n) / revenue) / 100 : null,
    requests: Number(totals?.requests ?? 0),
    tokens: Number(totals?.tokens ?? 0),
    activeOrganizations: activeOrgs,
    arpuNano: activeOrgs ? revenue / BigInt(activeOrgs) : 0n,
    totalUsers: Number(users?.total ?? 0),
    newUsers: Number(users?.new_users ?? 0),
    byModel: byModel.map(row),
    byProvider: byProvider.map(row),
    daily: daily.map((d) => ({ date: d.day.toISOString().slice(0, 10), revenueNano: d.revenue ?? 0n, costNano: d.cost ?? 0n, requests: Number(d.requests) })),
  };
}
