import { AlertTriangle, Building2, Coins, KeyRound, LifeBuoy, Percent, Server, TrendingUp, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { nanoToUsdString } from "@inrent/core";
import { prisma } from "@inrent/db";
import { computeFinOpsAlerts, getRevenueAnalytics } from "@inrent/services";
import { MetricAreaChart, type ChartPoint } from "@/components/dashboard/charts";
import { PageHeader, Section, StatCard, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { usd } from "@/lib/dashboard";
import { formatCompact, formatNumber, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Overview" };

export default async function AdminOverview() {
  const admin = await requireAdmin();
  const canRevenue = admin.can("revenue:read");
  const [revenue, alerts, counts, providers, signups] = await Promise.all([
    canRevenue ? getRevenueAnalytics(30) : null,
    canRevenue ? computeFinOpsAlerts() : [],
    Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.organization.count({ where: { deletedAt: null, isDemo: false } }),
      prisma.apiKey.count({ where: { revokedAt: null } }),
      prisma.supportTicket.count({ where: { status: { in: ["OPEN", "PENDING"] } } }),
      prisma.waitlistEntry.count(),
      prisma.organization.count({ where: { suspendedAt: { not: null } } }),
    ]),
    prisma.provider.findMany({ where: { enabled: true }, select: { slug: true, name: true, healthStatus: true, integrationMode: true, resaleVerified: true }, orderBy: { priority: "asc" } }),
    admin.can("users:read") ? prisma.user.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 6, select: { id: true, name: true, email: true, createdAt: true } }) : [],
  ]);
  const [users, orgs, keys, tickets, waitlist, suspended] = counts;
  const points: ChartPoint[] = (revenue?.daily ?? []).map((d) => ({ date: d.date, requests: d.requests, errors: 0, tokens: 0, spendUsd: Number(nanoToUsdString(d.revenueNano, 6)), latencyMs: null }));

  return (
    <>
      <PageHeader title="Platform overview" description="Live figures from production data. Demo-workspace traffic is excluded from revenue." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Users" value={formatNumber(users)} icon={Users} hint={revenue ? `+${revenue.newUsers} in 30d` : undefined} />
        <StatCard label="Organizations" value={formatNumber(orgs)} icon={Building2} hint={suspended ? `${suspended} suspended` : "none suspended"} />
        <StatCard label="Active API keys" value={formatNumber(keys)} icon={KeyRound} />
        <StatCard label="Open tickets" value={formatNumber(tickets)} icon={LifeBuoy} tone={tickets ? "amber" : "default"} hint={`${formatNumber(waitlist)} on GPU/preview waitlists`} />
      </div>

      {revenue ? (
        <>
          <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Usage revenue · 30d" value={`$${usd(revenue.revenueNano)}`} icon={Coins} tone="accent" hint={`${formatCompact(revenue.requests)} requests`} />
            <StatCard label="Provider cost · 30d" value={`$${usd(revenue.providerCostNano)}`} icon={Server} />
            <StatCard label="Gross margin" value={revenue.marginPct === null ? "—" : `${revenue.marginPct.toFixed(1)}%`} icon={Percent} hint={`$${usd(revenue.grossProfitNano)} gross profit`} />
            <StatCard label="Credit purchases · 30d" value={`$${usd(revenue.gmvNano)}`} icon={TrendingUp} hint={`ARPU $${usd(revenue.arpuNano)}`} />
          </div>
          <div className="mt-6 grid gap-6 xl:grid-cols-3">
            <Section title="Usage revenue" description="Charged to customers per day (excludes demo data)" className="xl:col-span-2">
              <MetricAreaChart data={points} metric="spendUsd" />
            </Section>
            <Section title="FinOps alerts" contentClassName={alerts.length ? "p-0" : undefined} actions={<Link href="/admin/revenue" className="text-[13px] text-accent hover:underline">Revenue →</Link>}>
              {alerts.length ? (
                <ul className="divide-y divide-border">
                  {alerts.map((a, i) => (
                    <li key={i} className="flex items-start gap-3 px-5 py-3">
                      <AlertTriangle className={a.severity === "critical" ? "mt-0.5 size-4 shrink-0 text-danger" : a.severity === "warning" ? "mt-0.5 size-4 shrink-0 text-amber" : "mt-0.5 size-4 shrink-0 text-fg-subtle"} />
                      <div className="min-w-0">
                        <div className="truncate font-mono text-[12.5px] text-fg">{a.subject}</div>
                        <p className="text-[12.5px] text-fg-muted">{a.message}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fg-subtle">No alerts. Thresholds: FINOPS_PROVIDER_DAILY_SPEND_ALERT_USD, FINOPS_MIN_MARGIN_PCT.</p>
              )}
            </Section>
          </div>
        </>
      ) : null}

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Enabled providers" contentClassName={providers.length ? "p-0" : undefined} actions={<Link href="/admin/providers" className="text-[13px] text-accent hover:underline">Manage →</Link>}>
          {providers.length ? (
            <ul className="divide-y divide-border">
              {providers.map((p) => (
                <li key={p.slug} className="flex flex-wrap items-center gap-2 px-5 py-2.5 text-[13px]">
                  <span className="text-fg">{p.name}</span>
                  <Badge variant="outline">{p.integrationMode.toLowerCase().replace(/_/g, " ")}</Badge>
                  {p.resaleVerified ? <Badge variant="success">resale verified</Badge> : null}
                  <span className="ml-auto">
                    <StatusPill status={p.healthStatus} />
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">No providers are enabled. Enable one under Providers after verifying its terms.</p>
          )}
        </Section>
        {signups.length ? (
          <Section title="Recent sign-ups" contentClassName="p-0" actions={<Link href="/admin/users" className="text-[13px] text-accent hover:underline">All users →</Link>}>
            <ul className="divide-y divide-border">
              {signups.map((u) => (
                <li key={u.id} className="flex items-center gap-3 px-5 py-2.5 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-fg">{u.name}</span>
                  <span className="hidden truncate text-fg-subtle sm:block">{u.email}</span>
                  <span className="shrink-0 text-[12px] text-fg-subtle">{formatRelative(u.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Section>
        ) : null}
      </div>
    </>
  );
}
