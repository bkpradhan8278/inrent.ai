"use server";

import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { usdToNano, type ApiKeyPermission } from "@inrent/core";
import { hashIp } from "@inrent/core/server";
import { prisma, type KeyEnvironment, type McpServerKind, type McpTransport, type MemberRole, type PaymentProviderType, type PermissionLevel, type Prisma } from "@inrent/db";
import {
  addByokCredential,
  archiveAgent,
  archiveProject,
  createAgent,
  createAgentVersion,
  createApiKey,
  createMcpServer,
  createProject,
  createSupportTicket,
  createTeamOrganization,
  createWebhook,
  deleteApiKey,
  deleteByokCredential,
  deleteMcpServer,
  deleteUserAccount,
  deleteWebhook,
  inviteMember,
  markNotificationsRead,
  registerMcpTool,
  removeMember,
  requireOrgPermission,
  revokeApiKey,
  rotateApiKey,
  rotateByokCredential,
  rotateWebhookSecret,
  sendTestWebhook,
  ServiceError,
  setByokEnabled,
  setMcpServerEnabled,
  setMcpToolApproval,
  testByokCredential,
  updateApiKeyLimits,
  updateMemberRole,
  updateOrganizationSettings,
  updateProject,
  updateSpendControls,
  updateWebhook,
} from "@inrent/services";
import { startCreditPurchase, type CheckoutResult } from "@inrent/services/payments";
import { sendTemplateEmail } from "@inrent/services/email";
import { getWorkspace, ORG_COOKIE, PROJECT_COOKIE } from "@/lib/session";
import { absoluteUrl } from "@/lib/hosts";

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

const COOKIE_OPTS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

async function run<T>(fn: () => Promise<T>, revalidate?: string | string[]): Promise<ActionResult<T>> {
  try {
    const data = await fn();
    for (const p of [revalidate ?? []].flat()) revalidatePath(p);
    return { ok: true, data };
  } catch (e) {
    if (e instanceof ServiceError) return { ok: false, error: e.message };
    if (e instanceof Error && e.name === "PaymentProviderNotConfiguredError") return { ok: false, error: "Payments are not configured in this environment." };
    console.error("[dashboard action]", e);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
}

async function actorMeta() {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  return { ipHash: hashIp(ip, process.env.IP_HASH_SALT ?? "inrent"), userAgent: h.get("user-agent") };
}

const usdOrNull = (v: string | null | undefined) => (v && v.trim() ? usdToNano(v.trim()) : null);

// ── Workspace selection ──────────────────────────────────────────────────────

export async function switchOrganizationAction(orgId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  if (!ws.memberships.some((m) => m.organizationId === orgId)) return { ok: false, error: "Organization not found." };
  const c = await cookies();
  c.set(ORG_COOKIE, orgId, COOKIE_OPTS);
  c.delete(PROJECT_COOKIE);
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

export async function switchProjectAction(projectId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  if (!ws.projects.some((p) => p.id === projectId)) return { ok: false, error: "Project not found." };
  (await cookies()).set(PROJECT_COOKIE, projectId, COOKIE_OPTS);
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

export async function setEnvironmentAction(env: string): Promise<ActionResult> {
  const value = ["DEVELOPMENT", "STAGING", "PRODUCTION"].includes(env) ? env : "all";
  (await cookies()).set("inrent_env", value, COOKIE_OPTS);
  revalidatePath("/dashboard", "layout");
  return { ok: true, data: undefined };
}

export async function createOrganizationAction(name: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    const org = await createTeamOrganization(ws.user.id, name);
    (await cookies()).set(ORG_COOKIE, org.id, COOKIE_OPTS);
    (await cookies()).delete(PROJECT_COOKIE);
  }, "/dashboard");
}

export async function markNotificationsReadAction(): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => markNotificationsRead(ws.user.id, ws.org.id));
}

// ── API keys ─────────────────────────────────────────────────────────────────

export interface KeyFormInput {
  name: string;
  projectId: string;
  environment: KeyEnvironment;
  permissions: ApiKeyPermission[];
  allowedModels: string;
  spendLimitUsd: string;
  rpmLimit: string;
  tpmLimit: string;
  expiresAt: string;
}

