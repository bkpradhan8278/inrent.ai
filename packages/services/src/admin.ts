import { Prisma, prisma, type HealthStatus, type IntegrationMode, type ModelStatus, type PlatformRole, type VerificationStatus } from "@inrent/db";
import { parseDecimalScaled } from "@inrent/core";
import { invalidateOrganizationKeyCache } from "./apiKeys";
import { recordAudit } from "./audit";
import { requireAdminPermission } from "./authz";
import { NotFoundError, ValidationError } from "./errors";
import { emitWebhookEvent } from "./webhooks";

/**
 * Admin console operations. Every mutation checks a platform permission and writes an
 * audit record with before/after values.
 */

const CREDENTIAL_REF = /^(env|vault|aws-sm|gcp-sm):[A-Za-z0-9_./#:-]{1,200}$/;

function diff(before: Record<string, unknown>, input: Record<string, unknown>) {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const [k, v] of Object.entries(input)) {
    if (v === undefined) continue;
    const from = before[k];
    const norm = (x: unknown) => (x instanceof Prisma.Decimal ? x.toString() : x instanceof Date ? x.toISOString() : x);
    if (JSON.stringify(norm(from)) !== JSON.stringify(norm(v))) changes[k] = { from: norm(from), to: norm(v) };
  }
  return changes;
}

export async function updateProvider(
  adminId: string,
  providerId: string,
  input: {
    enabled?: boolean;
    priority?: number;
    integrationMode?: IntegrationMode;
    resaleVerified?: boolean;
    termsUrl?: string | null;
    termsNotes?: string | null;
    baseUrl?: string;
    credentialRef?: string | null;
    costMultiplier?: string;
    rpmLimit?: number | null;
    byokSupported?: boolean;
    healthStatus?: HealthStatus;
  },
) {
  await requireAdminPermission(adminId, "providers:write");
  const before = await prisma.provider.findUnique({ where: { id: providerId } });
  if (!before) throw new NotFoundError("Provider");
  if (input.credentialRef && !CREDENTIAL_REF.test(input.credentialRef)) {
    throw new ValidationError("Credential reference must look like env:NAME, vault:path, aws-sm:name or gcp-sm:name. Never paste the secret itself.");
  }
  if (input.baseUrl) {
    try {
      const u = new URL(input.baseUrl);
      if (!["https:", "http:", "mock:"].includes(u.protocol)) throw new Error();
    } catch {
      throw new ValidationError("Base URL must be a valid http(s) URL.");
    }
  }
  if (input.costMultiplier !== undefined) {
    const m = parseDecimalScaled(input.costMultiplier, 4);
    if (m <= 0n || m > 100_000n) throw new ValidationError("Cost multiplier must be between 0 and 10.");
  }
  const mode = input.integrationMode ?? before.integrationMode;
  const resale = input.resaleVerified ?? before.resaleVerified;
  if (resale && (mode === "DIRECT_RESALE" || mode === "AUTHORIZED_RESELLER") && !(input.termsUrl ?? before.termsUrl)) {
    throw new ValidationError("Record the terms or agreement reference (terms URL) before marking resale as verified.");
  }
  const data = {
    ...input,
    costMultiplier: input.costMultiplier !== undefined ? new Prisma.Decimal(input.costMultiplier) : undefined,
    termsReviewedAt: input.resaleVerified ? new Date() : undefined,
  };
  const updated = await prisma.provider.update({ where: { id: providerId }, data });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "provider.updated", targetType: "provider", targetId: providerId, metadata: diff(before, input) as Prisma.InputJsonValue });
  return updated;
}

export async function updateModel(
  adminId: string,
  modelId: string,
  input: {
    status?: ModelStatus;
    verificationStatus?: VerificationStatus;
    verificationNotes?: string | null;
    license?: string | null;
    licenseUrl?: string | null;
    weightsLicense?: string | null;
    commercialUse?: boolean | null;
    resaleAllowed?: boolean | null;
    contextLength?: number | null;
    maxOutputTokens?: number | null;
    featured?: boolean;
    isPublic?: boolean;
    description?: string;
    qualityTier?: number;
  },
) {
  await requireAdminPermission(adminId, "models:write");
  const before = await prisma.model.findUnique({ where: { id: modelId } });
  if (!before) throw new NotFoundError("Model");
  if (input.verificationStatus === "VERIFIED") {
    const license = input.license ?? before.license;
    const commercial = input.commercialUse === undefined ? before.commercialUse : input.commercialUse;
    if (!license || commercial === null) {
      throw new ValidationError("Record the license and whether commercial use is permitted before marking a model verified.");
    }
  }
  if (input.qualityTier !== undefined && (input.qualityTier < 1 || input.qualityTier > 5)) throw new ValidationError("Quality tier must be 1–5.");
  const updated = await prisma.model.update({
    where: { id: modelId },
    data: { ...input, lastVerifiedAt: input.verificationStatus === "VERIFIED" ? new Date() : undefined },
  });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "model.updated", targetType: "model", targetId: modelId, metadata: diff(before, input) as Prisma.InputJsonValue });
  if (input.status || input.verificationStatus) await broadcastModelUpdated(updated.slug, { status: updated.status });
  return updated;
}

