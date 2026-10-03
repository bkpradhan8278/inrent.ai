import type { Logger } from "@inrent/observability";
import type { ErrorReporter } from "@inrent/observability";
import type { RateLimitStore } from "@inrent/core";
import type { ProviderAdapter, ProviderConfig, SecretResolver } from "@inrent/providers";
import type { RequestRecord, ServerEnv, ServingModel } from "@inrent/services";
import type { Metrics } from "./metrics";

/** Minimal key-value cache (Redis in production, in-memory in tests). */
export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  del(key: string): Promise<void>;
}

export interface GatewayAuth {
  kind: "api_key" | "internal";
  keyId: string | null;
  organizationId: string;
  projectId: string;
  userId: string | null;
  source: "api" | "playground" | "dashboard";
  permissions: string[];
  allowedModels: string[];
  projectAllowedModels: string[];
  keyRpm: number | null;
  keyTpm: number | null;
  planRpm: number;
  planTpm: number;
  keySpendLimitNano: bigint | null;
  projectBudgetNano: bigint | null;
  orgMonthlyCapNano: bigint | null;
  lowBalanceThresholdNano: bigint | null;
  autoRechargeEnabled: boolean;
  routingPolicy: string;
  preferByok: boolean;
  promptLogging: boolean;
  responseLogging: boolean;
  zeroRetention: boolean;
  isDemo: boolean;
}

export interface GatewayDeps {
  env: ServerEnv;
  logger: Logger;
  reporter: ErrorReporter;
  metrics: Metrics;
  kv: KV;
  rateLimitStore: RateLimitStore;
  createAdapter: (config: ProviderConfig) => ProviderAdapter;
  secretResolver: SecretResolver;
  loadCatalog: () => Promise<ServingModel[]>;
  loadByokKeys: (organizationId: string) => Promise<Map<string, string>>;
  persistRequest: (record: RequestRecord) => Promise<{ duplicate: boolean; balanceAfterNano: bigint | null }>;
  /** Enqueue background work (webhooks, notifications, retries). Errors are swallowed by callers. */
  enqueue: (queue: string, name: string, data: object) => Promise<void>;
  /** Fire-and-forget side effects after a request (webhooks, low balance). */
  afterRequest: (record: RequestRecord, auth: GatewayAuth, balanceAfterNano: bigint | null) => Promise<void>;
  now: () => number;
  trustProxy: boolean;
  metricsToken: string | null;
}

export type GatewayVariables = {
  requestId: string;
  traceId: string;
  startedAt: number;
  auth: GatewayAuth;
  clientIp: string | null;
};

export type GatewayEnv = { Variables: GatewayVariables };
