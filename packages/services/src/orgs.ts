import { createHash, randomBytes } from "node:crypto";
import { prisma, type MemberRole } from "@inrent/db";
import { recordAudit } from "./audit";
import { requireOrgPermission } from "./authz";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { slugify, uniqueSlug } from "./slug";

/**
 * Creates the personal workspace every new user gets: organization, default project,
 * zero credit balance and the Free plan. Idempotent per user.
 */
export async function provisionPersonalWorkspace(user: { id: string; name: string; email: string }) {
  const existing = await prisma.membership.findFirst({ where: { userId: user.id } });
  if (existing) return existing.organizationId;
  const freePlan = await prisma.plan.findUnique({ where: { slug: "free" } });
  const name = user.name?.trim() ? `${user.name.trim().split(/\s+/)[0]}'s workspace` : "Personal workspace";
  const org = await prisma.organization.create({
    data: {
      name,
      slug: uniqueSlug(user.name || user.email.split("@")[0] || "workspace"),
      type: "PERSONAL",
      planId: freePlan?.id,
      billingEmail: user.email,
      memberships: { create: { userId: user.id, role: "OWNER" } },
      creditBalance: { create: { balanceNano: 0n } },
      projects: { create: { name: "Default project", slug: "default", isDefault: true } },
    },
  });
  await recordAudit({ organizationId: org.id, actorType: "SYSTEM", action: "organization.provisioned", targetType: "organization", targetId: org.id });
  return org.id;
}

export async function createTeamOrganization(userId: string, name: string) {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 64) throw new ValidationError("Organization name must be 2–64 characters.");
  const plan = await prisma.plan.findUnique({ where: { slug: "free" } });
  const org = await prisma.organization.create({
    data: {
      name: trimmed,
      slug: uniqueSlug(trimmed),
      type: "TEAM",
      planId: plan?.id,
      memberships: { create: { userId, role: "OWNER" } },
      creditBalance: { create: { balanceNano: 0n } },
      projects: { create: { name: "Default project", slug: "default", isDefault: true } },
    },
  });
  await recordAudit({ organizationId: org.id, actorType: "USER", actorId: userId, action: "organization.created", targetType: "organization", targetId: org.id });
  return org;
}

export async function createProject(
  userId: string,
  organizationId: string,
  input: { name: string; description?: string; monthlyBudgetNano?: bigint | null; allowedModels?: string[] },
) {
  await requireOrgPermission(userId, organizationId, "projects:write");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 64) throw new ValidationError("Project name must be 1–64 characters.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const count = await prisma.project.count({ where: { organizationId, deletedAt: null } });
  if (org.plan && count >= org.plan.maxProjects) {
    throw new ValidationError(`Your plan allows ${org.plan.maxProjects} projects. Archive one or upgrade.`);
  }
  let slug = slugify(name);
  if (await prisma.project.findUnique({ where: { organizationId_slug: { organizationId, slug } } })) slug = uniqueSlug(name);
  const project = await prisma.project.create({
    data: {
      organizationId,
      name,
      slug,
      description: input.description?.slice(0, 280),
      monthlyBudgetNano: input.monthlyBudgetNano ?? null,
      allowedModels: input.allowedModels ?? [],
    },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "project.created", targetType: "project", targetId: project.id });
  return project;
}

export async function updateProject(
  userId: string,
  organizationId: string,
  projectId: string,
  input: { name?: string; description?: string | null; monthlyBudgetNano?: bigint | null; allowedModels?: string[] },
) {
  await requireOrgPermission(userId, organizationId, "projects:write");
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId, deletedAt: null } });
  if (!project) throw new NotFoundError("Project");
  const updated = await prisma.project.update({
    where: { id: project.id },
    data: {
      name: input.name?.trim() || undefined,
      description: input.description === undefined ? undefined : input.description?.slice(0, 280) ?? null,
      monthlyBudgetNano: input.monthlyBudgetNano === undefined ? undefined : input.monthlyBudgetNano,
      allowedModels: input.allowedModels,
    },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "project.updated", targetType: "project", targetId: project.id, metadata: { fields: Object.keys(input) } });
  return updated;
}

export async function archiveProject(userId: string, organizationId: string, projectId: string) {
  await requireOrgPermission(userId, organizationId, "projects:write");
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId, deletedAt: null } });
  if (!project) throw new NotFoundError("Project");
  if (project.isDefault) throw new ValidationError("The default project cannot be archived.");
  const now = new Date();
  await prisma.$transaction([
    prisma.project.update({ where: { id: project.id }, data: { deletedAt: now } }),
    prisma.apiKey.updateMany({ where: { projectId: project.id, revokedAt: null }, data: { revokedAt: now, revokedReason: "project_archived" } }),
  ]);
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "project.archived", targetType: "project", targetId: project.id });
}

