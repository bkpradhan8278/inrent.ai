import { Queue, UnrecoverableError, type JobsOptions } from "bullmq";
import { isPlaceholderEmail, type TemplateEmail } from "./email";
import { apiKeyCreatedEmail, paymentFailedEmail, paymentReceiptEmail } from "./emailTemplates";
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
  /** A name from EmailTemplateData, or anything else for the generic subject/title/intro path. */
  template: string;
  data: Record<string, string>;
}

/** Payload of each named email template. The queue stores strings only, so booleans travel as "true". */
export interface EmailTemplateData {
  api_key_created: { name: string; keyName: string; keyPrefix: string; workspaceName: string; createdAtIso: string; manageUrl: string; rotated?: boolean };
  payment_receipt: { name: string; amountFormatted: string; creditsFormatted?: string; method?: string; reference: string; paidAtIso: string; workspaceName: string; billingUrl: string };
  payment_failed: { name: string; amountFormatted?: string; reason?: string; workspaceName: string; billingUrl: string };
}

export type EmailTemplateName = keyof EmailTemplateData;

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

/** Without a bound, queue.add() waits indefinitely while Redis is unreachable, which would stall the request that produced the email. */
const EMAIL_ENQUEUE_TIMEOUT_MS = 2_000;

/**
 * Best-effort producer for transactional email: never throws, so callers cannot be failed or
 * held up by it. Returns whether the job was queued. A stable `jobId` (e.g.
 * `email:payment_receipt:<paymentId>`) makes repeated calls for the same event a no-op while
 * the job is retained. BullMQ allows one ":" pair in custom ids, so keep each segment colon-free.
 */
export async function enqueueEmail<T extends EmailTemplateName>(to: string, template: T, data: EmailTemplateData[T], opts: { jobId?: string } = {}): Promise<boolean> {
  // Phone-only accounts carry a placeholder address; nothing could deliver to it.
  if (isPlaceholderEmail(to)) return false;
  const job: EmailJob = {
    to,
    template,
    data: Object.fromEntries(Object.entries(data).flatMap(([k, v]) => (v === undefined || v === null ? [] : [[k, String(v)]]))),
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      enqueue(QUEUES.email, template, job, opts.jobId ? { jobId: opts.jobId } : {}),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${EMAIL_ENQUEUE_TIMEOUT_MS}ms`)), EMAIL_ENQUEUE_TIMEOUT_MS);
      }),
    ]);
    return true;
  } catch (err) {
    // Not logging the recipient: it is personal data and the template name is enough to trace.
    console.error(`Could not queue "${template}" email: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turns a queued email job into the message to send. Named templates map onto the builders in
 * emailTemplates.ts; any other template keeps the original generic subject/title/intro shape so
 * jobs queued before named templates existed still send. A named job missing a required field
 * can never succeed, so it fails permanently instead of burning its retries.
 */
export function emailFromJob(job: Pick<EmailJob, "template" | "data">): TemplateEmail {
  const d = job.data;
  const need = (...keys: string[]) => {
    const missing = keys.filter((k) => !d[k]);
    if (missing.length) throw new UnrecoverableError(`Email job "${job.template}" is missing: ${missing.join(", ")}`);
  };
  switch (job.template) {
    case "api_key_created":
      need("keyName", "keyPrefix", "workspaceName", "createdAtIso", "manageUrl");
      return apiKeyCreatedEmail({
        name: d.name ?? "",
        keyName: d.keyName!,
        keyPrefix: d.keyPrefix!,
        workspaceName: d.workspaceName!,
        createdAtIso: d.createdAtIso!,
        manageUrl: d.manageUrl!,
        rotated: d.rotated === "true",
      });
    case "payment_receipt":
      need("amountFormatted", "reference", "paidAtIso", "workspaceName", "billingUrl");
      return paymentReceiptEmail({
        name: d.name ?? "",
        amountFormatted: d.amountFormatted!,
        creditsFormatted: d.creditsFormatted || undefined,
        method: d.method || undefined,
        reference: d.reference!,
        paidAtIso: d.paidAtIso!,
        workspaceName: d.workspaceName!,
        billingUrl: d.billingUrl!,
      });
    case "payment_failed":
      need("workspaceName", "billingUrl");
      return paymentFailedEmail({
        name: d.name ?? "",
        amountFormatted: d.amountFormatted || undefined,
        reason: d.reason || undefined,
        workspaceName: d.workspaceName!,
        billingUrl: d.billingUrl!,
      });
    default:
      return {
        subject: d.subject ?? "INRENT",
        title: d.title ?? "INRENT",
        intro: d.intro ?? "",
        action: d.actionUrl ? { label: d.actionLabel ?? "Open", url: d.actionUrl } : undefined,
      };
  }
}

export async function closeQueues(): Promise<void> {
  await Promise.allSettled([...queues.values()].map((q) => q.close()));
  queues.clear();
}