function parseKeyForm(input: KeyFormInput) {
  return {
    name: input.name,
    allowedModels: input.allowedModels.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    spendLimitNano: usdOrNull(input.spendLimitUsd),
    rpmLimit: input.rpmLimit ? Number(input.rpmLimit) : null,
    tpmLimit: input.tpmLimit ? Number(input.tpmLimit) : null,
    expiresAt: input.expiresAt ? new Date(`${input.expiresAt}T23:59:59Z`) : null,
  };
}

export async function createApiKeyAction(input: KeyFormInput): Promise<ActionResult<{ secret: string; name: string }>> {
  const ws = await getWorkspace();
  const meta = await actorMeta();
  return run(async () => {
    const parsed = parseKeyForm(input);
    const { record, secret } = await createApiKey(
      { type: "USER", id: ws.user.id, ...meta },
      { organizationId: ws.org.id, projectId: input.projectId, environment: input.environment, permissions: input.permissions, ...parsed },
    );
    return { secret, name: record.name };
  }, ["/dashboard/keys", "/dashboard"]);
}

export async function updateApiKeyAction(keyId: string, input: Omit<KeyFormInput, "projectId" | "environment" | "permissions">): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await updateApiKeyLimits({ type: "USER", id: ws.user.id }, ws.org.id, keyId, parseKeyForm({ ...input, projectId: "", environment: "DEVELOPMENT", permissions: [] }));
  }, "/dashboard/keys");
}

export async function revokeApiKeyAction(keyId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => revokeApiKey({ type: "USER", id: ws.user.id }, ws.org.id, keyId), "/dashboard/keys");
}

export async function rotateApiKeyAction(keyId: string): Promise<ActionResult<{ secret: string; name: string }>> {
  const ws = await getWorkspace();
  return run(async () => {
    const r = await rotateApiKey({ type: "USER", id: ws.user.id }, ws.org.id, keyId);
    return { secret: r.secret, name: r.record.name };
  }, "/dashboard/keys");
}

export async function deleteApiKeyAction(keyId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => deleteApiKey({ type: "USER", id: ws.user.id }, ws.org.id, keyId), "/dashboard/keys");
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function createProjectAction(input: { name: string; description: string; budgetUsd: string }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await createProject(ws.user.id, ws.org.id, { name: input.name, description: input.description, monthlyBudgetNano: usdOrNull(input.budgetUsd) });
  }, "/dashboard/projects");
}

export async function updateProjectAction(projectId: string, input: { name: string; description: string; budgetUsd: string; allowedModels: string }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await updateProject(ws.user.id, ws.org.id, projectId, {
      name: input.name,
      description: input.description || null,
      monthlyBudgetNano: usdOrNull(input.budgetUsd),
      allowedModels: input.allowedModels.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean),
    });
  }, "/dashboard/projects");
}

export async function archiveProjectAction(projectId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => archiveProject(ws.user.id, ws.org.id, projectId), "/dashboard/projects");
}

// ── Billing ──────────────────────────────────────────────────────────────────

export async function startCheckoutAction(amountUsd: number, provider: PaymentProviderType = "STRIPE"): Promise<ActionResult<CheckoutResult>> {
  const ws = await getWorkspace();
  return run(async () => {
    const r = await startCreditPurchase(ws.user.id, ws.org.id, { amountCents: Math.round(amountUsd * 100), provider });
    return r.checkout;
  });
}

export async function updateSpendControlsAction(input: { monthlyCapUsd: string; lowBalanceUsd: string; autoRecharge: boolean; thresholdUsd: string; amountUsd: string }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await updateSpendControls(ws.user.id, ws.org.id, {
      monthlySpendCapNano: usdOrNull(input.monthlyCapUsd),
      lowBalanceThresholdNano: usdOrNull(input.lowBalanceUsd),
      autoRechargeEnabled: input.autoRecharge,
      autoRechargeThresholdNano: usdOrNull(input.thresholdUsd),
      autoRechargeAmountNano: usdOrNull(input.amountUsd),
    });
  }, ["/dashboard/billing", "/dashboard/limits"]);
}

