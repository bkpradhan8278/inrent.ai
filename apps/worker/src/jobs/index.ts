import { prisma } from "@inrent/db";
import type { Logger } from "@inrent/observability";
import {
  computeFinOpsAlerts,
  deliverWebhook,
  persistRequestRecord,
  purgeExpiredRequests,
  rollupUsageDay,
  type RequestRecord,
} from "@inrent/services";
import { runAutoRecharge } from "@inrent/services/payments";
import { enqueue, QUEUES } from "@inrent/services/queue";
import { getRedis } from "@inrent/services/redis";
import { runProviderHealthChecks } from "./providerHealth";

export async function handleWebhookDelivery(deliveryId: string, logger: Logger): Promise<void> {
  const outcome = await deliverWebhook(deliveryId);
  if (outcome === "retry") {
    const d = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, select: { nextAttemptAt: true, attempts: true } });
    if (d?.nextAttemptAt) {
      await enqueue(QUEUES.webhooks, "deliver", { deliveryId }, { jobId: `${deliveryId}:${d.attempts}`, delay: Math.max(0, d.nextAttemptAt.getTime() - Date.now()), attempts: 1 });
    }
  }
  logger.debug({ deliveryId, outcome }, "webhook delivery");
}

/** Re-queues deliveries that are due (covers queue outages and missed delayed jobs). */
export async function sweepWebhookDeliveries(): Promise<number> {
  const due = await prisma.webhookDelivery.findMany({
    where: { status: "PENDING", nextAttemptAt: { lte: new Date() } },
    select: { id: true, attempts: true },
    take: 500,
    orderBy: { nextAttemptAt: "asc" },
  });
  for (const d of due) {
    await enqueue(QUEUES.webhooks, "deliver", { deliveryId: d.id }, { jobId: `${d.id}:${d.attempts}`, attempts: 1 });
  }
  return due.length;
}

export async function handleUsageFinalize(payload: string): Promise<void> {
  const record = JSON.parse(payload) as RequestRecord;
  await persistRequestRecord(record);
}

export async function runUsageRollup(): Promise<number> {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  return (await rollupUsageDay(yesterday)) + (await rollupUsageDay(now));
}

/** Distributed lock so only one worker charges an organization at a time. */
async function withLock<T>(key: string, ttlSeconds: number, fn: () => Promise<T>): Promise<T | null> {
  const redis = getRedis();
  const token = crypto.randomUUID();
  const acquired = await redis.set(key, token, "EX", ttlSeconds, "NX");
  if (acquired !== "OK") return null;
  try {
    return await fn();
  } finally {
    await redis.eval("if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end", 1, key, token);
  }
}

export async function handleAutoRecharge(organizationId: string, logger: Logger): Promise<void> {
  const result = await withLock(`inrent:lock:auto-recharge:${organizationId}`, 120, () => runAutoRecharge(organizationId));
  if (result) logger.info({ organizationId, result }, "auto-recharge");
}

export async function sweepAutoRecharge(logger: Logger): Promise<void> {
  const orgs = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id::text FROM "Organization" o JOIN "CreditBalance" b ON b."organizationId" = o.id
    WHERE o."autoRechargeEnabled" AND o."deletedAt" IS NULL AND o."suspendedAt" IS NULL
      AND b."balanceNano" < coalesce(o."autoRechargeThresholdNano", 0)`;
  for (const o of orgs) await handleAutoRecharge(o.id, logger);
}

export async function runRetention(logger: Logger): Promise<void> {
  const result = await purgeExpiredRequests();
  logger.info(result, "retention purge complete");
}

export async function runFinOps(logger: Logger): Promise<void> {
  const alerts = await computeFinOpsAlerts();
  for (const alert of alerts) {
    const log = alert.severity === "info" ? logger.info.bind(logger) : logger.warn.bind(logger);
    log({ alert }, `finops: ${alert.message}`);
  }
  await getRedis().set("inrent:finops:alerts", JSON.stringify({ at: new Date().toISOString(), alerts }), "EX", 7_200);
}

export { runProviderHealthChecks };
