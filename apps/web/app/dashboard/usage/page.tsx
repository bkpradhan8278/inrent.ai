import { Activity, AlertTriangle, Coins, Gauge, Hash, Timer } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { getUsageOverview } from "@inrent/services";
import { MetricAreaChart, StackedErrorsChart } from "@/components/dashboard/charts";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { DemoDataBadge, EmptyState, PageHeader, Section, StatCard } from "@/components/dashboard/ui";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { parseDays, pct, toChartPoints, usd } from "@/lib/dashboard";
import { formatCompact, formatMs, formatNumber } from "@/lib/format";
import { requireOrgPermission } from "@/lib/session";
import { cn } from "@/lib/utils";
import { vendorName } from "@/lib/vendors";

export const metadata: Metadata = { title: "Usage" };

export default async function UsagePage({ searchParams }: { searchParams: Promise<{ days?: string; scope?: string }> }) {
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const ws = await requireOrgPermission("usage:read");
  const projectOnly = sp.scope === "project";
  const overview = await getUsageOverview(ws.org.id, { days, projectId: projectOnly ? ws.project.id : null });
  const t = overview.totals;
  const points = toChartPoints(overview);
  const scopeHref = (s: string) => `/dashboard/usage?days=${days}${s === "project" ? "&scope=project" : ""}`;

  return (
    <>
      <PageHeader
        title="Usage"
        description="Requests, tokens, spend and latency across your organization. Updated in real time."
        badge={<DemoDataBadge show={overview.hasDemoData} />}
        actions={
          <>
            <div className="inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5 text-[12px]">
              <Link href={scopeHref("org")} className={cn("rounded px-2.5 py-1", !projectOnly ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}>
                Organization
              </Link>
              <Link href={scopeHref("project")} className={cn("max-w-36 truncate rounded px-2.5 py-1", projectOnly ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}>
                {ws.project.name}
              </Link>
            </div>
            <RangeTabs days={days} basePath="/dashboard/usage" params={{ scope: projectOnly ? "project" : undefined }} />
            <ExportMenu kinds={[{ kind: "usage", label: "Daily usage" }, { kind: "requests", label: "Request log" }]} />
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Spend" value={`$${usd(t.spendNano)}`} icon={Coins} tone="accent" hint={`last ${days} days`} />
        <StatCard label="Requests" value={formatNumber(t.requests)} icon={Activity} />
        <StatCard label="Input tokens" value={formatCompact(t.inputTokens)} icon={Hash} />
        <StatCard label="Output tokens" value={formatCompact(t.outputTokens)} icon={Hash} />
        <StatCard label="p95 latency" value={formatMs(t.p95LatencyMs)} icon={Timer} hint={`avg ${formatMs(t.avgLatencyMs)} · TTFT ${formatMs(t.avgTtftMs)}`} />
        <StatCard label="Errors" value={pct(t.errorRate)} icon={AlertTriangle} tone={t.errorRate > 0.05 ? "danger" : "default"} hint={`fallbacks ${pct(t.fallbackRate)}`} />
      </div>

      {t.requests === 0 ? (
        <EmptyState icon={Gauge} title="No usage in this period" description="Send a request with an API key or from the playground — it will show up here immediately." className="mt-6" />
      ) : (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Section title="Spend" description="USD per day">
              <MetricAreaChart data={points} metric="spendUsd" />
            </Section>
            <Section title="Tokens" description="Input + output per day">
              <MetricAreaChart data={points} metric="tokens" />
            </Section>
            <Section title="Requests & errors" description="Successful vs failed per day">
              <StackedErrorsChart data={points} />
            </Section>
            <Section title="Latency" description="Average end-to-end latency per day">
              <MetricAreaChart data={points} metric="latencyMs" height={200} />
            </Section>
          </div>

          <div className="mt-6 grid gap-6 xl:grid-cols-2">
            <Section title="By model" contentClassName="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Model</TH>
                    <TH className="text-right">Requests</TH>
                    <TH className="text-right">Tokens</TH>
                    <TH className="text-right">Spend</TH>
                  </TR>
                </THead>
                <TBody>
                  {overview.byModel.map((m) => (
                    <TR key={m.model}>
                      <TD className="max-w-56 truncate font-mono text-[12.5px] text-fg">{m.model}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(m.requests)}</TD>
                      <TD className="text-right tabular-nums">{formatCompact(m.tokens)}</TD>
                      <TD className="text-right font-mono tabular-nums text-fg">${usd(m.spendNano, 4)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
            <Section title="By provider" contentClassName="p-0">
              <Table>
                <THead>
                  <TR>
                    <TH>Provider</TH>
                    <TH className="text-right">Requests</TH>
                    <TH className="text-right">Error rate</TH>
                    <TH className="text-right">Avg latency</TH>
                    <TH className="text-right">Spend</TH>
                  </TR>
                </THead>
                <TBody>
                  {overview.byProvider.map((p) => (
                    <TR key={p.provider}>
                      <TD className="text-fg">{vendorName(p.provider)}</TD>
                      <TD className="text-right tabular-nums">{formatNumber(p.requests)}</TD>
                      <TD className={cn("text-right tabular-nums", p.requests && p.errors / p.requests > 0.05 ? "text-danger" : undefined)}>{pct(p.requests ? p.errors / p.requests : 0)}</TD>
                      <TD className="text-right tabular-nums">{formatMs(p.avgLatencyMs)}</TD>
                      <TD className="text-right font-mono tabular-nums text-fg">${usd(p.spendNano, 4)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            </Section>
          </div>
        </>
      )}
    </>
  );
}
