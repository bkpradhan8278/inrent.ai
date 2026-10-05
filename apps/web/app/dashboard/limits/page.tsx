import { Gauge, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { prisma } from "@inrent/db";
import { currentPeriod } from "@inrent/services";
import { PageHeader, Section } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usd } from "@/lib/dashboard";
import { formatNumber } from "@/lib/format";
import { getWorkspace } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Limits" };

function Meter({ used, limit }: { used: bigint; limit: bigint | null }) {
  if (limit === null || limit <= 0n) return <span className="text-[12.5px] text-fg-subtle">No limit</span>;
  const share = Math.min(Number((used * 1000n) / limit) / 1000, 1);
  return (
    <div className="min-w-36">
      <div className="flex justify-between text-[11.5px] text-fg-subtle">
        <span className="font-mono">${usd(used)}</span>
        <span className="font-mono">${usd(limit)}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
        <div className={cn("h-full rounded-full", share > 0.9 ? "bg-danger" : share > 0.75 ? "bg-amber" : "bg-accent")} style={{ width: `${Math.max(share * 100, 1)}%` }} />
      </div>
    </div>
  );
}

export default async function LimitsPage() {
  const ws = await getWorkspace();
  const period = currentPeriod();
  const [orgCounter, projectCounters, keys] = await Promise.all([
    prisma.spendCounter.findFirst({ where: { scope: "org", scopeId: ws.org.id, period } }),
    prisma.spendCounter.findMany({ where: { scope: "project", scopeId: { in: ws.projects.map((p) => p.id) }, period } }),
    prisma.apiKey.findMany({ where: { organizationId: ws.org.id, revokedAt: null }, select: { id: true, name: true, displayPrefix: true, lastFour: true, rpmLimit: true, tpmLimit: true, spendLimitNano: true }, orderBy: { createdAt: "desc" } }),
  ]);
  const keyCounters = await prisma.spendCounter.findMany({ where: { scope: "key", scopeId: { in: keys.map((k) => k.id) }, period: "total" } });
  const plan = ws.org.plan;

  return (
    <>
      <PageHeader title="Limits" description="Rate limits protect reliability; budgets protect your wallet. Requests over a limit fail fast with a clear error code." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Section title="Plan rate limits" description={plan ? `${plan.name} plan` : "Free plan"} actions={<Link href="/pricing" className="text-[13px] text-accent hover:underline">Compare plans</Link>}>
          <dl className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-fg-muted">Requests / minute</dt>
              <dd className="font-mono text-fg">{plan ? formatNumber(plan.rpmLimit) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Tokens / minute</dt>
              <dd className="font-mono text-fg">{plan ? formatNumber(plan.tpmLimit) : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Projects</dt>
              <dd className="font-mono text-fg">
                {ws.projects.length} / {plan?.maxProjects ?? "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-muted">Members</dt>
              <dd className="font-mono text-fg">{plan?.maxMembers ?? "—"}</dd>
            </div>
          </dl>
          <p className="mt-4 flex items-start gap-2 text-[12px] text-fg-subtle">
            <Info className="mt-px size-3.5 shrink-0" /> Limits are enforced per organization and per key with a sliding window. Responses include <code className="font-mono">x-ratelimit-*</code> headers.
          </p>
        </Section>
        <Section title="Organization budget" description={`Calendar month ${period} (UTC)`} className="lg:col-span-2" actions={ws.can("billing:manage") ? <Link href="/dashboard/billing" className="text-[13px] text-accent hover:underline">Edit cap</Link> : null}>
          <Meter used={orgCounter?.spentNano ?? 0n} limit={ws.org.monthlySpendCapNano} />
          <p className="mt-3 text-[12.5px] text-fg-muted">
            When the cap is reached, requests fail with <code className="font-mono">402 organization_budget_exceeded</code> until the next month or until the cap is raised. Low balance alerts:{" "}
            {ws.org.lowBalanceThresholdNano !== null ? <span className="font-mono text-fg">${usd(ws.org.lowBalanceThresholdNano)}</span> : "off"}.
          </p>
        </Section>
      </div>

      <Section title="Project budgets" className="mt-6" contentClassName="p-0" actions={<Link href="/dashboard/projects" className="text-[13px] text-accent hover:underline">Manage</Link>}>
        <Table>
          <THead>
            <TR>
              <TH>Project</TH>
              <TH>Monthly budget</TH>
              <TH>Allowed models</TH>
            </TR>
          </THead>
          <TBody>
            {ws.projects.map((p) => (
              <TR key={p.id}>
                <TD className="text-fg">{p.name}</TD>
                <TD>
                  <Meter used={projectCounters.find((c) => c.scopeId === p.id)?.spentNano ?? 0n} limit={p.monthlyBudgetNano} />
                </TD>
                <TD className="text-[12.5px]">{p.allowedModels.length ? p.allowedModels.join(", ") : <span className="text-fg-subtle">All</span>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>

      <Section title="API key limits" className="mt-6" contentClassName="p-0" actions={<Link href="/dashboard/keys" className="text-[13px] text-accent hover:underline">Edit keys</Link>}>
        {keys.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Key</TH>
                <TH>RPM</TH>
                <TH>TPM</TH>
                <TH>Lifetime spend limit</TH>
              </TR>
            </THead>
            <TBody>
              {keys.map((k) => (
                <TR key={k.id}>
                  <TD>
                    <div className="text-fg">{k.name}</div>
                    <div className="font-mono text-[11.5px] text-fg-subtle">
                      {k.displayPrefix}…{k.lastFour}
                    </div>
                  </TD>
                  <TD className="font-mono">{k.rpmLimit ? formatNumber(k.rpmLimit) : <Badge variant="outline">plan</Badge>}</TD>
                  <TD className="font-mono">{k.tpmLimit ? formatNumber(k.tpmLimit) : <Badge variant="outline">plan</Badge>}</TD>
                  <TD>
                    <Meter used={keyCounters.find((c) => c.scopeId === k.id)?.spentNano ?? 0n} limit={k.spendLimitNano} />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-fg-subtle">
            <Gauge className="size-4" /> No active keys.
          </div>
        )}
      </Section>
    </>
  );
}
