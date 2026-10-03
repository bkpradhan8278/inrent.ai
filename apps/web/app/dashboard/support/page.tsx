import { Activity, BookOpen, LifeBuoy, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@inrent/db";
import { PageHeader, Section, StatusPill } from "@/components/dashboard/ui";
import { formatRelative } from "@/lib/format";
import { getWorkspace } from "@/lib/session";
import { site } from "@/lib/site";
import { TicketForm } from "./ticket-form";

export const metadata: Metadata = { title: "Support" };

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ subject?: string; request?: string }> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const tickets = await prisma.supportTicket.findMany({ where: { userId: ws.user.id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, subject: true, status: true, category: true, createdAt: true } });
  const links = [
    { href: "/docs", icon: BookOpen, title: "Documentation", body: "Guides, API reference and error codes." },
    { href: "/status", icon: Activity, title: "System status", body: "Live component health and incidents." },
    { href: "/docs/errors", icon: LifeBuoy, title: "Troubleshooting", body: "What each error code means and how to fix it." },
    { href: `mailto:${site.securityEmail}`, icon: ShieldAlert, title: "Report a vulnerability", body: "Responsible disclosure to our security team." },
  ];
  return (
    <>
      <PageHeader title="Support" description="Include the request ID (req_…) for anything about a specific call — it lets us trace the request end to end." />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {links.map((l) => (
          <Link key={l.title} href={l.href} className="panel rounded-xl p-4 transition-colors hover:border-border-strong">
            <l.icon className="size-4 text-accent" />
            <div className="mt-2 text-sm font-medium text-fg">{l.title}</div>
            <p className="mt-0.5 text-[12.5px] text-fg-muted">{l.body}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-5">
        <Section title="Open a ticket" className="xl:col-span-3">
          <TicketForm defaultSubject={sp.subject?.slice(0, 160) ?? ""} defaultBody={sp.request ? `Request ID: ${sp.request.slice(0, 64)}\n\n` : ""} />
        </Section>
        <Section title="Your tickets" className="xl:col-span-2" contentClassName={tickets.length ? "p-0" : undefined}>
          {tickets.length ? (
            <ul className="divide-y divide-border">
              {tickets.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm text-fg">{t.subject}</div>
                    <div className="text-[12px] text-fg-subtle">
                      {t.category} · {formatRelative(t.createdAt)}
                    </div>
                  </div>
                  <StatusPill status={t.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-fg-subtle">No tickets yet. Replies go to your account email.</p>
          )}
        </Section>
      </div>
    </>
  );
}
