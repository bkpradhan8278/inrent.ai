import type { Metadata } from "next";
import { prisma, type Prisma } from "@inrent/db";
import { AdminSearch, Pager } from "@/components/admin/search";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usd } from "@/lib/dashboard";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { OrgActions } from "./org-actions";

export const metadata: Metadata = { title: "Organizations" };
const PAGE = 40;

export default async function AdminOrgs({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; filter?: string }> }) {
  const sp = await searchParams;
  const admin = await requireAdmin("orgs:read");
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where: Prisma.OrganizationWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" } }, { slug: { contains: q, mode: "insensitive" } }, { memberships: { some: { user: { email: { contains: q, mode: "insensitive" } } } } }] } : {}),
    ...(sp.filter === "suspended" ? { suspendedAt: { not: null } } : sp.filter === "demo" ? { isDemo: true } : {}),
  };
  const [orgs, plans] = await Promise.all([
    prisma.organization.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE + 1,
      include: { plan: { select: { slug: true, name: true } }, creditBalance: true, _count: { select: { memberships: true, apiKeys: { where: { revokedAt: null } } } } },
    }),
    prisma.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { slug: true, name: true } }),
  ]);
  const rows = orgs.slice(0, PAGE);
  return (
    <>
      <PageHeader title="Organizations" description="Plans, balances and account standing. Suspension blocks API access immediately (cached keys expire within a minute)." />
      <AdminSearch action="/admin/organizations" q={q} placeholder="Search by name, slug or member email">
        <select name="filter" defaultValue={sp.filter ?? ""} className="h-9 rounded-md border border-border-strong bg-bg-elevated px-3 text-sm text-fg" aria-label="Filter">
          <option value="">All</option>
          <option value="suspended">Suspended</option>
          <option value="demo">Demo</option>
        </select>
      </AdminSearch>
      <div className="panel overflow-hidden rounded-xl">
        <Table>
          <THead>
            <TR>
              <TH>Organization</TH>
              <TH>Plan</TH>
              <TH className="text-right">Balance</TH>
              <TH>Members</TH>
              <TH>Keys</TH>
              <TH>Created</TH>
              <TH>Status</TH>
              <TH className="w-10">
                <span className="sr-only">Actions</span>
              </TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((o) => (
              <TR key={o.id}>
                <TD>
                  <div className="text-fg">{o.name}</div>
                  <div className="font-mono text-[11.5px] text-fg-subtle">
                    {o.slug} · {o.type.toLowerCase()}
                  </div>
                </TD>
                <TD>{o.plan?.name ?? "—"}</TD>
                <TD className="text-right font-mono tabular-nums text-fg">${usd(o.creditBalance?.balanceNano ?? 0n)}</TD>
                <TD className="tabular-nums">{o._count.memberships}</TD>
                <TD className="tabular-nums">{o._count.apiKeys}</TD>
                <TD className="whitespace-nowrap text-[12.5px]">{formatDate(o.createdAt)}</TD>
                <TD>
                  <div className="flex flex-wrap gap-1">
                    {o.suspendedAt ? <Badge variant="danger" title={o.suspensionReason ?? undefined}>suspended</Badge> : <Badge variant="success">active</Badge>}
                    {o.isDemo ? <Badge variant="amber">demo</Badge> : null}
                  </div>
                </TD>
                <TD>
                  <OrgActions org={{ id: o.id, name: o.name, plan: o.plan?.slug ?? "", suspended: Boolean(o.suspendedAt) }} plans={plans} canWrite={admin.can("orgs:write")} canRefund={admin.can("refunds:write")} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-fg-subtle">No organizations found.</p> : null}
      </div>
      <Pager basePath="/admin/organizations" page={page} hasMore={orgs.length > PAGE} params={{ q, filter: sp.filter }} />
    </>
  );
}
