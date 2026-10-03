import { prisma } from "@inrent/db";
import { formatUsd, nanoToUsdString, type WebhookEventType } from "@inrent/core";
import { emitWebhookEvent, notify, type RequestRecord } from "@inrent/services";
import type { GatewayAuth, GatewayDeps } from "./types";

const SUB_TTL_MS = 30_000;
const DEFAULT_LOW_BALANCE_NANO = 1_000_000_000n; // $1.00

/**
 * Post-request side effects that must never slow down or fail the request:
 * customer webhooks (request.completed / request.failed), low-balance alerts and
 * auto-recharge triggering.
 */
export function createAfterRequest(enqueue: GatewayDeps["enqueue"]) {
  const subs = new Map<string, { at: number; events: Set<string> }>();

  async function subscribed(orgId: string, type: WebhookEventType): Promise<boolean> {
    const hit = subs.get(orgId);
    if (hit && Date.now() - hit.at < SUB_TTL_MS) return hit.events.has(type);
    const hooks = await prisma.webhook.findMany({ where: { organizationId: orgId, enabled: true, deletedAt: null }, select: { events: true } });
    const events = new Set(hooks.flatMap((h) => h.events));
    subs.set(orgId, { at: Date.now(), events });
    if (subs.size > 50_000) subs.delete(subs.keys().next().value!);
    return events.has(type);
  }

  return async function afterRequest(record: RequestRecord, auth: GatewayAuth, balanceAfter: bigint | null): Promise<void> {
    const type: WebhookEventType | null = record.status === "SUCCESS" ? "request.completed" : record.status === "ERROR" ? "request.failed" : null;
    if (type && (await subscribed(auth.organizationId, type))) {
      await emitWebhookEvent(
        auth.organizationId,
        type,
        {
          request_id: record.requestId,
          endpoint: record.endpoint,
          model: record.modelSlug ?? record.modelRequested,
          provider: record.providerSlug,
          status: record.status.toLowerCase(),
          http_status: record.httpStatus,
          error_code: record.errorCode,
          input_tokens: record.inputTokens,
          output_tokens: record.outputTokens,
          cost_usd: nanoToUsdString(BigInt(record.userChargeNano), 9),
          latency_ms: record.latencyMs,
        },
        { projectId: auth.projectId },
      );
    }

    const charge = BigInt(record.userChargeNano);
    if (balanceAfter === null || charge <= 0n) return;
    const threshold = auth.lowBalanceThresholdNano ?? DEFAULT_LOW_BALANCE_NANO;
    const before = balanceAfter + charge;
    if (before >= threshold && balanceAfter < threshold) {
      const day = new Date().toISOString().slice(0, 10);
      const created = await notify({
        organizationId: auth.organizationId,
        type: "credit.low",
        title: "Low credit balance",
        body: `Your balance is ${formatUsd(balanceAfter)}. Requests that need credits will fail when it reaches $0.`,
        link: "/dashboard/billing",
        dedupeKey: `credit.low:${auth.organizationId}:${day}`,
      });
      if (created && (await subscribed(auth.organizationId, "credit.low"))) {
        await emitWebhookEvent(auth.organizationId, "credit.low", { balance_usd: nanoToUsdString(balanceAfter, 6), threshold_usd: nanoToUsdString(threshold, 6) });
      }
    }
    if (auth.autoRechargeEnabled) {
      await enqueue("billing", "auto_recharge", { kind: "auto_recharge", organizationId: auth.organizationId });
    }
  };
}
