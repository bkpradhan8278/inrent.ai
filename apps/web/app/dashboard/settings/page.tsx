import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { PageHeader, Section } from "@/components/dashboard/ui";
import { formatDateTime } from "@/lib/format";
import { getWorkspace } from "@/lib/session";
import { AccountForms, OrgSettingsForm } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ws = await getWorkspace();
  const canAudit = ws.can("audit:read");
  const audit = canAudit ? await prisma.auditLog.findMany({ where: { organizationId: ws.org.id }, orderBy: { createdAt: "desc" }, take: 30 }) : [];
  const actorIds = [...new Set(audit.map((a) => a.actorId).filter((x): x is string => Boolean(x)))];
  const actors = actorIds.length ? await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true, email: true } }) : [];
  const actorName = (id: string | null, type: string) => (type === "SYSTEM" ? "System" : (actors.find((u) => u.id === id)?.name ?? (type === "API_KEY" ? "API key" : "Unknown")));

  return (
    <>
      <PageHeader title="Settings" description={`${ws.org.name} · ${ws.org.type === "PERSONAL" ? "Personal workspace" : "Team organization"}`} />
      <div className="grid gap-6">
        <OrgSettingsForm
          canWrite={ws.can("settings:write")}
          maxRetention={ws.org.plan?.logRetentionDays ?? 30}
          initial={{
            name: ws.org.name,
            promptLogging: ws.org.promptLogging,
            responseLogging: ws.org.responseLogging,
            logRetentionDays: ws.org.logRetentionDays,
            zeroRetention: ws.org.zeroRetention,
            routingPolicy: ws.org.routingPolicy === "CUSTOM" ? "BALANCED" : ws.org.routingPolicy,
            preferByok: ws.org.preferByok,
          }}
        />
        <AccountForms name={ws.user.name} email={ws.user.email} />
        {canAudit ? (
          <Section title="Audit log" description="Security-relevant actions in this organization (most recent 30). Export the full log via support." contentClassName="p-0">
            {audit.length ? (
              <ul className="divide-y divide-border">
                {audit.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[12.5px]">
                    <span className="font-mono text-fg">{a.action}</span>
                    <span className="text-fg-muted">{actorName(a.actorId, a.actorType)}</span>
                    {a.targetType ? <span className="text-fg-subtle">{a.targetType}</span> : null}
                    <span className="ml-auto text-fg-subtle">{formatDateTime(a.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-fg-subtle">No audit events yet.</p>
            )}
          </Section>
        ) : null}
      </div>
    </>
  );
}
