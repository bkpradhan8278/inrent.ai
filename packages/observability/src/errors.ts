import { randomUUID } from "node:crypto";
import type { Logger } from "pino";

/**
 * Error reporting abstraction. With SENTRY_DSN set, events are sent using the Sentry
 * envelope protocol (works with Sentry, GlitchTip and other Sentry-compatible backends)
 * without pulling a vendor SDK into every service. Without a DSN, errors are logged.
 */

export interface ErrorContext {
  requestId?: string;
  organizationId?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface ErrorReporter {
  captureException(error: unknown, context?: ErrorContext): void;
  flush(timeoutMs?: number): Promise<void>;
}

interface ParsedDsn {
  publicKey: string;
  host: string;
  protocol: string;
  projectId: string;
  pathPrefix: string;
}

export function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const parts = url.pathname.split("/").filter(Boolean);
    const projectId = parts.pop();
    if (!url.username || !projectId) return null;
    return {
      publicKey: url.username,
      host: url.host,
      protocol: url.protocol.replace(":", ""),
      projectId,
      pathPrefix: parts.length ? `/${parts.join("/")}` : "",
    };
  } catch {
    return null;
  }
}

function toException(error: unknown): { type: string; value: string; stack?: string } {
  if (error instanceof Error) return { type: error.name, value: error.message, stack: error.stack };
  return { type: "NonError", value: String(error) };
}

class SentryEnvelopeReporter implements ErrorReporter {
  private readonly pending = new Set<Promise<unknown>>();
  constructor(
    private readonly dsn: string,
    private readonly parsed: ParsedDsn,
    private readonly service: string,
    private readonly logger: Logger,
  ) {}

  captureException(error: unknown, context: ErrorContext = {}): void {
    const ex = toException(error);
    const eventId = randomUUID().replace(/-/g, "");
    const event = {
      event_id: eventId,
      timestamp: Date.now() / 1000,
      platform: "node",
      level: "error",
      logger: this.service,
      server_name: this.service,
      environment: process.env.INRENT_ENV ?? process.env.NODE_ENV,
      release: process.env.INRENT_VERSION,
      exception: { values: [{ type: ex.type, value: ex.value }] },
      tags: { service: this.service, ...(context.requestId ? { request_id: context.requestId } : {}), ...context.tags },
      extra: { stack: ex.stack, organization_id: context.organizationId, ...context.extra },
    };
    const envelope = [
      JSON.stringify({ event_id: eventId, dsn: this.dsn, sent_at: new Date().toISOString() }),
      JSON.stringify({ type: "event" }),
      JSON.stringify(event),
    ].join("\n");
    const url = `${this.parsed.protocol}://${this.parsed.host}${this.parsed.pathPrefix}/api/${this.parsed.projectId}/envelope/`;
    const p = fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-sentry-envelope",
        "x-sentry-auth": `Sentry sentry_version=7, sentry_client=inrent/0.1, sentry_key=${this.parsed.publicKey}`,
      },
      body: envelope,
      signal: AbortSignal.timeout(5_000),
    })
      .catch((e) => this.logger.warn({ err: e }, "error reporter delivery failed"))
      .finally(() => this.pending.delete(p));
    this.pending.add(p);
    this.logger.error({ err: error, ...context }, "exception captured");
  }

  async flush(timeoutMs = 2_000): Promise<void> {
    await Promise.race([Promise.allSettled([...this.pending]), new Promise((r) => setTimeout(r, timeoutMs))]);
  }
}

class LogReporter implements ErrorReporter {
  constructor(private readonly logger: Logger) {}
  captureException(error: unknown, context: ErrorContext = {}): void {
    this.logger.error({ err: error, ...context }, "exception captured");
  }
  async flush(): Promise<void> {}
}

export function createErrorReporter(service: string, logger: Logger, dsn = process.env.SENTRY_DSN): ErrorReporter {
  const parsed = dsn ? parseDsn(dsn) : null;
  if (dsn && parsed) return new SentryEnvelopeReporter(dsn, parsed, service, logger);
  return new LogReporter(logger);
}
