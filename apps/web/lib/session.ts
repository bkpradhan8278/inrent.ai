import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { platformRoleCan, roleCan, type AdminPermission, type OrgPermission } from "@inrent/core";
import { prisma } from "@inrent/db";
import { provisionPersonalWorkspace } from "@inrent/services";
import { auth } from "./auth";

export const ORG_COOKIE = "inrent_org";
export const PROJECT_COOKIE = "inrent_project";

export const getSession = cache(async () => {
  try {
    return await auth.api.getSession({ headers: await headers() });
  } catch {
    return null;
  }
});

export async function requireUser() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

async function loadWorkspace(userId: string, user: { name: string; email: string }, wantedOrg?: string, wantedProject?: string) {
  let memberships = await prisma.membership.findMany({
    where: { userId, organization: { deletedAt: null } },
    include: { organization: { include: { plan: true, creditBalance: true } } },
    orderBy: { createdAt: "asc" },
  });
  if (!memberships.length) {
    await provisionPersonalWorkspace({ id: userId, name: user.name, email: user.email });
    memberships = await prisma.membership.findMany({
      where: { userId, organization: { deletedAt: null } },
      include: { organization: { include: { plan: true, creditBalance: true } } },
      orderBy: { createdAt: "asc" },
    });
  }
  const membership = memberships.find((m) => m.organizationId === wantedOrg) ?? memberships[0]!;
  const projects = await prisma.project.findMany({
    where: { organizationId: membership.organizationId, deletedAt: null },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const project = projects.find((p) => p.id === wantedProject) ?? projects[0]!;
  return {
    memberships,
    membership,
    org: membership.organization,
    role: membership.role,
    projects,
    project,
    can: (permission: OrgPermission) => roleCan(membership.role, permission),
  };
}

/**
 * The signed-in user's active organization and project. The selection cookie is only a
 * preference: it is always re-validated against the user's memberships.
 */
export const getWorkspace = cache(async () => {
  const session = await requireUser();
  const c = await cookies();
  const ws = await loadWorkspace(session.user.id, session.user, c.get(ORG_COOKIE)?.value, c.get(PROJECT_COOKIE)?.value);
  return { session, user: session.user, ...ws };
});

export type Workspace = Awaited<ReturnType<typeof getWorkspace>>;

export async function requireOrgPermission(permission: OrgPermission) {
  const ws = await getWorkspace();
  if (!ws.can(permission)) redirect(`/dashboard?denied=${encodeURIComponent(permission)}`);
  return ws;
}

/** Route-handler variant: returns null instead of redirecting. */
export async function getWorkspaceForRequest(req: Request) {
  const session = await auth.api.getSession({ headers: req.headers }).catch(() => null);
  if (!session) return null;
  const c = await cookies();
  const ws = await loadWorkspace(session.user.id, session.user, c.get(ORG_COOKIE)?.value, c.get(PROJECT_COOKIE)?.value);
  return { session, user: session.user, ...ws };
}

export async function getPlatformRole(userId: string) {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
  return u?.platformRole ?? "USER";
}

export async function requireAdmin(permission: AdminPermission = "admin:access") {
  const session = await requireUser();
  const role = await getPlatformRole(session.user.id);
  if (!platformRoleCan(role, permission)) redirect("/dashboard");
  return { session, user: session.user, role, can: (p: AdminPermission) => platformRoleCan(role, p) };
}
