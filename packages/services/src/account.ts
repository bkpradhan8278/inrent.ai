import { Prisma, prisma } from "@inrent/db";
import { formatUsd, nanoToUsdString } from "@inrent/core";
import { recordAudit } from "./audit";
import { requireOrgPermission } from "./authz";
import { ValidationError } from "./errors";
import { exportRequests } from "./requests";

export type ExportKind = "usage" | "requests" | "billing" | "invoices";
export type ExportFormat = "csv" | "json";

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  // Neutralize spreadsheet formula injection and quote as needed.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(rows: Array<Record<string, unknown>>): string {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]!);
  return [headers.join(","), ...rows.map((r) => headers.map((h) => csvCell(r[h])).join(","))].join("\n") + "\n";
}

/** Builds a user data export scoped to one organization. */
export async function exportOrganizationData(userId: string, organizationId: string, kind: ExportKind, format: ExportFormat) {
  const permission = kind === "billing" || kind === "invoices" ? "billing:read" : kind === "requests" ? "logs:read" : "usage:read";
  await requireOrgPermission(userId, organizationId, permission);
  let rows: Array<Record<string, unknown>> = [];
  if (kind === "requests") {
    rows = (await exportRequests(organizationId, {})).map((r) => ({
      request_id: r.requestId,
      created_at: r.createdAt,
      endpoint: r.endpoint,
      model: r.modelSlug ?? r.modelRequested,
      provider: r.providerSlug,
      status: r.status,
      http_status: r.httpStatus,
      input_tokens: r.inputTokens,
      output_tokens: r.outputTokens,
      cost_usd: nanoToUsdString(r.userChargeNano, 9),
      latency_ms: r.latencyMs,
      api_key: r.apiKey?.displayPrefix ?? "",
      project: r.project.name,
      billing_mode: r.billingMode,
    }));
  } else if (kind === "usage") {
    const usage = await prisma.usageDaily.findMany({ where: { organizationId }, orderBy: { date: "desc" }, take: 50_000 });
    rows = usage.map((u) => ({
      date: u.date.toISOString().slice(0, 10),
      project_id: u.projectId,
      api_key_id: u.apiKeyId,
      model: u.modelSlug,
      provider: u.providerSlug,
      billing_mode: u.billingMode,
      requests: u.requests,
      errors: u.errors,
      input_tokens: u.inputTokens.toString(),
      output_tokens: u.outputTokens.toString(),
      cost_usd: nanoToUsdString(u.userChargeNano, 9),
    }));
  } else if (kind === "billing") {
    const txns = await prisma.creditTransaction.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" }, take: 50_000 });
    rows = txns.map((t) => ({
      id: t.id,
      created_at: t.createdAt,
      type: t.type,
      amount_usd: nanoToUsdString(t.amountNano, 9),
      balance_after_usd: nanoToUsdString(t.balanceAfterNano, 9),
      description: t.description,
      request_id: t.requestId ?? "",
    }));
  } else {
    const invoices = await prisma.invoice.findMany({ where: { organizationId }, orderBy: { createdAt: "desc" } });
    rows = invoices.map((i) => ({ number: i.number, period_start: i.periodStart, period_end: i.periodEnd, amount: (i.amountCents / 100).toFixed(2), currency: i.currency, status: i.status }));
  }
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "data.exported", metadata: { kind, format, rows: rows.length } });
  const filename = `inrent-${kind}-${new Date().toISOString().slice(0, 10)}.${format}`;
  return format === "csv"
    ? { filename, contentType: "text/csv; charset=utf-8", body: toCsv(rows) }
    : { filename, contentType: "application/json", body: JSON.stringify(rows, null, 2) };
}

/**
 * Deletes a user account.
 * - Organizations where the user is the only member are closed: keys revoked, BYOK keys and
 *   webhook/MCP secrets crypto-shredded, logs scheduled for purge.
 * - The user record is anonymized; sessions and login methods are removed.
 * - Financial records (ledger, payments) are retained as required for accounting, linked only
 *   to the closed organization.
 */
export async function deleteUserAccount(userId: string, confirmation: { email: string }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { memberships: { include: { organization: { include: { _count: { select: { memberships: true } } } } } } } });
  if (!user || user.deletedAt) throw new ValidationError("Account not found.");
  if (confirmation.email.trim().toLowerCase() !== user.email.toLowerCase()) throw new ValidationError("Type your email address to confirm.");

  for (const m of user.memberships) {
    if (m.role === "OWNER" && m.organization._count.memberships > 1) {
      const owners = await prisma.membership.count({ where: { organizationId: m.organizationId, role: "OWNER" } });
      if (owners <= 1) throw new ValidationError(`Transfer ownership of "${m.organization.name}" before deleting your account.`);
    }
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    for (const m of user.memberships) {
      if (m.organization._count.memberships === 1) {
        const orgId = m.organizationId;
        await tx.apiKey.updateMany({ where: { organizationId: orgId, revokedAt: null }, data: { revokedAt: now, revokedReason: "account_deleted" } });
        await tx.byokCredential.updateMany({ where: { organizationId: orgId }, data: { deletedAt: now, enabled: false, encryptedKey: "" } });
        await tx.webhook.updateMany({ where: { organizationId: orgId }, data: { deletedAt: now, enabled: false, secretEncrypted: "" } });
        await tx.mcpServer.updateMany({ where: { organizationId: orgId }, data: { deletedAt: now, enabled: false, authEncrypted: null } });
        await tx.request.updateMany({ where: { organizationId: orgId }, data: { promptPayload: Prisma.DbNull, responsePayload: Prisma.DbNull } });
        await tx.organization.update({ where: { id: orgId }, data: { deletedAt: now, logRetentionDays: 0, zeroRetention: true, autoRechargeEnabled: false } });
      }
    }
    await tx.membership.deleteMany({ where: { userId } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.account.deleteMany({ where: { userId } });
    await tx.savedPrompt.deleteMany({ where: { userId } });
    await tx.user.update({
      where: { id: userId },
      data: { email: `deleted-${userId}@deleted.invalid`, name: "Deleted user", image: null, emailVerified: false, phoneNumber: null, phoneNumberVerified: false, deletedAt: now, platformRole: "USER" },
    });
  });
  await recordAudit({ actorType: "USER", actorId: userId, action: "account.deleted", targetType: "user", targetId: userId });
}

export function describeBalance(nano: bigint): string {
  return formatUsd(nano);
}