// ── Members & invitations ────────────────────────────────────────────────────

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function inviteMember(userId: string, organizationId: string, email: string, role: MemberRole) {
  await requireOrgPermission(userId, organizationId, "members:manage");
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new ValidationError("Enter a valid email address.");
  if (role === "OWNER") throw new ValidationError("Invite as Admin, then transfer ownership.");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true, _count: { select: { memberships: true } } } });
  if (org.type === "PERSONAL") throw new ValidationError("Personal workspaces can't have members. Create a team organization.");
  if (org.plan && org._count.memberships >= org.plan.maxMembers) throw new ValidationError(`Your plan allows ${org.plan.maxMembers} members.`);
  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.invitation.create({
    data: { organizationId, email: normalized, role, tokenHash: hashToken(token), invitedById: userId, expiresAt: new Date(Date.now() + INVITE_TTL_MS) },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "member.invited", targetType: "invitation", targetId: invitation.id, metadata: { email: normalized, role } });
  return { invitation, token };
}

export async function acceptInvitation(user: { id: string; email: string }, token: string) {
  const invitation = await prisma.invitation.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt < new Date()) {
    throw new NotFoundError("Invitation");
  }
  if (invitation.email !== user.email.toLowerCase()) throw new ForbiddenError("This invitation was sent to a different email address.");
  await prisma.$transaction([
    prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: invitation.organizationId, userId: user.id } },
      create: { organizationId: invitation.organizationId, userId: user.id, role: invitation.role },
      update: {},
    }),
    prisma.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } }),
  ]);
  await recordAudit({ organizationId: invitation.organizationId, actorType: "USER", actorId: user.id, action: "member.joined", targetType: "user", targetId: user.id });
  return invitation.organizationId;
}

export async function updateMemberRole(userId: string, organizationId: string, memberUserId: string, role: MemberRole) {
  const ctx = await requireOrgPermission(userId, organizationId, "members:manage");
  const member = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: memberUserId } } });
  if (!member) throw new NotFoundError("Member");
  if ((role === "OWNER" || member.role === "OWNER") && ctx.role !== "OWNER") throw new ForbiddenError("Only owners can change ownership.");
  if (member.role === "OWNER" && role !== "OWNER") {
    const owners = await prisma.membership.count({ where: { organizationId, role: "OWNER" } });
    if (owners <= 1) throw new ValidationError("An organization must keep at least one owner.");
  }
  await prisma.membership.update({ where: { id: member.id }, data: { role } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "member.role_changed", targetType: "user", targetId: memberUserId, metadata: { from: member.role, to: role } });
}

export async function removeMember(userId: string, organizationId: string, memberUserId: string) {
  const ctx = await requireOrgPermission(userId, organizationId, "members:manage");
  const member = await prisma.membership.findUnique({ where: { organizationId_userId: { organizationId, userId: memberUserId } } });
  if (!member) throw new NotFoundError("Member");
  if (member.role === "OWNER") {
    if (ctx.role !== "OWNER") throw new ForbiddenError("Only owners can remove owners.");
    const owners = await prisma.membership.count({ where: { organizationId, role: "OWNER" } });
    if (owners <= 1) throw new ValidationError("An organization must keep at least one owner.");
  }
  await prisma.membership.delete({ where: { id: member.id } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "member.removed", targetType: "user", targetId: memberUserId });
}

export async function updateOrganizationSettings(
  userId: string,
  organizationId: string,
  input: {
    name?: string;
    promptLogging?: boolean;
    responseLogging?: boolean;
    logRetentionDays?: number;
    zeroRetention?: boolean;
    routingPolicy?: "BALANCED" | "LOWEST_COST" | "LOWEST_LATENCY" | "BEST_QUALITY";
    preferByok?: boolean;
  },
) {
  await requireOrgPermission(userId, organizationId, "settings:write");
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: organizationId }, include: { plan: true } });
  const maxRetention = org.plan?.logRetentionDays ?? 30;
  if (input.logRetentionDays !== undefined && (input.logRetentionDays < 0 || input.logRetentionDays > maxRetention)) {
    throw new ValidationError(`Retention must be between 0 and ${maxRetention} days on your plan.`);
  }
  const zero = input.zeroRetention ?? org.zeroRetention;
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: {
      name: input.name?.trim() || undefined,
      zeroRetention: input.zeroRetention,
      // Zero-retention forces payload logging off.
      promptLogging: zero ? false : input.promptLogging,
      responseLogging: zero ? false : input.responseLogging,
      logRetentionDays: input.logRetentionDays,
      routingPolicy: input.routingPolicy,
      preferByok: input.preferByok,
    },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "organization.settings_updated", targetType: "organization", targetId: organizationId, metadata: input });
  return updated;
}
