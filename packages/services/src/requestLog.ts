import { Prisma, prisma } from "@inrent/db";
import { chargeUsage, type LedgerResult } from "./billing";

/**
 * A completed gateway request: everything needed to write the request log and charge the
 * ledger atomically. Serializable (bigints as strings) so it can be retried via the queue.
 */
export interface RequestRecord {
  requestId: string;
  traceId: string | null;
  organizationId: string;
  projectId: string;
  apiKeyId: string | null;
  userId: string | null;
  source: string;
  endpoint: string;
  modelRequested: string;
  modelSlug: string | null;
  providerSlug: string | null;
  modelProviderId: string | null;
  providerModelId: string | null;
  billingMode: "PLATFORM" | "BYOK";
  status: "SUCCESS" | "ERROR" | "CANCELLED";
  httpStatus: number;
  errorType: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  stream: boolean;
  finishReason: string | null;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  units: number;
  usageEstimated: boolean;
  providerCostNano: string;
  userChargeNano: string;
  marginNano: string;
  latencyMs: number | null;
  ttftMs: number | null;
  providerLatencyMs: number | null;
  fallbackCount: number;
  routing: Prisma.InputJsonValue | null;
  promptPayload: Prisma.InputJsonValue | null;
  responsePayload: Prisma.InputJsonValue | null;
  ipHash: string | null;
  userAgent: string | null;
  isDemo: boolean;
  createdAt: string;
}

export interface PersistResult {
  duplicate: boolean;
  ledger: LedgerResult | null;
}

/** Writes the request log and charges usage in one transaction. Idempotent on requestId. */
export async function persistRequestRecord(r: RequestRecord): Promise<PersistResult> {
  const charge = BigInt(r.userChargeNano);
  try {
    const ledger = await prisma.$transaction(async (tx) => {
      await tx.request.create({
        data: {
          requestId: r.requestId,
          traceId: r.traceId,
          organizationId: r.organizationId,
          projectId: r.projectId,
          apiKeyId: r.apiKeyId,
          userId: r.userId,
          source: r.source,
          endpoint: r.endpoint,
          modelRequested: r.modelRequested,
          modelSlug: r.modelSlug,
          providerSlug: r.providerSlug,
          modelProviderId: r.modelProviderId,
          providerModelId: r.providerModelId,
          billingMode: r.billingMode,
          status: r.status,
          httpStatus: r.httpStatus,
          errorType: r.errorType,
          errorCode: r.errorCode,
          errorMessage: r.errorMessage?.slice(0, 500) ?? null,
          stream: r.stream,
          finishReason: r.finishReason,
          inputTokens: r.inputTokens,
          outputTokens: r.outputTokens,
          cachedTokens: r.cachedTokens,
          reasoningTokens: r.reasoningTokens,
          totalTokens: r.inputTokens + r.outputTokens,
          units: r.units,
          usageEstimated: r.usageEstimated,
          providerCostNano: BigInt(r.providerCostNano),
          userChargeNano: charge,
          marginNano: BigInt(r.marginNano),
          latencyMs: r.latencyMs,
          ttftMs: r.ttftMs,
          providerLatencyMs: r.providerLatencyMs,
          fallbackCount: r.fallbackCount,
          routing: r.routing ?? Prisma.DbNull,
          promptPayload: r.promptPayload ?? Prisma.DbNull,
          responsePayload: r.responsePayload ?? Prisma.DbNull,
          ipHash: r.ipHash,
          userAgent: r.userAgent?.slice(0, 256) ?? null,
          isDemo: r.isDemo,
          createdAt: new Date(r.createdAt),
        },
      });
      if (charge <= 0n) return null;
      return chargeUsage(
        {
          organizationId: r.organizationId,
          projectId: r.projectId,
          apiKeyId: r.apiKeyId,
          requestId: r.requestId,
          amountNano: charge,
          description: `${r.endpoint} · ${r.modelSlug ?? r.modelRequested}${r.providerSlug ? ` via ${r.providerSlug}` : ""}`,
          metadata: { input_tokens: r.inputTokens, output_tokens: r.outputTokens, estimated: r.usageEstimated },
        },
        tx,
      );
    });
    if (r.apiKeyId) {
      // Best-effort "last used" stamp; never blocks billing.
      const at = new Date(r.createdAt);
      await prisma.apiKey
        .updateMany({ where: { id: r.apiKeyId, OR: [{ lastUsedAt: null }, { lastUsedAt: { lt: new Date(at.getTime() - 60_000) } }] }, data: { lastUsedAt: at } })
        .catch(() => undefined);
    }
    return { duplicate: false, ledger };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { duplicate: true, ledger: null };
    throw e;
  }
}
