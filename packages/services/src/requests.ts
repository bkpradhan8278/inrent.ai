import { prisma, type Prisma } from "@inrent/db";

export interface RequestFilters {
  projectId?: string;
  apiKeyId?: string;
  model?: string;
  provider?: string;
  status?: "SUCCESS" | "ERROR" | "CANCELLED";
  from?: Date;
  to?: Date;
  search?: string;
}

const listSelect = {
  id: true,
  requestId: true,
  createdAt: true,
  endpoint: true,
  modelRequested: true,
  modelSlug: true,
  providerSlug: true,
  status: true,
  httpStatus: true,
  errorCode: true,
  stream: true,
  inputTokens: true,
  outputTokens: true,
  totalTokens: true,
  userChargeNano: true,
  latencyMs: true,
  ttftMs: true,
  fallbackCount: true,
  billingMode: true,
  source: true,
  isDemo: true,
  apiKey: { select: { id: true, name: true, displayPrefix: true } },
  project: { select: { id: true, name: true } },
} satisfies Prisma.RequestSelect;

function where(organizationId: string, f: RequestFilters): Prisma.RequestWhereInput {
  return {
    organizationId,
    ...(f.projectId ? { projectId: f.projectId } : {}),
    ...(f.apiKeyId ? { apiKeyId: f.apiKeyId } : {}),
    ...(f.model ? { modelSlug: f.model } : {}),
    ...(f.provider ? { providerSlug: f.provider } : {}),
    ...(f.status ? { status: f.status } : {}),
    ...(f.from || f.to ? { createdAt: { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) } } : {}),
    ...(f.search ? { requestId: { startsWith: f.search.trim() } } : {}),
  };
}

/** Lists requests scoped to one organization (keyset pagination by createdAt/id). */
export async function listRequests(organizationId: string, filters: RequestFilters = {}, opts: { cursor?: string; limit?: number } = {}) {
  const take = Math.min(opts.limit ?? 50, 200);
  const rows = await prisma.request.findMany({
    where: where(organizationId, filters),
    select: listSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > take;
  const items = hasMore ? rows.slice(0, take) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]?.id ?? null : null };
}

/** Request detail. Payloads are only returned when the caller is allowed to see them. */
export async function getRequestDetail(organizationId: string, requestId: string, opts: { includePayloads: boolean }) {
  const r = await prisma.request.findFirst({
    where: { organizationId, OR: [{ requestId }, ...(/^[0-9a-f-]{36}$/i.test(requestId) ? [{ id: requestId }] : [])] },
    include: { apiKey: { select: { id: true, name: true, displayPrefix: true, lastFour: true } }, project: { select: { id: true, name: true } } },
  });
  if (!r) return null;
  if (!opts.includePayloads) return { ...r, promptPayload: null, responsePayload: null, payloadsHidden: Boolean(r.promptPayload || r.responsePayload) };
  return { ...r, payloadsHidden: false };
}

export async function exportRequests(organizationId: string, filters: RequestFilters, limit = 50_000) {
  return prisma.request.findMany({ where: where(organizationId, filters), select: listSelect, orderBy: { createdAt: "desc" }, take: limit });
}

/**
 * Retention enforcement (worker job):
 * - prompt/response payloads are scrubbed once older than the org's retention, or immediately under zero-retention;
 * - request metadata rows are deleted after the retention window, but kept at least 2 days so the daily
 *   usage rollup always runs first (billing history lives in the ledger and UsageDaily).
 */
export async function purgeExpiredRequests(): Promise<{ deleted: number; scrubbed: number }> {
  const scrubbed = await prisma.$executeRaw`
    UPDATE "Request" r SET "promptPayload" = NULL, "responsePayload" = NULL
    FROM "Organization" o
    WHERE r."organizationId" = o.id
      AND (r."promptPayload" IS NOT NULL OR r."responsePayload" IS NOT NULL)
      AND (o."zeroRetention" OR r."createdAt" < now() - make_interval(days => greatest(o."logRetentionDays", 0)))`;
  const deleted = await prisma.$executeRaw`
    DELETE FROM "Request" r USING "Organization" o
    WHERE r."organizationId" = o.id AND NOT r."isDemo"
      AND r."createdAt" < now() - make_interval(days => greatest(o."logRetentionDays", 2))`;
  return { deleted, scrubbed };
}
