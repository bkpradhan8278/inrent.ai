import { prisma, type MemberRole, type PlatformRole } from "@inrent/db";
import { platformRoleCan, roleCan, type AdminPermission, type OrgPermission } from "@inrent/core";
import { ForbiddenError, NotFoundError } from "./errors";

export interface OrgContext {
  userId: string;
  organizationId: string;
  role: MemberRole;
}

/**
 * Resolves the caller's membership and checks a permission. This is the single entry point
 * for organization authorization — every mutation goes through it, so a user can never act
 * on an organization they don't belong to (IDOR protection).
 */
export async function requireOrgPermission(userId: string, organizationId: string, permission: OrgPermission): Promise<OrgContext> {
  const membership = await prisma.membership.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    include: { organization: { select: { deletedAt: true } } },
  });
  if (!membership || membership.organization.deletedAt) throw new NotFoundError("Organization");
  if (!roleCan(membership.role, permission)) throw new ForbiddenError();
  return { userId, organizationId, role: membership.role };
}

export async function requireAdminPermission(userId: string, permission: AdminPermission): Promise<{ userId: string; role: PlatformRole }> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true, deletedAt: true } });
  if (!user || user.deletedAt || !platformRoleCan(user.platformRole, permission)) throw new ForbiddenError();
  return { userId, role: user.platformRole };
}

/** Ensures a project belongs to the organization (prevents cross-org project references). */
export async function requireProjectInOrg(projectId: string, organizationId: string) {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId, deletedAt: null } });
  if (!project) throw new NotFoundError("Project");
  return project;
}

export async function listUserOrganizations(userId: string) {
  return prisma.membership.findMany({
    where: { userId, organization: { deletedAt: null } },
    include: { organization: { include: { plan: true } } },
    orderBy: { createdAt: "asc" },
  });
}
