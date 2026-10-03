import { prisma, type McpServerKind, type McpTransport, type PermissionLevel } from "@inrent/db";
import { assertPublicUrl, UnsafeUrlError } from "@inrent/core/server";
import { recordAudit } from "./audit";
import { requireOrgPermission } from "./authz";
import { getServerEnv } from "./env";
import { NotFoundError, ValidationError } from "./errors";
import { isFeatureEnabled } from "./flags";
import { aad, encrypt } from "./secrets";

/**
 * MCP server registry (preview). Stores server definitions and per-tool permissions with
 * least-privilege defaults: tools are disabled until explicitly approved, write/admin tools
 * require an org admin, and a server's max permission caps every tool on it.
 * Tool execution through the gateway is on the roadmap; this module is the control plane.
 */

const LEVEL: Record<PermissionLevel, number> = { READ: 0, WRITE: 1, ADMIN: 2 };

export const MCP_TEMPLATES: Array<{ kind: McpServerKind; name: string; description: string; transport: McpTransport; defaultPermission: PermissionLevel }> = [
  { kind: "GITHUB", name: "GitHub", description: "Repositories, issues and pull requests.", transport: "STREAMABLE_HTTP", defaultPermission: "READ" },
  { kind: "SLACK", name: "Slack", description: "Channels and messages.", transport: "STREAMABLE_HTTP", defaultPermission: "READ" },
  { kind: "NOTION", name: "Notion", description: "Pages and databases.", transport: "STREAMABLE_HTTP", defaultPermission: "READ" },
  { kind: "GOOGLE_DRIVE", name: "Google Drive", description: "Files and documents.", transport: "STREAMABLE_HTTP", defaultPermission: "READ" },
  { kind: "POSTGRES", name: "Postgres", description: "Read-only SQL over a database you control.", transport: "STREAMABLE_HTTP", defaultPermission: "READ" },
  { kind: "FILESYSTEM", name: "Filesystem", description: "Files on a host you operate (self-hosted connector).", transport: "STDIO", defaultPermission: "READ" },
  { kind: "CUSTOM", name: "Custom MCP server", description: "Any MCP server reachable over HTTPS.", transport: "STREAMABLE_HTTP", defaultPermission: "READ" },
];

async function ensureEnabled(organizationId: string) {
  if (!(await isFeatureEnabled("MCP_ENABLED", organizationId))) throw new ValidationError("MCP is not enabled for this organization.");
}

export async function createMcpServer(
  userId: string,
  organizationId: string,
  input: { name: string; kind: McpServerKind; transport: McpTransport; url?: string; authToken?: string; maxPermission?: PermissionLevel },
) {
  const ctx = await requireOrgPermission(userId, organizationId, "mcp:write");
  await ensureEnabled(organizationId);
  const name = input.name.trim();
  if (name.length < 1 || name.length > 64) throw new ValidationError("Name must be 1–64 characters.");
  const maxPermission = input.maxPermission ?? "READ";
  if (maxPermission !== "READ" && ctx.role !== "OWNER" && ctx.role !== "ADMIN") throw new ValidationError("Only admins can allow write or admin access.");
  if (input.transport === "STDIO") {
    if (input.url) throw new ValidationError("STDIO servers run on infrastructure you operate and have no URL.");
  } else {
    if (!input.url) throw new ValidationError("A server URL is required.");
    const env = getServerEnv();
    try {
      await assertPublicUrl(input.url, { allowHttp: env.runtime === "development", allowPrivateNetwork: false });
    } catch (e) {
      throw new ValidationError(e instanceof UnsafeUrlError ? `Server URL rejected: ${e.message}.` : "Server URL is not valid.");
    }
  }
  const server = await prisma.mcpServer.create({
    data: { organizationId, name, kind: input.kind, transport: input.transport, url: input.url ?? null, maxPermission, createdById: userId },
  });
  if (input.authToken) {
    await prisma.mcpServer.update({ where: { id: server.id }, data: { authEncrypted: encrypt(input.authToken, aad.mcp(organizationId, server.id)) } });
  }
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "mcp.server_created", targetType: "mcp_server", targetId: server.id, metadata: { kind: input.kind, maxPermission } });
  return prisma.mcpServer.findUniqueOrThrow({ where: { id: server.id }, select: mcpServerSelect });
}