// ── Team ─────────────────────────────────────────────────────────────────────

export async function inviteMemberAction(email: string, role: MemberRole): Promise<ActionResult<{ link: string }>> {
  const ws = await getWorkspace();
  return run(async () => {
    const { token } = await inviteMember(ws.user.id, ws.org.id, email, role);
    const link = absoluteUrl(`/invite/${token}`);
    await sendTemplateEmail(email, {
      subject: `You're invited to ${ws.org.name} on INRENT`,
      title: `Join ${ws.org.name}`,
      intro: `${ws.user.name} invited you to join ${ws.org.name} on INRENT as ${role.toLowerCase()}. The invitation expires in 7 days.`,
      action: { label: "Accept invitation", url: link },
    }).catch(() => undefined);
    return { link };
  }, "/dashboard/team");
}

export async function updateMemberRoleAction(userId: string, role: MemberRole): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => updateMemberRole(ws.user.id, ws.org.id, userId, role), "/dashboard/team");
}

export async function removeMemberAction(userId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => removeMember(ws.user.id, ws.org.id, userId), "/dashboard/team");
}

export async function revokeInvitationAction(invitationId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await requireOrgPermission(ws.user.id, ws.org.id, "members:manage");
    await prisma.invitation.updateMany({ where: { id: invitationId, organizationId: ws.org.id, acceptedAt: null }, data: { revokedAt: new Date() } });
  }, "/dashboard/team");
}

// ── BYOK ─────────────────────────────────────────────────────────────────────

export async function addByokAction(input: { providerId: string; label: string; apiKey: string }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await addByokCredential(ws.user.id, ws.org.id, input);
  }, "/dashboard/byok");
}

export async function testByokAction(id: string): Promise<ActionResult<{ ok: boolean; latencyMs: number; error: string | null }>> {
  const ws = await getWorkspace();
  return run(() => testByokCredential(ws.user.id, ws.org.id, id), "/dashboard/byok");
}

export async function toggleByokAction(id: string, enabled: boolean): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => setByokEnabled(ws.user.id, ws.org.id, id, enabled), "/dashboard/byok");
}

export async function rotateByokAction(id: string, apiKey: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => rotateByokCredential(ws.user.id, ws.org.id, id, apiKey), "/dashboard/byok");
}

export async function deleteByokAction(id: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => deleteByokCredential(ws.user.id, ws.org.id, id), "/dashboard/byok");
}

// ── Webhooks ─────────────────────────────────────────────────────────────────

export async function createWebhookAction(input: { url: string; events: string[]; description: string }): Promise<ActionResult<{ secret: string }>> {
  const ws = await getWorkspace();
  return run(async () => {
    const { secret } = await createWebhook(ws.user.id, ws.org.id, input);
    return { secret };
  }, "/dashboard/webhooks");
}

export async function updateWebhookAction(id: string, input: { url?: string; events?: string[]; enabled?: boolean }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await updateWebhook(ws.user.id, ws.org.id, id, input);
  }, "/dashboard/webhooks");
}

export async function rotateWebhookSecretAction(id: string): Promise<ActionResult<{ secret: string }>> {
  const ws = await getWorkspace();
  return run(async () => ({ secret: await rotateWebhookSecret(ws.user.id, ws.org.id, id) }), "/dashboard/webhooks");
}

export async function deleteWebhookAction(id: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => deleteWebhook(ws.user.id, ws.org.id, id), "/dashboard/webhooks");
}

export async function testWebhookAction(id: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await sendTestWebhook(ws.user.id, ws.org.id, id);
  }, "/dashboard/webhooks");
}

// ── MCP ──────────────────────────────────────────────────────────────────────

export async function createMcpServerAction(input: { name: string; kind: McpServerKind; transport: McpTransport; url: string; authToken: string; maxPermission: PermissionLevel }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await createMcpServer(ws.user.id, ws.org.id, { ...input, url: input.url || undefined, authToken: input.authToken || undefined });
  }, "/dashboard/mcp");
}

export async function toggleMcpServerAction(id: string, enabled: boolean): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => setMcpServerEnabled(ws.user.id, ws.org.id, id, enabled), "/dashboard/mcp");
}