export async function updateEndpoint(
  adminId: string,
  endpointId: string,
  input: {
    enabled?: boolean;
    priority?: number;
    providerModelId?: string;
    contextLength?: number | null;
    maxOutputTokens?: number | null;
    supportsTools?: boolean;
    supportsStreaming?: boolean;
    supportsJsonMode?: boolean;
    supportsStructuredOutput?: boolean;
    supportsVision?: boolean;
    healthStatus?: HealthStatus;
  },
) {
  await requireAdminPermission(adminId, "models:write");
  const before = await prisma.modelProvider.findUnique({ where: { id: endpointId } });
  if (!before) throw new NotFoundError("Endpoint");
  const updated = await prisma.modelProvider.update({ where: { id: endpointId }, data: input });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "endpoint.updated", targetType: "model_provider", targetId: endpointId, metadata: diff(before, input) as Prisma.InputJsonValue });
  return updated;
}

export interface PriceInput {
  inputPerMTok?: string | null;
  outputPerMTok?: string | null;
  cachedInputPerMTok?: string | null;
  reasoningPerMTok?: string | null;
  perImage?: string | null;
  perRequest?: string | null;
  platformMarkupPct: string;
  pricingSource: string;
}

function checkPrice(name: string, v: string | null | undefined) {
  if (v === null || v === undefined || v === "") return null;
  try {
    if (parseDecimalScaled(v, 6) < 0n) throw new Error();
  } catch {
    throw new ValidationError(`${name} must be a non-negative number with at most 6 decimals.`);
  }
  return new Prisma.Decimal(v);
}

/** Creates a new active price version for an endpoint (previous version is closed, never edited). */
export async function setEndpointPrice(adminId: string, endpointId: string, input: PriceInput) {
  await requireAdminPermission(adminId, "pricing:write");
  const endpoint = await prisma.modelProvider.findUnique({ where: { id: endpointId }, include: { model: true, prices: { where: { active: true } } } });
  if (!endpoint) throw new NotFoundError("Endpoint");
  const markup = parseDecimalScaled(input.platformMarkupPct, 3);
  if (markup < 0n || markup > 100_000n) throw new ValidationError("Markup must be between 0% and 100%.");
  if (input.pricingSource.trim().length < 4) throw new ValidationError("Record where the price comes from (URL or contract reference).");
  const data = {
    inputPerMTok: checkPrice("Input price", input.inputPerMTok),
    outputPerMTok: checkPrice("Output price", input.outputPerMTok),
    cachedInputPerMTok: checkPrice("Cached input price", input.cachedInputPerMTok),
    reasoningPerMTok: checkPrice("Reasoning price", input.reasoningPerMTok),
    perImage: checkPrice("Per-image price", input.perImage),
    perRequest: checkPrice("Per-request price", input.perRequest),
  };
  if (Object.values(data).every((v) => v === null)) throw new ValidationError("Enter at least one price.");
  const now = new Date();
  const created = await prisma.$transaction(async (tx) => {
    await tx.modelPrice.updateMany({ where: { modelProviderId: endpointId, active: true }, data: { active: false, effectiveTo: now } });
    return tx.modelPrice.create({
      data: {
        modelProviderId: endpointId,
        ...data,
        platformMarkupPct: new Prisma.Decimal(input.platformMarkupPct),
        pricingSource: input.pricingSource.trim(),
        lastVerifiedAt: now,
        effectiveFrom: now,
        active: true,
        createdById: adminId,
      },
    });
  });
  const previous = endpoint.prices[0];
  await recordAudit({
    actorType: "ADMIN",
    actorId: adminId,
    action: "pricing.updated",
    targetType: "model_provider",
    targetId: endpointId,
    metadata: {
      model: endpoint.model.slug,
      from: previous ? { input: previous.inputPerMTok?.toString() ?? null, output: previous.outputPerMTok?.toString() ?? null, markup: previous.platformMarkupPct.toString() } : null,
      to: { input: input.inputPerMTok ?? null, output: input.outputPerMTok ?? null, markup: input.platformMarkupPct },
      source: input.pricingSource,
    },
  });
  await broadcastModelUpdated(endpoint.model.slug, { pricing_changed: true });
  return created;
}

