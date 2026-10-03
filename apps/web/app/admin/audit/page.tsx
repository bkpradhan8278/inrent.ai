import type { Metadata } from "next";
import { prisma, type Prisma } from "@inrent/db";
import { AdminSearch, Pager } from "@/components/admin/search";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 100;

export default async function AdminAudit({ searchParams }: { searchParams: Promise<{ q?: string; actor?: string; page?: string }> }) {
  const sp = await searchParams;
  await requireAdmin("audit:read");
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where: Prisma.AuditLogWhereInput = {
    ...(q ? { action: { startsWith: q } } : {}),
    ...(sp.actor === "ADMIN" || sp.actor === "USER" || sp.actor === "SYSTEM" || sp.actor === "API_KEY" ? { actorType: sp.actor } : {}),
  };
  const rows = await prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE + 1, include: { organization: { select: { name: true } } } });
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => Boolean(x)))];
  const users = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, email: true } }) : [];
  return (
    <>
      <PageHeader title="Audit log" description="Append-only record of security-relevant actions by customers, staff and the system. Metadata never includes secrets." />
      <AdminSearch action="/admin/audit" q={q} placeholder="Action prefix, e.g. pricing. or provider.updated">
        <select name="actor" defaultValue={sp.actor ?? ""} className="h-9 rounded-md border border-border-strong bg-bg-elevated px-3 text-sm text-fg" aria-label="Actor type">
          <option value="">All actors</option>
          <option value="ADMIN">Staff</option>
          <option value="USER">Customers</option>
          <option value="SYSTEM">System</option>
        </select>
      </AdminSearch>
      <div className="panel overflow-hidden rounded-xl">
        <Table>
          <THead>
            <TR>
              <TH>Time</TH>
              <TH>Action</TH>
              <TH>Actor</TH>
              <TH>Organization</TH>
              <TH>Target</TH>
              <TH>Details</TH>
            </TR>
          </THead>
          <TBody>
            {rows.slice(0, PAGE).map((r) => (
              <TR key={r.id}>
                <TD className="whitespace-nowrap text-[12px]">{formatDateTime(r.createdAt)}</TD>
                <TD className="font-mono text-[12px] text-fg">{r.action}</TD>
                <TD className="text-[12.5px]">
                  <Badge variant={r.actorType === "ADMIN" ? "iris" : "outline"}>{r.actorType.toLowerCase()}</Badge> <span className="text-fg-subtle">{users.find((u) => u.id === r.actorId)?.email ?? ""}</span>
                </TD>
                <TD className="max-w-36 truncate text-[12.5px]">{r.organization?.name ?? "—"}</TD>
                <TD className="text-[12px] text-fg-subtle">{r.targetType ?? "—"}</TD>
                <TD className="max-w-72">
                  {r.metadata ? (
                    <details>
                      <summary className="cursor-pointer text-[12px] text-fg-subtle">view</summary>
                      <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-all rounded bg-bg-elevated p-2 font-mono text-[11px] text-fg-muted">{JSON.stringify(r.metadata, null, 2)}</pre>
                    </details>
                  ) : null}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-fg-subtle">No audit events.</p> : null}
      </div>
      <Pager basePath="/admin/audit" page={page} hasMore={rows.length > PAGE} params={{ q, actor: sp.actor }} />
    </>
  );
}