export async function deleteMcpServerAction(id: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => deleteMcpServer(ws.user.id, ws.org.id, id), "/dashboard/mcp");
}

export async function registerMcpToolAction(serverId: string, input: { name: string; description: string; permission: PermissionLevel; destructive: boolean }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await registerMcpTool(ws.user.id, ws.org.id, serverId, input);
  }, "/dashboard/mcp");
}

export async function approveMcpToolAction(toolId: string, enabled: boolean): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => setMcpToolApproval(ws.user.id, ws.org.id, toolId, enabled), "/dashboard/mcp");
}

// ── Agents ───────────────────────────────────────────────────────────────────

export async function createAgentAction(input: { name: string; description: string; modelSlug: string; systemPrompt: string; temperature: number; maxSteps: number; budgetUsd: string; mcpServerIds: string[] }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await createAgent(ws.user.id, ws.org.id, { ...input, budgetUsd: input.budgetUsd || null, projectId: ws.project.id });
  }, "/dashboard/agents");
}

export async function createAgentVersionAction(agentId: string, input: { modelSlug: string; systemPrompt: string; temperature: number; maxSteps: number; budgetUsd: string; mcpServerIds: string[] }): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await createAgentVersion(ws.user.id, ws.org.id, agentId, { ...input, budgetUsd: input.budgetUsd || null });
  }, "/dashboard/agents");
}

export async function archiveAgentAction(agentId: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(() => archiveAgent(ws.user.id, ws.org.id, agentId), "/dashboard/agents");
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function updateOrgSettingsAction(input: Parameters<typeof updateOrganizationSettings>[2]): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await updateOrganizationSettings(ws.user.id, ws.org.id, input);
  }, "/dashboard/settings");
}

export async function updateProfileAction(name: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    const trimmed = name.trim();
    if (trimmed.length < 1 || trimmed.length > 80) throw new ServiceError("validation_error", "Name must be 1–80 characters.");
    await prisma.user.update({ where: { id: ws.user.id }, data: { name: trimmed } });
  }, "/dashboard/settings");
}

export async function deleteAccountAction(confirmEmail: string): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await deleteUserAccount(ws.user.id, { email: confirmEmail });
    const c = await cookies();
    for (const name of c.getAll().map((x) => x.name)) if (name.startsWith("inrent")) c.delete(name);
  });
}

// ── Playground ───────────────────────────────────────────────────────────────

export async function savePromptAction(name: string, payload: Prisma.InputJsonValue): Promise<ActionResult> {
  const ws = await getWorkspace();
  return run(async () => {
    await requireOrgPermission(ws.user.id, ws.org.id, "playground:use");
    if (JSON.stringify(payload).length > 200_000) throw new ServiceError("validation_error", "This conversation is too large to save.");
    await prisma.savedPrompt.create({ data: { organizationId: ws.org.id, userId: ws.user.id, name: name.slice(0, 80), payload } });
  }, "/dashboard/playground");
}

export async function sharePromptAction(payload: Prisma.InputJsonValue): Promise<ActionResult<{ url: string }>> {
  const ws = await getWorkspace();
  return run(async () => {
    await requireOrgPermission(ws.user.id, ws.org.id, "playground:use");
    if (JSON.stringify(payload).length > 200_000) throw new ServiceError("validation_error", "This conversation is too large to share.");
    const shareToken = randomBytes(18).toString("base64url");
    await prisma.savedPrompt.create({ data: { organizationId: ws.org.id, userId: ws.user.id, name: "Shared request", payload, shareToken } });
    return { url: absoluteUrl(`/dashboard/playground?share=${shareToken}`) };
  });
}

// ── Support ──────────────────────────────────────────────────────────────────

export async function createTicketAction(input: { subject: string; body: string; category: string }): Promise<ActionResult<{ id: string }>> {
  const ws = await getWorkspace();
  return run(async () => {
    const t = await createSupportTicket({ email: ws.user.email, subject: input.subject, body: input.body, category: input.category, userId: ws.user.id, organizationId: ws.org.id });
    return { id: t.id };
  }, "/dashboard/support");
}
