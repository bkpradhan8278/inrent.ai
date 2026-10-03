import { prisma, type Prisma } from "@inrent/db";
import { buildWebhookEvent, WEBHOOK_EVENT_TYPES, WEBHOOK_MAX_ATTEMPTS, webhookRetryDelayMs, type WebhookEventType } from "@inrent/core";
import { assertPublicUrl, generateWebhookSecret, secretHint, signWebhookPayload, UnsafeUrlError, WEBHOOK_SIGNATURE_HEADER } from "@inrent/core/server";
import { recordAudit } from "./audit";
import { requireOrgPermission, requireProjectInOrg } from "./authz";
import { getServerEnv } from "./env";
import { NotFoundError, ValidationError } from "./errors";
import { enqueue, QUEUES } from "./queue";
import { aad, decrypt, encrypt } from "./secrets";

const AUTO_DISABLE_AFTER_FAILURES = 25;

function outboundOptions() {
  const env = getServerEnv();
  const allowPrivate = env.runtime !== "production" && env.ALLOW_PRIVATE_WEBHOOK_URLS === "true";
  return { allowHttp: allowPrivate, allowPrivateNetwork: allowPrivate };
}

async function validateUrl(url: string) {
  try {
    await assertPublicUrl(url, outboundOptions());
  } catch (e) {
    throw new ValidationError(e instanceof UnsafeUrlError ? `Webhook URL rejected: ${e.message}.` : "Webhook URL is not valid.");
  }
}

function validateEvents(events: string[]): WebhookEventType[] {
  if (!events.length) throw new ValidationError("Select at least one event.");
  for (const e of events) {
    if (!WEBHOOK_EVENT_TYPES.includes(e as WebhookEventType)) throw new ValidationError(`Unknown event '${e}'.`);
  }
  return [...new Set(events)] as WebhookEventType[];
}

export const webhookPublicSelect = {
  id: true,
  url: true,
  description: true,
  events: true,
  enabled: true,
  secretHint: true,
  failureCount: true,
  disabledReason: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export async function createWebhook(userId: string, organizationId: string, input: { url: string; events: string[]; description?: string; projectId?: string | null }) {
  await requireOrgPermission(userId, organizationId, "webhooks:write");
  await validateUrl(input.url);
  const events = validateEvents(input.events);
  if (input.projectId) await requireProjectInOrg(input.projectId, organizationId);
  const count = await prisma.webhook.count({ where: { organizationId, deletedAt: null } });
  if (count >= 20) throw new ValidationError("You can configure up to 20 webhooks per organization.");
  const secret = generateWebhookSecret();
  const webhook = await prisma.webhook.create({
    data: {
      organizationId,
      projectId: input.projectId ?? null,
      url: input.url,
      events,
      description: input.description?.slice(0, 200),
      secretEncrypted: encrypt(secret, aad.webhook(organizationId)),
      secretHint: secretHint(secret),
    },
    select: webhookPublicSelect,
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "webhook.created", targetType: "webhook", targetId: webhook.id, metadata: { events } });
  return { webhook, secret };
}

async function findWebhook(organizationId: string, webhookId: string) {
  const webhook = await prisma.webhook.findFirst({ where: { id: webhookId, organizationId, deletedAt: null } });
  if (!webhook) throw new NotFoundError("Webhook");
  return webhook;
}

export async function updateWebhook(userId: string, organizationId: string, webhookId: string, input: { url?: string; events?: string[]; description?: string; enabled?: boolean }) {
  await requireOrgPermission(userId, organizationId, "webhooks:write");
  const webhook = await findWebhook(organizationId, webhookId);
  if (input.url && input.url !== webhook.url) await validateUrl(input.url);
  const updated = await prisma.webhook.update({
    where: { id: webhook.id },
    data: {
      url: input.url,
      events: input.events ? validateEvents(input.events) : undefined,
      description: input.description?.slice(0, 200),
      enabled: input.enabled,
      ...(input.enabled ? { failureCount: 0, disabledReason: null } : {}),
    },
    select: webhookPublicSelect,
  });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "webhook.updated", targetType: "webhook", targetId: webhook.id });
  return updated;
}

export async function rotateWebhookSecret(userId: string, organizationId: string, webhookId: string) {
  await requireOrgPermission(userId, organizationId, "webhooks:write");
  const webhook = await findWebhook(organizationId, webhookId);
  const secret = generateWebhookSecret();
  await prisma.webhook.update({ where: { id: webhook.id }, data: { secretEncrypted: encrypt(secret, aad.webhook(organizationId)), secretHint: secretHint(secret) } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "webhook.secret_rotated", targetType: "webhook", targetId: webhook.id });
  return secret;
}

export async function deleteWebhook(userId: string, organizationId: string, webhookId: string) {
  await requireOrgPermission(userId, organizationId, "webhooks:write");
  const webhook = await findWebhook(organizationId, webhookId);
  await prisma.webhook.update({ where: { id: webhook.id }, data: { deletedAt: new Date(), enabled: false } });
  await recordAudit({ organizationId, actorType: "USER", actorId: userId, action: "webhook.deleted", targetType: "webhook", targetId: webhook.id });
}

export async function listWebhooks(organizationId: string) {
  return prisma.webhook.findMany({ where: { organizationId, deletedAt: null }, select: webhookPublicSelect, orderBy: { createdAt: "desc" } });
}

