import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { getPlatformStatus } from "@inrent/services";
import { PageHeader, Section, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime, formatMs, formatRelative } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { IncidentForm, IncidentUpdate } from "./incidents";

export const metadata: Metadata = { title: "System health" };
export const dynamic = "force-dynamic";

async function probeGateway() {
  const url = `${process.env.GATEWAY_INTERNAL_URL ?? "http://localhost:8080"}/ready`;
  const started = Date.now();
  try {
    const r = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(3000) });
    return { ok: r.ok, latencyMs: Date.now() - started, body: (await r.json().catch(() => null)) as Record<string, unknown> | null };
  } catch {
    return null;
  }
}

export default async function AdminSystem() {
  const admin = await requireAdmin("health:read");
  const gw = await probeGateway();
  const [status, providers, checks, webhookBacklog] = await Promise.all([
    getPlatformStatus({ gateway: gw ? { ok: gw.ok, latencyMs: gw.latencyMs } : null, database: true }),
    prisma.provider.findMany({ where: { enabled: true }, orderBy: { name: "asc" }, select: { id: true, name: true, slug: true, healthStatus: true, latencyP50Ms: true, errorRate: true, lastHealthCheckAt: true } }),
    prisma.providerHealthCheck.findMany({ orderBy: { checkedAt: "desc" }, take: 20, include: { provider: { select: { name: true } } } }),
    prisma.webhookDelivery.count({ where: { status: "PENDING" } }),
  ]);
  return (
    <>
      <PageHeader title="System health" description="Signals from the gateway readiness probe, provider health checks (worker, every minute) and open incidents. Unknown means no recent signal — never assumed healthy." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {status.components.map((c) => (
          <div key={c.id} className="panel rounded-xl p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-fg">{c.name}</span>
              <StatusPill status={c.status === "operational" ? "HEALTHY" : c.status === "unknown" ? "UNKNOWN" : c.status.toUpperCase()} />
            </div>
            <p className="mt-1.5 text-[12.5px] text-fg-muted">{c.detail}</p>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Gateway readiness" description={gw ? `Responded in ${gw.latencyMs} ms` : "Unreachable from the web app"}>
          <pre className="overflow-x-auto rounded-lg border border-border bg-bg-elevated p-3 font-mono text-[12px] text-fg-muted">{gw?.body ? JSON.stringify(gw.body, null, 2) : "No response"}</pre>
          <p className="mt-3 text-[12.5px] text-fg-subtle">Webhook deliveries pending or retrying: <span className="font-mono text-fg">{webhookBacklog}</span></p>
        </Section>
        <Section title="Enabled providers" contentClassName={providers.length ? "p-0" : undefined}>
          {providers.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Provider</TH>
                  <TH>Health</TH>
                  <TH className="text-right">p50</TH>
                  <TH className="text-right">Errors</TH>
                  <TH>Checked</TH>
                </TR>
              </THead>
              <TBody>
                {providers.map((p) => (
                  <TR key={p.id}>
                    <TD className="text-fg">{p.name}</TD>
                    <TD>
                      <StatusPill status={p.healthStatus} />
                    </TD>
                    <TD className="text-right tabular-nums">{formatMs(p.latencyP50Ms)}</TD>
                    <TD className="text-right tabular-nums">{p.errorRate === null ? "—" : `${(p.errorRate * 100).toFixed(1)}%`}</TD>
                    <TD className="text-[12.5px]">{p.lastHealthCheckAt ? formatRelative(p.lastHealthCheckAt) : "never"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="text-sm text-fg-subtle">No providers enabled.</p>
          )}
        </Section>
      </div>

      <Section title="Incidents" description="Published on the public status page." className="mt-6" actions={admin.can("incidents:write") ? <IncidentForm /> : null} contentClassName={status.incidents.length ? "p-0" : undefined}>
        {status.incidents.length ? (
          <ul className="divide-y divide-border">
            {status.incidents.map((i) => (
              <li key={i.id} className="grid gap-2 px-5 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{i.title}</span>
                  <Badge variant={i.impact === "CRITICAL" || i.impact === "MAJOR" ? "danger" : "amber"}>{i.impact.toLowerCase()}</Badge>
                  <StatusPill status={i.status === "RESOLVED" ? "RESOLVED" : i.status} />
                  <span className="text-[12px] text-fg-subtle">
                    {i.components.join(", ")} · started {formatDateTime(i.startedAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-fg-muted">{i.body}</p>
                {!i.resolvedAt && admin.can("incidents:write") ? <IncidentUpdate id={i.id} status={i.status} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-subtle">No incidents in the last 14 days.</p>
        )}
      </Section>

      <Section title="Recent health checks" className="mt-6" contentClassName={checks.length ? "p-0" : undefined}>
        {checks.length ? (
          <ul className="divide-y divide-border">
            {checks.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 px-5 py-2 text-[12.5px]">
                <span className="text-fg">{c.provider.name}</span>
                <StatusPill status={c.status} />
                <span className="text-fg-subtle">{formatMs(c.latencyMs)}</span>
                {c.error ? <span className="truncate text-danger">{c.error}</span> : null}
                <span className="ml-auto text-fg-subtle">{formatRelative(c.checkedAt)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-subtle">No health checks recorded. Start the worker to run them.</p>
        )}
      </Section>
    </>
  );
}
