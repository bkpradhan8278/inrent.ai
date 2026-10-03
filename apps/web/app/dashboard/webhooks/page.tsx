import type { Metadata } from "next";
import { WEBHOOK_EVENTS } from "@inrent/core";
import { prisma } from "@inrent/db";
import { listWebhooks } from "@inrent/services";
import { PageHeader, Section } from "@/components/dashboard/ui";
import { CodeTabs } from "@/components/ui/code-block";
import { requireOrgPermission } from "@/lib/session";
import { WebhooksManager } from "./webhooks-manager";

export const metadata: Metadata = { title: "Webhooks" };

const VERIFY_NODE = `import crypto from "node:crypto";

// header: Inrent-Signature: t=<unix seconds>,v1=<hex hmac>
export function verify(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex");
  const given = Buffer.from(parts.v1 ?? "", "hex");
  return given.length === 32 && crypto.timingSafeEqual(given, Buffer.from(expected, "hex"));
}`;

const VERIFY_PY = `import hashlib, hmac, time

def verify(raw_body: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    t = int(parts.get("t", "0"))
    if abs(time.time() - t) > tolerance:
        return False
    expected = hmac.new(secret.encode(), f"{t}.".encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, parts.get("v1", ""))`;

export default async function WebhooksPage() {
  const ws = await requireOrgPermission("webhooks:read");
  const hooks = await listWebhooks(ws.org.id);
  const deliveries = hooks.length
    ? await prisma.webhookDelivery.findMany({
        where: { webhookId: { in: hooks.map((h) => h.id) } },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, webhookId: true, eventType: true, status: true, attempts: true, responseStatus: true, durationMs: true, lastError: true, createdAt: true },
      })
    : [];
  return (
    <>
      <PageHeader title="Webhooks" description="Receive signed HTTPS callbacks for requests, billing and provider events. Failed deliveries retry with exponential backoff — 7 attempts over roughly 9 hours." />
      <WebhooksManager
        canWrite={ws.can("webhooks:write")}
        events={Object.entries(WEBHOOK_EVENTS).map(([type, description]) => ({ type, description }))}
        hooks={hooks.map((h) => ({ id: h.id, url: h.url, description: h.description ?? "", events: h.events, enabled: h.enabled, secretHint: h.secretHint, failureCount: h.failureCount, disabledReason: h.disabledReason, createdAt: h.createdAt.toISOString() }))}
        deliveries={deliveries.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() }))}
      />
      <Section title="Verifying signatures" description="Always verify the signature against the raw request body before trusting a webhook." className="mt-6">
        <CodeTabs
          tabs={[
            { label: "Node.js", lang: "js", code: VERIFY_NODE },
            { label: "Python", lang: "python", code: VERIFY_PY },
          ]}
        />
      </Section>
    </>
  );
}