export async function listDeliveries(organizationId: string, webhookId: string, limit = 50) {
  await findWebhook(organizationId, webhookId);
  return prisma.webhookDelivery.findMany({
    where: { webhookId },
    orderBy: { createdAt: "desc" },
    take: Math.min(limit, 200),
    select: { id: true, eventId: true, eventType: true, status: true, attempts: true, responseStatus: true, durationMs: true, lastError: true, nextAttemptAt: true, createdAt: true },
  });
}

/** Fans an event out to every subscribed webhook and queues delivery. */
export async function emitWebhookEvent(organizationId: string, type: WebhookEventType, data: Record<string, unknown>, opts: { projectId?: string | null } = {}) {
  const hooks = await prisma.webhook.findMany({
    where: {
      organizationId,
      enabled: true,
      deletedAt: null,
      events: { has: type },
      ...(opts.projectId ? { OR: [{ projectId: null }, { projectId: opts.projectId }] } : {}),
    },
    select: { id: true },
  });
  if (!hooks.length) return 0;
  const event = buildWebhookEvent(type, organizationId, data);
  for (const hook of hooks) {
    const delivery = await prisma.webhookDelivery.create({
      data: { webhookId: hook.id, eventId: event.id, eventType: type, payload: event as unknown as Prisma.InputJsonValue, nextAttemptAt: new Date() },
    });
    await enqueue(QUEUES.webhooks, "deliver", { deliveryId: delivery.id }, { jobId: delivery.id, attempts: 1 }).catch(() => {
      // The worker's sweeper picks up PENDING deliveries if the queue is briefly unavailable.
    });
  }
  return hooks.length;
}

export async function sendTestWebhook(userId: string, organizationId: string, webhookId: string) {
  await requireOrgPermission(userId, organizationId, "webhooks:write");
  const webhook = await findWebhook(organizationId, webhookId);
  const event = buildWebhookEvent((webhook.events[0] ?? "request.completed") as WebhookEventType, organizationId, { test: true, message: "This is a test event from INRENT." });
  const delivery = await prisma.webhookDelivery.create({
    data: { webhookId: webhook.id, eventId: event.id, eventType: event.type, payload: event as unknown as Prisma.InputJsonValue, nextAttemptAt: new Date() },
  });
  await enqueue(QUEUES.webhooks, "deliver", { deliveryId: delivery.id }, { jobId: delivery.id, attempts: 1 });
  return delivery.id;
}

/**
 * Delivers one webhook attempt (called by the worker). Re-validates the destination
 * immediately before connecting, never follows redirects and caps the response it reads.
 */
export async function deliverWebhook(deliveryId: string, fetchImpl: typeof fetch = fetch): Promise<"succeeded" | "retry" | "failed" | "skipped"> {
  const delivery = await prisma.webhookDelivery.findUnique({ where: { id: deliveryId }, include: { webhook: true } });
  if (!delivery || delivery.status !== "PENDING") return "skipped";
  const { webhook } = delivery;
  if (!webhook.enabled || webhook.deletedAt) {
    await prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED", lastError: "webhook_disabled", nextAttemptAt: null } });
    return "failed";
  }
  const body = JSON.stringify(delivery.payload);
  const attempt = delivery.attempts + 1;
  const started = performance.now();
  let status: number | null = null;
  let responseBody: string | null = null;
  let error: string | null = null;
  try {
    await assertPublicUrl(webhook.url, outboundOptions());
    const secret = decrypt(webhook.secretEncrypted, aad.webhook(webhook.organizationId));
    const res = await fetchImpl(webhook.url, {
      method: "POST",
      redirect: "manual",
      headers: {
        "content-type": "application/json",
        "user-agent": "INRENT-Webhooks/1.0",
        [WEBHOOK_SIGNATURE_HEADER]: signWebhookPayload(secret, body, Math.floor(Date.now() / 1000)),
        "Inrent-Event-Id": delivery.eventId,
        "Inrent-Event-Type": delivery.eventType,
        "Inrent-Delivery-Attempt": String(attempt),
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    status = res.status;
    responseBody = (await res.text().catch(() => "")).slice(0, 1_000);
    if (status < 200 || status >= 300) error = `HTTP ${status}`;
  } catch (e) {
    error = e instanceof UnsafeUrlError ? `blocked: ${e.message}` : e instanceof Error ? e.message.slice(0, 200) : "delivery_failed";
  }
  const durationMs = Math.round(performance.now() - started);

  if (!error) {
    await prisma.$transaction([
      prisma.webhookDelivery.update({ where: { id: delivery.id }, data: { status: "SUCCEEDED", attempts: attempt, responseStatus: status, responseBody, durationMs, lastError: null, nextAttemptAt: null } }),
      prisma.webhook.update({ where: { id: webhook.id }, data: { failureCount: 0 } }),
    ]);
    return "succeeded";
  }

  const final = attempt >= WEBHOOK_MAX_ATTEMPTS || error.startsWith("blocked:");
  const failures = webhook.failureCount + 1;
  await prisma.$transaction([
    prisma.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: final ? "FAILED" : "PENDING",
        attempts: attempt,
        responseStatus: status,
        responseBody,
        durationMs,
        lastError: error,
        nextAttemptAt: final ? null : new Date(Date.now() + webhookRetryDelayMs(attempt)),
      },
    }),
    prisma.webhook.update({
      where: { id: webhook.id },
      data: {
        failureCount: failures,
        ...(failures >= AUTO_DISABLE_AFTER_FAILURES ? { enabled: false, disabledReason: `Disabled after ${failures} consecutive failed deliveries` } : {}),
      },
    }),
  ]);
  return final ? "failed" : "retry";
}