export const mcpServerSelect = {
  id: true,
  name: true,
  kind: true,
  transport: true,
  url: true,
  maxPermission: true,
  requireApprovalForWrite: true,
  enabled: true,
  createdAt: true,
  tools: { select: { id: true, name: true, description: true, permission: true, destructive: true, enabled: true, approvedAt: true } },
} as const;

export async function listMcpServers(organizationId: string) {
  return prisma.mcpServer.findMany({ where: { organizationId, deletedAt: null }, select: mcpServerSelect, orderBy: { createdAt: "desc" } });
}

async function findServer(organizationId: string, serverId: string) {
  const s = await prisma.mcpServer.findFirst({ where: { id: serverId, organizationId, deletedAt: null } });
  if (!s) throw new NotFoundError("MCP server");
  return s;
}

export async function setMcpServerEnabled(userId: string, organizationId: string, serverId: string, enabled: boolean) {
  await requireOrgPermission(userId, organizationId, "mcp:write");
  const s = await findServer(organizationId, serverId);
  await prisma.mcpServer.update({ where: { id: s.id }, data: { enabled } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: enabled ? "mcp.server_enabled" : "mcp.server_disabled", targetType: "mcp_server", targetId: s.id });
}

export async function deleteMcpServer(userId: string, organizationId: string, serverId: string) {
  await requireOrgPermission(userId, organizationId, "mcp:write");
  const s = await findServer(organizationId, serverId);
  await prisma.mcpServer.update({ where: { id: s.id }, data: { deletedAt: new Date(), enabled: false, authEncrypted: null } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "mcp.server_deleted", targetType: "mcp_server", targetId: s.id });
}

/** Registers a tool (disabled). Tools are never auto-enabled. */
export async function registerMcpTool(userId: string, organizationId: string, serverId: string, input: { name: string; description?: string; permission: PermissionLevel; destructive?: boolean }) {
  await requireOrgPermission(userId, organizationId, "mcp:write");
  const s = await findServer(organizationId, serverId);
  if (!/^[A-Za-z0-9_.-]{1,64}$/.test(input.name)) throw new ValidationError("Tool names may contain letters, digits, '.', '_' and '-'.");
  if (LEVEL[input.permission] > LEVEL[s.maxPermission]) throw new ValidationError(`This server only allows ${s.maxPermission.toLowerCase()} tools.`);
  const tool = await prisma.mcpTool.create({
    data: { serverId: s.id, name: input.name, description: input.description?.slice(0, 500), permission: input.permission, destructive: input.destructive ?? input.permission !== "READ", enabled: false },
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "mcp.tool_registered", targetType: "mcp_tool", targetId: tool.id, metadata: { permission: input.permission } });
  return tool;
}

/** Explicit approval. Write/admin/destructive tools require an organization owner or admin. */
export async function setMcpToolApproval(userId: string, organizationId: string, toolId: string, enabled: boolean) {
  const ctx = await requireOrgPermission(userId, organizationId, "mcp:write");
  const tool = await prisma.mcpTool.findFirst({ where: { id: toolId, server: { organizationId, deletedAt: null } }, include: { server: true } });
  if (!tool) throw new NotFoundError("Tool");
  if (enabled && (tool.permission !== "READ" || tool.destructive) && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
    throw new ValidationError("Only owners and admins can approve write, admin or destructive tools.");
  }
  await prisma.mcpTool.update({ where: { id: tool.id }, data: { enabled, approvedById: enabled ? userId : null, approvedAt: enabled ? new Date() : null } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: enabled ? "mcp.tool_approved" : "mcp.tool_revoked", targetType: "mcp_tool", targetId: tool.id, metadata: { permission: tool.permission, destructive: tool.destructive } });
}