async function broadcastModelUpdated(slug: string, data: Record<string, unknown>) {
  const orgs = await prisma.webhook.findMany({ where: { enabled: true, deletedAt: null, events: { has: "model.updated" } }, select: { organizationId: true }, distinct: ["organizationId"] });
  for (const o of orgs) await emitWebhookEvent(o.organizationId, "model.updated", { model: slug, ...data }).catch(() => undefined);
}

export async function setPlatformRole(adminId: string, userId: string, role: PlatformRole) {
  await requireAdminPermission(adminId, "admin:roles");
  if (adminId === userId) throw new ValidationError("You cannot change your own role.");
  const before = await prisma.user.findUnique({ where: { id: userId } });
  if (!before) throw new NotFoundError("User");
  await prisma.user.update({ where: { id: userId }, data: { platformRole: role } });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "admin.role_changed", targetType: "user", targetId: userId, metadata: { from: before.platformRole, to: role } });
}

export async function setOrganizationSuspended(adminId: string, organizationId: string, suspended: boolean, reason?: string) {
  await requireAdminPermission(adminId, "orgs:write");
  if (suspended && (!reason || reason.trim().length < 3)) throw new ValidationError("A suspension reason is required.");
  await prisma.organization.update({ where: { id: organizationId }, data: { suspendedAt: suspended ? new Date() : null, suspensionReason: suspended ? reason!.trim() : null } });
  // The gateway caches key contexts (including the suspension flag) for a minute; drop them so this applies now.
  await invalidateOrganizationKeyCache(organizationId);
  await recordAudit({ organizationId, actorType: "ADMIN", actorId: adminId, action: suspended ? "organization.suspended" : "organization.unsuspended", targetType: "organization", targetId: organizationId, metadata: { reason } });
}

export async function setOrganizationPlan(adminId: string, organizationId: string, planSlug: string) {
  await requireAdminPermission(adminId, "orgs:write");
  const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
  if (!plan) throw new NotFoundError("Plan");
  await prisma.organization.update({ where: { id: organizationId }, data: { planId: plan.id } });
  await recordAudit({ organizationId, actorType: "ADMIN", actorId: adminId, action: "organization.plan_changed", targetType: "organization", targetId: organizationId, metadata: { plan: planSlug } });
}

export async function updateTicketStatus(adminId: string, ticketId: string, status: "OPEN" | "PENDING" | "RESOLVED" | "CLOSED") {
  await requireAdminPermission(adminId, "tickets:write");
  await prisma.supportTicket.update({ where: { id: ticketId }, data: { status } });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "ticket.status_changed", targetType: "support_ticket", targetId: ticketId, metadata: { status } });
}

export interface FinOpsAlert {
  kind: "provider_spend" | "low_margin" | "usage_spike" | "price_changed";
  severity: "info" | "warning" | "critical";
  message: string;
  subject: string;
}

