import type { Metadata } from "next";
import { prisma, type Prisma } from "@inrent/db";
import { AdminSearch, Pager } from "@/components/admin/search";
import { PageHeader, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usd } from "@/lib/dashboard";
import { formatDateTime, formatMs, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Requests" };
const PAGE = 100;

export default async function AdminRequests({ searchParams }: { searchParams: Promise<{ q?: string; status?: string; page?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("requests:read");
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where: Prisma.RequestWhereInput = {
    ...(q ? (q.startsWith("req_") ? { requestId: q } : { OR: [{ modelSlug: { contains: q } }, { providerSlug: q }, { organization: { slug: q } }] }) : {}),
    ...(sp.status === "ERROR" || sp.status === "SUCCESS" ? { status: sp.status } : {}),
  };
  // Admins see metadata only; prompt/response payloads stay with the customer.
  const rows = await prisma.request.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE + 1,
    select: { id: true, requestId: true, createdAt: true, modelSlug: true, modelRequested: true, providerSlug: true, status: true, httpStatus: true, errorCode: true, totalTokens: true, userChargeNano: true, providerCostNano: true, latencyMs: true, fallbackCount: true, billingMode: true, isDemo: true, organization: { select: { name: true, slug: true } } },
  });
  return (
    <>
      <PageHeader title="Requests" description="Platform-wide request metadata for debugging and support. Payloads are never shown in the admin console." />
      <AdminSearch action="/admin/requests" q={q} placeholder="Request ID (req_…), model, provider slug or org slug">
        <select name="status" defaultValue={sp.status ?? ""} className="h-9 rounded-md border border-border-strong bg-bg-elevated px-3 text-sm text-fg" aria-label="Status">
          <option value="">All</option>
          <option value="SUCCESS">Success</option>
          <option value="ERROR">Error</option>
        </select>
      </AdminSearch>
      <div className="panel overflow-hidden rounded-xl">
        <Table>
          <THead>
            <TR>
              <TH>Time</TH>
              <TH>Request</TH>
              <TH>Org</TH>
              <TH>Model / provider</TH>
              <TH>Status</TH>
              <TH className="text-right">Tokens</TH>
              <TH className="text-right">Charge</TH>
              <TH className="text-right">Cost</TH>
              <TH className="text-right">Latency</TH>
            </TR>
          </THead>
          <TBody>
            {rows.slice(0, PAGE).map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-[12px]">{formatDateTime(r.createdAt)}</TD>
                <TD className="font-mono text-[11.5px]">
                  {r.requestId}
                  {r.isDemo ? <Badge variant="amber" className="ml-1.5">demo</Badge> : null}
                </TD>
                <TD className="max-w-36 truncate text-[12.5px]">{r.organization.name}</TD>
                <TD className="text-[12.5px]">
                  <div className="font-mono text-fg">{r.modelSlug ?? r.modelRequested}</div>
                  <div className="text-fg-subtle">
                    {r.providerSlug ?? "—"} · {r.billingMode.toLowerCase()}
                    {r.fallbackCount ? ` · ${r.fallbackCount} fallback` : ""}
                  </div>
                </TD>
                <TD>
                  <StatusPill status={r.status} />
                  {r.errorCode ? <div className="mt-0.5 font-mono text-[11px] text-fg-subtle">{r.httpStatus} {r.errorCode}</div> : null}
                </TD>
                <TD className="text-right tabular-nums">{formatNumber(r.totalTokens)}</TD>
                <TD className="text-right font-mono tabular-nums text-fg">${usd(r.userChargeNano, 6)}</TD>
                <TD className="text-right font-mono tabular-nums">${usd(r.providerCostNano, 6)}</TD>
                <TD className="text-right tabular-nums">{formatMs(r.latencyMs)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-fg-subtle">No requests match.</p> : null}
      </div>
      <Pager basePath="/admin/requests" page={page} hasMore={rows.length > PAGE} params={{ q, status: sp.status }} />
    </>
  );
}
