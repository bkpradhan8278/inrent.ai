import { newEventId } from "./ids";

export const WEBHOOK_EVENTS = {
  "request.completed": "A gateway request completed successfully.",
  "request.failed": "A gateway request failed after all fallbacks.",
  "usage.threshold": "Monthly spend crossed a configured threshold.",
  "credit.low": "Credit balance fell below the low-balance threshold.",
  "payment.success": "A payment succeeded and credits were added.",
  "payment.failed": "A payment failed.",
  "model.updated": "A model's availability or pricing changed.",
  "provider.down": "A provider was marked down by health checks.",
  "provider.recovered": "A provider recovered after being down.",
} as const;

export type WebhookEventType = keyof typeof WEBHOOK_EVENTS;

export const WEBHOOK_EVENT_TYPES = Object.keys(WEBHOOK_EVENTS) as WebhookEventType[];

export interface WebhookEvent<T = Record<string, unknown>> {
  id: string;
  type: WebhookEventType;
  created: number;
  organization_id: string;
  data: T;
}

export function buildWebhookEvent<T extends Record<string, unknown>>(
  type: WebhookEventType,
  organizationId: string,
  data: T,
  now: Date = new Date(),
): WebhookEvent<T> {
  return {
    id: newEventId(),
    type,
    created: Math.floor(now.getTime() / 1000),
    organization_id: organizationId,
    data,
  };
}

/** Exponential backoff schedule for failed deliveries (attempt is 1-based). */
export function webhookRetryDelayMs(attempt: number): number {
  const schedule = [30_000, 120_000, 600_000, 1_800_000, 7_200_000, 21_600_000];
  return schedule[Math.min(attempt - 1, schedule.length - 1)] ?? 21_600_000;
}

export const WEBHOOK_MAX_ATTEMPTS = 7;
