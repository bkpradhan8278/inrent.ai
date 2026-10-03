import type { Metadata } from "next";
import { nanoToUsdString } from "@inrent/core";
import { getRevenueAnalytics } from "@inrent/services";
import { MetricAreaChart, type ChartPoint } from "@/components/dashboard/charts";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { PageHeader, Section, StatCard } from "@/components/dashboard/ui";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { parseDays, usd } from "@/lib/dashboard";
import { formatCompact, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Revenue" };

function Breakdown({ title, rows }: { title: string; rows: Array<{ key: string; requests: number; revenueNano: bigint; costNano: bigint; marginNano: bigint; marginPct: number | null }> }) {
  return (
    <Section title={title} contentClassName="p-0">
      {rows.length ? (
        <Table>
          <THead>
            <TR>
              <TH>{title.replace("By ", "")}</TH>
              <TH className="text-right">Requests</TH>
              <TH className="text-right">Revenue</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">Margin</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.key}>
                <TD className="max-w-48 truncate font-mono text-[12.5px] text-fg">{r.key}</TD>
                <TD className="text-right tabular-nums">{formatNumber(r.requests)}</TD>
                <TD className="text-right font-mono tabular-nums text-fg">${usd(r.revenueNano, 4)}</TD>
                <TD className="text-right font-mono tabular-nums">${usd(r.costNano, 4)}</TD>
                <TD className={cn("text-right tabular-nums", r.marginPct !== null && r.marginPct < 0 ? "text-danger" : "text-fg")}>{r.marginPct === null ? "—" : `${r.marginPct.toFixed(1)}%`}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      ) : (
        <p className="px-5 py-6 text-sm text-fg-subtle">No paid traffic in this period.</p>
      )}
    </Section>
  );
}

export default async function AdminRevenue({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("revenue:read");
  const days = parseDays(sp.days);
  const r = await getRevenueAnalytics(days);
  const toPoints = (key: "revenueNano" | "costNano"): ChartPoint[] => r.daily.map((d) => ({ date: d.date, requests: d.requests, errors: 0, tokens: 0, spendUsd: Number(nanoToUsdString(d[key], 6)), latencyMs: null }));
  return (
    <>
      <PageHeader title="Revenue & margin" description="Usage revenue is what customers were charged per request; provider cost is the upstream list cost; BYOK traffic carries only the BYOK fee. Demo data is excluded." actions={<RangeTabs days={days} basePath="/admin/revenue" />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Usage revenue" value={`$${usd(r.revenueNano)}`} tone="accent" hint={`${formatCompact(r.requests)} requests · ${formatCompact(r.tokens)} tokens`} />
        <StatCard label="Provider cost" value={`$${usd(r.providerCostNano)}`} />
        <StatCard label="Gross profit" value={`$${usd(r.grossProfitNano)}`} hint={r.marginPct === null ? "—" : `${r.marginPct.toFixed(2)}% margin`} />
        <StatCard label="Credits purchased" value={`$${usd(r.gmvNano)}`} hint={`${r.activeOrganizations} paying orgs · ARPU $${usd(r.arpuNano)}`} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Revenue per day">
          <MetricAreaChart data={toPoints("revenueNano")} metric="spendUsd" />
        </Section>
        <Section title="Provider cost per day">
          <MetricAreaChart data={toPoints("costNano")} metric="spendUsd" />
        </Section>
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Breakdown title="By model" rows={r.byModel} />
        <Breakdown title="By provider" rows={r.byProvider} />
      </div>
    </>
  );
}
