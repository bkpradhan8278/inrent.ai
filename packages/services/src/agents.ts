import { prisma, type Prisma } from "@inrent/db";
import { usdToNano } from "@inrent/core";
import { recordAudit } from "./audit";
import { requireOrgPermission, requireProjectInOrg } from "./authz";
import { NotFoundError, ValidationError } from "./errors";

/**
 * Agent definitions (preview). Versions are immutable; editing creates a new version.
 * Execution runtime is on the roadmap — definitions are validated against the catalog and the
 * organization's MCP servers so they are ready to run when the runtime ships.
 */

export interface AgentVersionInput {
  modelSlug: string;
  systemPrompt: string;
  temperature?: number;
  maxSteps?: number;
  budgetUsd?: string | null;
  mcpServerIds?: string[];
  memoryEnabled?: boolean;
  tools?: Prisma.InputJsonValue;
}

async function validateVersion(organizationId: string, input: AgentVersionInput) {
  const model = await prisma.model.findUnique({ where: { slug: input.modelSlug } });
  if (!model || model.status === "DISABLED") throw new ValidationError("Choose a model from the catalog.");
  if (input.systemPrompt.length > 32_000) throw new ValidationError("System prompt is too long (32k characters max).");
  if (input.temperature !== undefined && (input.temperature < 0 || input.temperature > 2)) throw new ValidationError("Temperature must be between 0 and 2.");
  if (input.maxSteps !== undefined && (input.maxSteps < 1 || input.maxSteps > 50)) throw new ValidationError("Max steps must be between 1 and 50.");
  const ids = [...new Set(input.mcpServerIds ?? [])];
  if (ids.length) {
    const owned = await prisma.mcpServer.count({ where: { id: { in: ids }, organizationId, deletedAt: null } });
    if (owned !== ids.length) throw new ValidationError("One or more MCP servers were not found in this organization.");
  }
  return ids;
}

export async function createAgent(userId: string, organizationId: string, input: { name: string; description?: string; projectId?: string | null } & AgentVersionInput) {
  await requireOrgPermission(userId, organizationId, "agents:write");
  const name = input.name.trim();
  if (name.length < 1 || name.length > 64) throw new ValidationError("Name must be 1–64 characters.");
  if (input.projectId) await requireProjectInOrg(input.projectId, organizationId);
  const mcpServerIds = await validateVersion(organizationId, input);
  const agent = await prisma.agent.create({
    data: {
      organizationId,
      projectId: input.projectId ?? null,
      name,
      description: input.description?.slice(0, 500),
      createdById: userId,
      versions: {
        create: {
          version: 1,
          modelSlug: input.modelSlug,
          systemPrompt: input.systemPrompt,
          temperature: input.temperature ?? 0.7,
          maxSteps: input.maxSteps ?? 8,
          budgetNano: input.budgetUsd ? usdToNano(input.budgetUsd) : null,
          mcpServerIds,
          memoryEnabled: input.memoryEnabled ?? false,
          tools: input.tools,
          createdById: userId,
        },
      },
    },
    include: { versions: true },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "agent.created", targetType: "agent", targetId: agent.id });
  return agent;
}

export async function createAgentVersion(userId: string, organizationId: string, agentId: string, input: AgentVersionInput) {
  await requireOrgPermission(userId, organizationId, "agents:write");
  const agent = await prisma.agent.findFirst({ where: { id: agentId, organizationId, deletedAt: null }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!agent) throw new NotFoundError("Agent");
  const mcpServerIds = await validateVersion(organizationId, input);
  const version = await prisma.agentVersion.create({
    data: {
      agentId: agent.id,
      version: (agent.versions[0]?.version ?? 0) + 1,
      modelSlug: input.modelSlug,
      systemPrompt: input.systemPrompt,
      temperature: input.temperature ?? 0.7,
      maxSteps: input.maxSteps ?? 8,
      budgetNano: input.budgetUsd ? usdToNano(input.budgetUsd) : null,
      mcpServerIds,
      memoryEnabled: input.memoryEnabled ?? false,
      tools: input.tools,
      createdById: userId,
    },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "agent.version_created", targetType: "agent", targetId: agent.id, metadata: { version: version.version } });
  return version;
}

export async function listAgents(organizationId: string) {
  return prisma.agent.findMany({
    where: { organizationId, deletedAt: null },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    orderBy: { updatedAt: "desc" },
  });
}

export async function archiveAgent(userId: string, organizationId: string, agentId: string) {
  await requireOrgPermission(userId, organizationId, "agents:write");
  const agent = await prisma.agent.findFirst({ where: { id: agentId, organizationId, deletedAt: null } });
  if (!agent) throw new NotFoundError("Agent");
  await prisma.agent.update({ where: { id: agent.id }, data: { status: "ARCHIVED", deletedAt: new Date() } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "agent.archived", targetType: "agent", targetId: agent.id });
}
