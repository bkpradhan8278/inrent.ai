import { Queue, Worker, type Job } from "bullmq";
import { prisma } from "@inrent/db";
import { createErrorReporter, createLogger } from "@inrent/observability";
import { sendTemplateEmail } from "@inrent/services/email";
import { closeQueues, QUEUES, redisConnectionOptions, type BillingJob, type EmailJob, type UsageFinalizeJob, type WebhookDeliveryJob } from "@inrent/services/queue";
import { closeRedis } from "@inrent/services/redis";
import { getServerEnv } from "@inrent/services";
import {
  handleAutoRecharge,
  handleUsageFinalize,
  handleWebhookDelivery,
  runFinOps,
  runProviderHealthChecks,
  runRetention,
  runUsageRollup,
  sweepAutoRecharge,
  sweepWebhookDeliveries,
} from "./jobs";

const logger = createLogger("worker");
const reporter = createErrorReporter("worker", logger);
const env = getServerEnv();
const connection = redisConnectionOptions();

function worker<T>(name: string, concurrency: number, fn: (job: Job<T>) => Promise<void>) {
  const w = new Worker<T>(name, fn, { connection, concurrency });
  w.on("failed", (job, err) => {
    reporter.captureException(err, { tags: { queue: name, job: job?.name ?? "unknown" } });
  });
  w.on("error", (err) => logger.error({ err, queue: name }, "worker error"));
  return w;
}

const workers = [
  worker<WebhookDeliveryJob>(QUEUES.webhooks, 20, (job) => handleWebhookDelivery(job.data.deliveryId, logger)),
  worker<UsageFinalizeJob>(QUEUES.usage, 5, (job) => handleUsageFinalize(job.data.payload)),
  worker<BillingJob>(QUEUES.billing, 5, async (job) => {
    if (job.data.kind === "auto_recharge") await handleAutoRecharge(job.data.organizationId, logger);
  }),
  worker<EmailJob>(QUEUES.email, 5, async (job) => {
    await sendTemplateEmail(job.data.to, {
      subject: job.data.data.subject ?? "INRENT",
      title: job.data.data.title ?? "INRENT",
      intro: job.data.data.intro ?? "",
      action: job.data.data.actionUrl ? { label: job.data.data.actionLabel ?? "Open", url: job.data.data.actionUrl } : undefined,
    });
  }),
  worker<Record<string, never>>(QUEUES.maintenance, 1, async (job) => {
    const started = Date.now();
    switch (job.name) {
      case "provider-health":
        await runProviderHealthChecks(logger);
        break;
      case "webhook-sweeper":
        await sweepWebhookDeliveries();
        break;
      case "usage-rollup":
        await runUsageRollup();
        break;
      case "auto-recharge-sweep":
        await sweepAutoRecharge(logger);
        break;
      case "retention":
        await runRetention(logger);
        break;
      case "finops":
        await runFinOps(logger);
        break;
      default:
        logger.warn({ job: job.name }, "unknown maintenance job");
    }
    logger.debug({ job: job.name, ms: Date.now() - started }, "maintenance job done");
  }),
];

/** Recurring jobs (idempotent scheduler upserts — safe with multiple worker replicas). */
async function schedule() {
  const maintenance = new Queue(QUEUES.maintenance, { connection });
  const every = (ms: number) => ({ every: ms });
  await maintenance.upsertJobScheduler("provider-health", every(60_000), { name: "provider-health" });
  await maintenance.upsertJobScheduler("webhook-sweeper", every(60_000), { name: "webhook-sweeper" });
  await maintenance.upsertJobScheduler("usage-rollup", every(15 * 60_000), { name: "usage-rollup" });
  await maintenance.upsertJobScheduler("auto-recharge-sweep", every(5 * 60_000), { name: "auto-recharge-sweep" });
  await maintenance.upsertJobScheduler("retention", every(6 * 60 * 60_000), { name: "retention" });
  await maintenance.upsertJobScheduler("finops", every(60 * 60_000), { name: "finops" });
  await maintenance.close();
}

schedule()
  .then(() => logger.info({ env: env.runtime, queues: Object.values(QUEUES) }, "INRENT worker started"))
  .catch((err) => {
    reporter.captureException(err, { tags: { stage: "schedule" } });
    process.exit(1);
  });

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, "worker shutting down");
  await Promise.allSettled(workers.map((w) => w.close()));
  await Promise.allSettled([closeQueues(), closeRedis(), prisma.$disconnect(), reporter.flush()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
