import type { Metadata } from "next";
import { prisma, type Prisma } from "@inrent/db";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";
import { cn } from "@/lib/utils";
import { TicketStatus } from "./ticket-status";

export const metadata: Metadata = { title: "Support tickets" };
const TABS = [
  { key: "open", label: "Open", where: { status: { in: ["OPEN", "PENDING"] } } },
  { key: "resolved", label: "Resolved", where: { status: { in: ["RESOLVED", "CLOSED"] } } },
  { key: "all", label: "All", where: {} },
] as const satisfies ReadonlyArray<{ key: string; label: string; where: Prisma.SupportTicketWhereInput }>;

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const admin = await requireAdmin("tickets:read");
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const tickets = await prisma.supportTicket.findMany({ where: tab.where as Prisma.SupportTicketWhereInput, orderBy: [{ priority: "asc" }, { createdAt: "desc" }], take: 100, include: { organization: { select: { name: true } } } });
  return (
    <>
      <PageHeader title="Support tickets" description="Replies are sent from your support mailbox to the ticket email. Never ask customers for API keys." />
      <div className="mb-4 inline-flex rounded-md border border-border bg-surface p-0.5 text-[13px]">
        {TABS.map((t) => (
          <a key={t.key} href={`/admin/support?tab=${t.key}`} className={cn("rounded px-3 py-1", t.key === tab.key ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}>
            {t.label}
          </a>
        ))}
      </div>
      {tickets.length ? (
        <ul className="grid gap-3">
          {tickets.map((t) => (
            <li key={t.id} className="panel rounded-xl p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-fg">{t.subject}</span>
                <Badge variant="outline">{t.category}</Badge>
                {t.priority === "high" ? <Badge variant="danger">high priority</Badge> : null}
                <span className="ml-auto">{admin.can("tickets:write") ? <TicketStatus id={t.id} status={t.status} /> : <Badge>{t.status.toLowerCase()}</Badge>}</span>
              </div>
              <div className="mt-1 text-[12px] text-fg-subtle">
                {t.email}
                {t.organization ? ` · ${t.organization.name}` : ""} · {formatDateTime(t.createdAt)}
              </div>
              <p className="mt-3 whitespace-pre-wrap break-words text-[13px] text-fg-muted">{t.body}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="panel rounded-xl px-5 py-8 text-center text-sm text-fg-subtle">No tickets here.</p>
      )}
    </>
  );
}
