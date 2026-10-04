import type { Metadata } from "next";
import { prisma, type Prisma } from "@inrent/db";
import { AdminSearch, Pager } from "@/components/admin/search";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { NativeSelect } from "@/components/ui/input";
import { RoleSelect } from "./role-select";

export const metadata: Metadata = { title: "Users" };
const PAGE = 50;

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; page?: string; role?: string }> }) {
  const sp = await searchParams;
  const admin = await requireAdmin("users:read");
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    ...(sp.role === "staff" ? { platformRole: { not: "USER" } } : {}),
  };
  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE + 1,
    select: { id: true, name: true, email: true, emailVerified: true, platformRole: true, createdAt: true, _count: { select: { memberships: true, sessions: true } } },
  });
  const rows = users.slice(0, PAGE);
  return (
    <>
      <PageHeader title="Users" description="Search accounts and manage platform (staff) roles. Customer roles inside organizations are managed by their owners." />
      <AdminSearch action="/admin/users" q={q} placeholder="Search by email or name">
        <NativeSelect name="role" defaultValue={sp.role ?? ""} className="w-auto min-w-36" aria-label="Role filter">
          <option value="">All users</option>
          <option value="staff">Staff only</option>
        </NativeSelect>
      </AdminSearch>
      <div className="panel overflow-hidden rounded-xl">
        <Table>
          <THead>
            <TR>
              <TH>User</TH>
              <TH>Verified</TH>
              <TH>Orgs</TH>
              <TH>Joined</TH>
              <TH>Platform role</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((u) => (
              <TR key={u.id}>
                <TD>
                  <div className="text-fg">{u.name}</div>
                  <div className="text-[12px] text-fg-subtle">{u.email}</div>
                </TD>
                <TD>{u.emailVerified ? <Badge variant="success">yes</Badge> : <Badge>no</Badge>}</TD>
                <TD className="tabular-nums">{u._count.memberships}</TD>
                <TD className="whitespace-nowrap text-[12.5px]">{formatDate(u.createdAt)}</TD>
                <TD>{admin.can("admin:roles") && u.id !== admin.user.id ? <RoleSelect userId={u.id} role={u.platformRole} /> : <Badge variant={u.platformRole === "USER" ? "neutral" : "iris"}>{u.platformRole.toLowerCase().replace("_", " ")}</Badge>}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
        {rows.length === 0 ? <p className="px-5 py-8 text-center text-sm text-fg-subtle">No users found.</p> : null}
      </div>
      <Pager basePath="/admin/users" page={page} hasMore={users.length > PAGE} params={{ q, role: sp.role }} />
    </>
  );
}
