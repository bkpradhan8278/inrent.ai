import { ScrollText, Search } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { prisma } from "@inrent/db";
import { listRequests, type RequestFilters } from "@inrent/services";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { DemoDataBadge, EmptyState, PageHeader, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usd } from "@/lib/dashboard";
import { formatDateTime, formatMs, formatNumber, formatRelative } from "@/lib/format";
import { requireOrgPermission } from "@/lib/session";
import { vendorName } from "@/lib/vendors";

export const metadata: Metadata = { title: "Logs" };

type SP = { status?: string; model?: string; key?: string; q?: string; cursor?: string; scope?: string };

export default async function LogsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ws = await requireOrgPermission("logs:read");
  const filters: RequestFilters = {
    status: sp.status === "SUCCESS" || sp.status === "ERROR" || sp.status === "CANCELLED" ? sp.status : undefined,
    model: sp.model || undefined,
    apiKeyId: sp.key && /^[0-9a-f-]{36}$/i.test(sp.key) ? sp.key : undefined,
    search: sp.q?.trim() || undefined,
    projectId: sp.scope === "project" ? ws.project.id : undefined,
  };
  const [page, models, keys] = await Promise.all([
    listRequests(ws.org.id, filters, { cursor: sp.cursor && /^[0-9a-f-]{36}$/i.test(sp.cursor) ? sp.cursor : undefined, limit: 50 }),
    prisma.request.findMany({ where: { organizationId: ws.org.id, modelSlug: { not: null } }, distinct: ["modelSlug"], select: { modelSlug: true }, take: 50 }),
    prisma.apiKey.findMany({ where: { organizationId: ws.org.id }, select: { id: true, name: true }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const hasDemo = page.items.some((r) => r.isDemo);
  const nextHref = page.nextCursor ? `/dashboard/logs?${new URLSearchParams(Object.entries({ ...sp, cursor: page.nextCursor }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}` : null;
  const filtered = Boolean(filters.status || filters.model || filters.apiKeyId || filters.search || filters.projectId);

  return (
    <>
      <PageHeader title="Logs" description={`Every request with routing, tokens, cost and latency. Retained for ${ws.org.logRetentionDays} days${ws.org.zeroRetention ? " (zero-retention: payloads never stored)" : ""}.`} badge={<DemoDataBadge show={hasDemo} />} actions={<ExportMenu kinds={[{ kind: "requests", label: "Request log" }]} />} />

      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]" action="/dashboard/logs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input name="q" defaultValue={sp.q} placeholder="Search by request ID (req_…)" className="pl-9" aria-label="Request ID" />
        </div>
        <NativeSelect name="status" defaultValue={sp.status ?? ""} aria-label="Status" className="lg:w-36">
          <option value="">All statuses</option>
          <option value="SUCCESS">Success</option>
          <option value="ERROR">Error</option>
          <option value="CANCELLED">Cancelled</option>
        </NativeSelect>
        <NativeSelect name="model" defaultValue={sp.model ?? ""} aria-label="Model" className="lg:w-52">
          <option value="">All models</option>
          {models.map((m) => (
            <option key={m.modelSlug} value={m.modelSlug!}>
              {m.modelSlug}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="key" defaultValue={sp.key ?? ""} aria-label="API key" className="lg:w-44">
          <option value="">All keys</option>
          {keys.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </NativeSelect>
        <NativeSelect name="scope" defaultValue={sp.scope ?? ""} aria-label="Project scope" className="lg:w-40">
          <option value="">All projects</option>
          <option value="project">{ws.project.name}</option>
        </NativeSelect>
        <div className="flex gap-2">
          <Button type="submit" variant="secondary" className="flex-1">
            Filter
          </Button>
          {filtered ? (
            <Button asChild variant="ghost">
              <Link href="/dashboard/logs">Reset</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {page.items.length === 0 ? (
        <EmptyState icon={ScrollText} title={filtered ? "No requests match these filters" : "No requests yet"} description={filtered ? "Try widening the filters." : "Requests appear here as soon as they complete."} />
      ) : (
        <div className="panel overflow-hidden rounded-xl">
          <div className="hidden lg:block">
            <Table>
              <THead>
                <TR>
                  <TH>Time</TH>
                  <TH>Status</TH>
                  <TH>Model</TH>
                  <TH>Provider</TH>
                  <TH className="text-right">Tokens</TH>
                  <TH className="text-right">Cost</TH>
                  <TH className="text-right">Latency</TH>
                  <TH>Key</TH>
                </TR>
              </THead>
              <TBody>
                {page.items.map((r) => (
                  <TR key={r.id} className="relative">
                    <TD className="whitespace-nowrap text-[12.5px]">
                      <Link href={`/dashboard/logs/${r.requestId}`} className="after:absolute after:inset-0" title={formatDateTime(r.createdAt)}>
                        {formatRelative(r.createdAt)}
                      </Link>
                    </TD>
                    <TD>
                      <span className="inline-flex items-center gap-1.5">
                        <StatusPill status={r.status} />
                        {r.status === "ERROR" ? <span className="font-mono text-[11px] text-fg-subtle">{r.httpStatus}</span> : null}
                      </span>
                    </TD>
                    <TD className="max-w-56 truncate font-mono text-[12.5px] text-fg">
                      {r.modelSlug ?? r.modelRequested}
                      {r.stream ? <Badge variant="outline" className="ml-2">stream</Badge> : null}
                    </TD>
                    <TD className="whitespace-nowrap text-[12.5px]">
                      {r.providerSlug ? vendorName(r.providerSlug) : "—"}
                      {r.fallbackCount ? <Badge variant="amber" className="ml-1.5">+{r.fallbackCount} fallback</Badge> : null}
                      {r.billingMode === "BYOK" ? <Badge variant="iris" className="ml-1.5">BYOK</Badge> : null}
                    </TD>
                    <TD className="text-right tabular-nums">{formatNumber(r.totalTokens)}</TD>
                    <TD className="text-right font-mono tabular-nums text-fg">${usd(r.userChargeNano, 6)}</TD>
                    <TD className="text-right tabular-nums">{formatMs(r.latencyMs)}</TD>
                    <TD className="max-w-32 truncate text-[12.5px]">{r.apiKey?.name ?? (r.source === "playground" ? "Playground" : "—")}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          <ul className="divide-y divide-border lg:hidden">
            {page.items.map((r) => (
              <li key={r.id}>
                <Link href={`/dashboard/logs/${r.requestId}`} className="block p-4 transition-colors hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate font-mono text-[12.5px] text-fg">{r.modelSlug ?? r.modelRequested}</span>
                    <StatusPill status={r.status} />
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-fg-subtle">
                    <span>{formatRelative(r.createdAt)}</span>
                    <span>{r.providerSlug ? vendorName(r.providerSlug) : "—"}</span>
                    <span>{formatNumber(r.totalTokens)} tok</span>
                    <span className="font-mono">${usd(r.userChargeNano, 6)}</span>
                    <span>{formatMs(r.latencyMs)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-4 flex items-center justify-between text-[13px] text-fg-subtle">
        <span>Showing {page.items.length} requests</span>
        <div className="flex gap-2">
          {sp.cursor ? (
            <Button asChild variant="ghost" size="sm">
              <Link href={`/dashboard/logs?${new URLSearchParams(Object.entries({ ...sp, cursor: undefined }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`}>Newest</Link>
            </Button>
          ) : null}
          {nextHref ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={nextHref}>Older →</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </>
  );
}
