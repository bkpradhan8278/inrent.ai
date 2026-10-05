import { Activity, AlertTriangle, ArrowRight, CheckCircle2, Circle, Coins, Gauge, KeyRound, Timer, Wallet, Zap } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { prisma } from "@inrent/db";
import { getUsageOverview } from "@inrent/services";
import { MetricAreaChart } from "@/components/dashboard/charts";
import { RangeTabs } from "@/components/dashboard/range-tabs";
import { DemoDataBadge, DenyNotice, EmptyState, PageHeader, Section, StatCard, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { parseDays, pct, toChartPoints, usd } from "@/lib/dashboard";
import { formatCompact, formatMs, formatNumber, formatRelative } from "@/lib/format";
import { getWorkspace } from "@/lib/session";
import { site } from "@/lib/site";
import { vendorName } from "@/lib/vendors";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<{ days?: string; denied?: string }> }) {
  const sp = await searchParams;
  const days = parseDays(sp.days);
  const ws = await getWorkspace();
  const [overview, keyCount, firstRequest, byokCount, memberCount, recent] = await Promise.all([
    getUsageOverview(ws.org.id, { days }),
    prisma.apiKey.count({ where: { organizationId: ws.org.id, revokedAt: null } }),
    prisma.request.findFirst({ where: { organizationId: ws.org.id, isDemo: false }, select: { id: true } }),
    prisma.byokCredential.count({ where: { organizationId: ws.org.id, deletedAt: null } }),
    prisma.membership.count({ where: { organizationId: ws.org.id } }),
    prisma.request.findMany({
      where: { organizationId: ws.org.id },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { requestId: true, createdAt: true, modelSlug: true, modelRequested: true, providerSlug: true, status: true, totalTokens: true, userChargeNano: true, latencyMs: true },
    }),
  ]);
  const balance = ws.org.creditBalance?.balanceNano ?? 0n;
  const t = overview.totals;
  const points = toChartPoints(overview);

  const steps = [
    { done: keyCount > 0, title: "Create an API key", body: "Keys are scoped to a project and environment.", href: "/dashboard/keys?create=1", cta: "Create key" },
    { done: balance > 0n || byokCount > 0, title: "Add credits or bring your own key", body: "Prepaid credits for platform models, or BYOK with your provider account.", href: balance > 0n ? "/dashboard/byok" : "/dashboard/billing", cta: balance > 0n ? "Add BYOK" : "Add credits" },
    { done: Boolean(firstRequest), title: "Send your first request", body: "Any OpenAI SDK works — change the base URL.", href: "/dashboard/playground", cta: "Open playground" },
    { done: memberCount > 1 || ws.org.type === "PERSONAL", title: ws.org.type === "PERSONAL" ? "Invite your team (optional)" : "Invite your team", body: "Roles, shared billing and per-member budgets.", href: "/dashboard/team", cta: "Invite" },
  ];
  const remaining = steps.filter((s) => !s.done).length;

  return (
    <>
      <DenyNotice permission={sp.denied} />
      <PageHeader
        title={`Welcome back, ${ws.user.name.split(" ")[0]}`}
        description={`${ws.org.name} · ${ws.project.name}`}
        badge={<DemoDataBadge show={overview.hasDemoData} />}
        actions={
          <>
            <RangeTabs days={days} basePath="/dashboard" />
            <Button asChild size="sm">
              <Link href="/dashboard/playground">
                <Zap /> Playground
              </Link>
            </Button>
          </>
        }
      />

      {remaining > 0 ? (
        <section className="panel hairline-top mb-6 overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
            <div>
              <h2 className="text-[15px] font-semibold text-fg">Get started</h2>
              <p className="text-[13px] text-fg-muted">
                {steps.length - remaining} of {steps.length} complete
              </p>
            </div>
            <div className="h-1.5 w-40 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <div className="h-full rounded-full bg-gradient-to-r from-accent to-iris" style={{ width: `${((steps.length - remaining) / steps.length) * 100}%` }} />
            </div>
          </div>
          <ol className="grid divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
            {steps.map((s) => (
              <li key={s.title} className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-2 text-sm font-medium text-fg">
                  {s.done ? <CheckCircle2 className="size-4 text-accent" aria-label="Done" /> : <Circle className="size-4 text-fg-subtle" aria-label="Not done" />}
                  {s.title}
                </div>
                <p className="text-[13px] text-fg-muted">{s.body}</p>
                {!s.done ? (
                  <Link href={s.href} className="mt-auto inline-flex items-center gap-1 text-[13px] font-medium text-accent hover:underline">
                    {s.cta} <ArrowRight className="size-3.5" />
                  </Link>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Credit balance" value={`$${usd(balance)}`} icon={Wallet} tone={balance <= 0n ? "danger" : "accent"} hint={<Link href="/dashboard/billing" className="hover:text-fg-muted">Manage billing →</Link>} />
        <StatCard label={`Spend · ${days}d`} value={`$${usd(t.spendNano)}`} icon={Coins} hint={`${formatNumber(t.requests)} requests`} />
        <StatCard label="Requests" value={formatCompact(t.requests)} icon={Activity} hint={`${formatCompact(t.inputTokens + t.outputTokens)} tokens`} />
        <StatCard label="Avg latency" value={formatMs(t.avgLatencyMs)} icon={Timer} hint={`p95 ${formatMs(t.p95LatencyMs)}`} />
        <StatCard label="Error rate" value={pct(t.errorRate)} icon={AlertTriangle} tone={t.errorRate > 0.05 ? "danger" : "default"} hint={`${formatNumber(t.errors)} errors`} />
        <StatCard label="Fallback rate" value={pct(t.fallbackRate)} icon={Gauge} hint={`TTFT ${formatMs(t.avgTtftMs)}`} />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section title="Requests" description={`Daily volume, last ${days} days`} className="xl:col-span-2">
          {t.requests ? <MetricAreaChart data={points} metric="requests" /> : <EmptyState icon={Activity} title="No requests yet" description="Traffic will appear here within seconds of your first call." className="py-10" />}
        </Section>
        <Section title="Spend" description="Credits consumed per day">
          {t.requests ? <MetricAreaChart data={points} metric="spendUsd" /> : <EmptyState icon={Coins} title="No spend yet" className="py-10" />}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <Section title="Top models" description="By request count" contentClassName="p-0" actions={<Link href="/dashboard/usage" className="text-[13px] text-accent hover:underline">Usage →</Link>}>
          {overview.byModel.length ? (
            <ul className="divide-y divide-border">
              {overview.byModel.slice(0, 6).map((m) => {
                const share = t.requests ? m.requests / t.requests : 0;
                return (
                  <li key={m.model} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate font-mono text-[12.5px] text-fg">{m.model}</span>
                      <span className="shrink-0 tabular-nums text-fg-muted">{formatCompact(m.requests)}</span>
                    </div>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.max(share * 100, 2)}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">No model usage yet.</p>
          )}
        </Section>
        <Section title="Recent requests" contentClassName="p-0" className="xl:col-span-2" actions={<Link href="/dashboard/logs" className="text-[13px] text-accent hover:underline">All logs →</Link>}>
          {recent.length ? (
            <ul className="divide-y divide-border">
              {recent.map((r) => (
                <li key={r.requestId}>
                  <Link href={`/dashboard/logs/${r.requestId}`} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-5 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[auto_1fr_auto_auto_auto]">
                    <StatusPill status={r.status} />
                    <span className="min-w-0 truncate font-mono text-[12.5px] text-fg">{r.modelSlug ?? r.modelRequested}</span>
                    <span className="hidden text-[12.5px] text-fg-subtle sm:block">{r.providerSlug ? vendorName(r.providerSlug) : "—"}</span>
                    <span className="hidden font-mono text-[12.5px] tabular-nums text-fg-muted sm:block">${usd(r.userChargeNano, 6)}</span>
                    <span className="text-right text-[12px] text-fg-subtle">{formatRelative(r.createdAt)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5">
              <EmptyState icon={KeyRound} title="Make your first call" description="Create a key, then point any OpenAI-compatible SDK at INRENT." action={<Button asChild size="sm"><Link href="/dashboard/keys?create=1">Create API key</Link></Button>} className="py-8" />
            </div>
          )}
        </Section>
      </div>

      <Section title="Quickstart" description="OpenAI-compatible — change the base URL and key." className="mt-6" actions={<Badge variant="outline">{site.apiBaseUrl}</Badge>}>
        <CodeBlock
          lang="bash"
          code={`curl ${site.apiBaseUrl}/chat/completions \\
  -H "Authorization: Bearer $INRENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "inrent/auto", "messages": [{"role": "user", "content": "Hello!"}]}'`}
        />
      </Section>
    </>
  );
}
