import { cookies } from "next/headers";
import { nanoToUsdString, platformRoleCan } from "@inrent/core";
import { listNotifications } from "@inrent/services";
import { isPlaceholderEmail } from "@inrent/services/email";
import { DashboardShell } from "@/components/dashboard/shell";
import { getPlatformRole, getWorkspace } from "@/lib/session";

export const metadata = { title: { default: "Dashboard", template: "%s · INRENT Dashboard" }, robots: { index: false } };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const ws = await getWorkspace();
  const [role, notifications, c] = await Promise.all([getPlatformRole(ws.user.id), listNotifications(ws.user.id, ws.org.id, 15), cookies()]);
  return (
    <DashboardShell
      data={{
        // Phone-only accounts show their number rather than the placeholder address.
        user: { name: ws.user.name, email: isPlaceholderEmail(ws.user.email) ? (ws.user.phoneNumber ?? "") : ws.user.email, image: ws.user.image ?? null },
        isAdmin: platformRoleCan(role, "admin:access"),
        orgs: ws.memberships.map((m) => ({ id: m.organizationId, name: m.organization.name, type: m.organization.type, role: m.role })),
        activeOrgId: ws.org.id,
        projects: ws.projects.map((p) => ({ id: p.id, name: p.name })),
        activeProjectId: ws.project.id,
        environment: c.get("inrent_env")?.value ?? "all",
        balanceUsd: nanoToUsdString(ws.org.creditBalance?.balanceNano ?? 0n, 2),
        isDemo: ws.org.isDemo,
        notifications: notifications.map((n) => ({ id: n.id, title: n.title, body: n.body, link: n.link, createdAt: n.createdAt.toISOString(), read: Boolean(n.readAt) })),
      }}
    >
      {children}
    </DashboardShell>
  );
}
