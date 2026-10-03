import type { Metadata } from "next";
import { MEMBER_ROLE_INFO } from "@inrent/core";
import { prisma } from "@inrent/db";
import { PageHeader } from "@/components/dashboard/ui";
import { getWorkspace } from "@/lib/session";
import { TeamManager } from "./team-manager";

export const metadata: Metadata = { title: "Team" };

export default async function TeamPage() {
  const ws = await getWorkspace();
  const [members, invitations] = await Promise.all([
    prisma.membership.findMany({ where: { organizationId: ws.org.id }, include: { user: { select: { id: true, name: true, email: true, image: true } } }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({ where: { organizationId: ws.org.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" } }),
  ]);
  return (
    <>
      <PageHeader title="Team" description={ws.org.type === "PERSONAL" ? "This is your personal workspace. Create a team organization from the workspace switcher to collaborate." : `Members of ${ws.org.name} and their roles.`} />
      <TeamManager
        isPersonal={ws.org.type === "PERSONAL"}
        canManage={ws.can("members:manage")}
        currentUserId={ws.user.id}
        roles={MEMBER_ROLE_INFO}
        members={members.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, image: m.user.image, role: m.role, joinedAt: m.createdAt.toISOString() }))}
        invitations={invitations.map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt.toISOString() }))}
        maxMembers={ws.org.plan?.maxMembers ?? null}
      />
    </>
  );
}
