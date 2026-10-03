import { createLogger, createErrorReporter } from "@inrent/observability";
import { createAdapter, envSecretResolver } from "@inrent/providers";
import { getServerEnv, loadByokKeys, loadServingCatalog, persistRequestRecord } from "@inrent/services";
import { getRedis, RedisRateLimitStore } from "@inrent/services/redis";
import { createApp } from "../../src/app";
import { RedisKV } from "../../src/kv";
import { createMetrics } from "../../src/metrics";
import type { GatewayDeps } from "../../src/types";

export function createTestGateway(overrides: Partial<GatewayDeps> = {}) {
  const logger = createLogger("gateway-test", { level: "silent" });
  const redis = getRedis();
  const deps: GatewayDeps = {
    env: getServerEnv(),
    logger,
    reporter: createErrorReporter("gateway-test", logger, ""),
    metrics: createMetrics(),
    kv: new RedisKV(redis),
    rateLimitStore: new RedisRateLimitStore(redis),
    createAdapter: (config) => createAdapter(config, { allowMock: true }),
    secretResolver: envSecretResolver,
    loadCatalog: loadServingCatalog,
    loadByokKeys,
    persistRequest: async (record) => {
      const r = await persistRequestRecord(record);
      return { duplicate: r.duplicate, balanceAfterNano: r.ledger?.balanceAfterNano ?? null };
    },
    enqueue: async () => {},
    afterRequest: async () => {},
    now: Date.now,
    trustProxy: false,
    metricsToken: null,
    ...overrides,
  };
  return { ...createApp(deps), deps };
}

export const chatBody = (model = "test/echo", extra: Record<string, unknown> = {}) =>
  JSON.stringify({ model, messages: [{ role: "user", content: "Hello gateway" }], ...extra });

export function bearer(key: string) {
  return { authorization: `Bearer ${key}`, "content-type": "application/json" };
}
