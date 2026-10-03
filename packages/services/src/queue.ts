import { Queue, type JobsOptions } from "bullmq";
import { getServerEnv } from "./env";

/** Queue names and job payloads shared by producers (web, gateway) and the worker. */
export const QUEUES = {
  webhooks: "webhook-delivery",
  usage: "usage",
  maintenance: "maintenance",
  email: "email",
  billing: "billing",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface WebhookDeliveryJob {
  deliveryId: string;
}

export interface EmailJob {
  to: string;
  template: string;
  data: Record<string, string>;
}

export interface UsageFinalizeJob {
  /** Serialized request record + charge to persist when the gateway could not write synchronously. */
  payload: string;
}

export interface BillingJob {
  kind: "auto_recharge" | "low_balance_check";
  organizationId: string;
}

const queues = new Map<string, Queue>();

export function redisConnectionOptions() {
  const url = new URL(getServerEnv().REDIS_URL);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.slice(1)) : 0,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection: redisConnectionOptions() });
    queues.set(name, q);
  }
  return q;
}

export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: "exponential", delay: 5_000 },
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export async function enqueue<T extends object>(name: QueueName, jobName: string, data: T, opts: JobsOptions = {}): Promise<void> {
  await getQueue(name).add(jobName, data, { ...DEFAULT_JOB_OPTIONS, ...opts });
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