/** Internal cost controls surfaced in the admin console and by the worker. */
export async function computeFinOpsAlerts(): Promise<FinOpsAlert[]> {
  const alerts: FinOpsAlert[] = [];
  const spendThresholdUsd = Number(process.env.FINOPS_PROVIDER_DAILY_SPEND_ALERT_USD ?? "500");
  const minMarginPct = Number(process.env.FINOPS_MIN_MARGIN_PCT ?? "2");

  const spend = await prisma.$queryRaw<Array<{ provider: string | null; cost: bigint | null }>>`
    SELECT "providerSlug" AS provider, sum("providerCostNano")::bigint AS cost FROM "Request"
    WHERE "createdAt" >= now() - interval '1 day' AND NOT "isDemo" GROUP BY 1`;
  for (const s of spend) {
    const usd = Number(s.cost ?? 0n) / 1e9;
    if (usd > spendThresholdUsd) alerts.push({ kind: "provider_spend", severity: "warning", subject: s.provider ?? "unknown", message: `Provider spend in the last 24h is $${usd.toFixed(2)} (threshold $${spendThresholdUsd}).` });
  }

  const margins = await prisma.$queryRaw<Array<{ model: string | null; revenue: bigint | null; cost: bigint | null }>>`
    SELECT "modelSlug" AS model, sum("userChargeNano")::bigint AS revenue, sum("providerCostNano")::bigint AS cost FROM "Request"
    WHERE "createdAt" >= now() - interval '7 days' AND NOT "isDemo" AND "billingMode" = 'PLATFORM' AND status = 'SUCCESS' GROUP BY 1`;
  for (const m of margins) {
    const revenue = Number(m.revenue ?? 0n);
    if (revenue <= 0) continue;
    const pct = ((revenue - Number(m.cost ?? 0n)) / revenue) * 100;
    if (pct < minMarginPct) alerts.push({ kind: "low_margin", severity: pct < 0 ? "critical" : "warning", subject: m.model ?? "unknown", message: `7-day gross margin is ${pct.toFixed(2)}% (minimum ${minMarginPct}%).` });
  }

  const spikes = await prisma.$queryRaw<Array<{ org: string; today: bigint; avg: number | null }>>`
    WITH daily AS (
      SELECT "organizationId" AS org, date_trunc('day', "createdAt") AS day, count(*) AS n FROM "Request"
      WHERE "createdAt" >= now() - interval '8 days' AND NOT "isDemo" GROUP BY 1, 2)
    SELECT org::text, max(n) FILTER (WHERE day = date_trunc('day', now())) AS today,
           avg(n) FILTER (WHERE day < date_trunc('day', now()))::float AS avg
    FROM daily GROUP BY org`;
  for (const s of spikes) {
    const today = Number(s.today ?? 0n);
    if (s.avg && today > 1000 && today > s.avg * 3) alerts.push({ kind: "usage_spike", severity: "warning", subject: s.org, message: `Requests today (${today}) are ${(today / s.avg).toFixed(1)}× the 7-day average.` });
  }

  const priceChanges = await prisma.modelPrice.findMany({
    where: { createdAt: { gte: new Date(Date.now() - 86_400_000) }, active: true, createdById: { not: null } },
    include: { modelProvider: { include: { model: true, provider: true } } },
  });
  for (const p of priceChanges) {
    alerts.push({ kind: "price_changed", severity: "info", subject: p.modelProvider.model.slug, message: `Price updated for ${p.modelProvider.provider.name} (source: ${p.pricingSource ?? "n/a"}).` });
  }
  return alerts;
}

// ── Incidents (status page) ──────────────────────────────────────────────────

const STATUS_COMPONENTS = ["api", "gateway", "models", "billing", "dashboard", "docs"];

export async function createIncident(adminId: string, input: { title: string; body: string; impact: "NONE" | "MINOR" | "MAJOR" | "CRITICAL"; components: string[] }) {
  await requireAdminPermission(adminId, "incidents:write");
  const title = input.title.trim();
  const body = input.body.trim();
  if (title.length < 4 || title.length > 160) throw new ValidationError("Title must be 4–160 characters.");
  if (body.length < 4 || body.length > 5000) throw new ValidationError("Describe the incident (4–5000 characters).");
  const components = input.components.filter((c) => STATUS_COMPONENTS.includes(c));
  if (!components.length) throw new ValidationError("Choose at least one affected component.");
  const incident = await prisma.incident.create({ data: { title, body, impact: input.impact, components } });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "incident.created", targetType: "incident", targetId: incident.id, metadata: { impact: input.impact, components } });
  return incident;
}

export async function updateIncident(adminId: string, incidentId: string, input: { status: "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED"; body?: string }) {
  await requireAdminPermission(adminId, "incidents:write");
  const before = await prisma.incident.findUnique({ where: { id: incidentId } });
  if (!before) throw new NotFoundError("Incident");
  const update = input.body?.trim() ? `${before.body}\n\n[${new Date().toISOString()}] ${input.status}: ${input.body.trim()}`.slice(-20_000) : undefined;
  await prisma.incident.update({ where: { id: incidentId }, data: { status: input.status, body: update, resolvedAt: input.status === "RESOLVED" ? new Date() : null } });
  await recordAudit({ actorType: "ADMIN", actorId: adminId, action: "incident.updated", targetType: "incident", targetId: incidentId, metadata: { from: before.status, to: input.status } });
}
