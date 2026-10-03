import { serve } from "@hono/node-server";
import { prisma } from "@inrent/db";
import { createErrorReporter, createLogger } from "@inrent/observability";
import { initTelemetry } from "@inrent/observability/otel";
import { createAdapter, envSecretResolver } from "@inrent/providers";
import { getServerEnv, loadByokKeys, loadServingCatalog, persistRequestRecord } from "@inrent/services";
import { closeQueues, enqueue, type QueueName } from "@inrent/services/queue";
import { closeRedis, getRedis, RedisRateLimitStore } from "@inrent/services/redis";
import { createApp } from "./app";
import { RedisKV } from "./kv";
import { createMetrics } from "./metrics";
import { createAfterRequest } from "./sideEffects";
import type { GatewayDeps } from "./types";

const logger = createLogger("gateway");
const telemetry = initTelemetry("inrent-gateway");
const env = getServerEnv();
const reporter = createErrorReporter("gateway", logger);
const redis = getRedis();
const enqueueFn: GatewayDeps["enqueue"] = (queue, name, data) => enqueue(queue as QueueName, name, data);

const deps: GatewayDeps = {
  env,
  logger,
  reporter,
  metrics: createMetrics(),
  kv: new RedisKV(redis),
  rateLimitStore: new RedisRateLimitStore(redis),
  createAdapter: (config) => createAdapter({ ...config, timeoutMs: Number(process.env.GATEWAY_UPSTREAM_TIMEOUT_MS ?? 120_000) }, { allowMock: env.mockAllowed }),
  secretResolver: envSecretResolver,
  loadCatalog: loadServingCatalog,
  loadByokKeys,
  persistRequest: async (record) => {
    const r = await persistRequestRecord(record);
    return { duplicate: r.duplicate, balanceAfterNano: r.ledger?.balanceAfterNano ?? null };
  },
  enqueue: enqueueFn,
  afterRequest: createAfterRequest(enqueueFn),
  now: Date.now,
  trustProxy: process.env.TRUST_PROXY === "true",
  metricsToken: process.env.METRICS_TOKEN || null,
};

const { app } = createApp(deps);
const port = Number(process.env.GATEWAY_PORT ?? process.env.PORT ?? 8080);
const server = serve({ fetch: app.fetch, port, hostname: process.env.GATEWAY_HOST ?? "0.0.0.0" }, (info) => {
  logger.info({ port: info.port, env: env.runtime, mock: env.mockAllowed, otel: telemetry.enabled }, "INRENT gateway listening");
});

let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, "shutting down gateway");
  server.close();
  // Allow in-flight streams a grace period to finish and bill.
  await new Promise((r) => setTimeout(r, Number(process.env.GATEWAY_SHUTDOWN_GRACE_MS ?? 10_000)));
  await Promise.allSettled([closeQueues(), closeRedis(), prisma.$disconnect(), reporter.flush(), telemetry.shutdown()]);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (err) => reporter.captureException(err, { tags: { kind: "unhandledRejection" } }));
