import { prisma } from "@inrent/db";
import { configuredPaymentProviders } from "./payments";

export type ComponentStatus = "operational" | "degraded" | "partial_outage" | "major_outage" | "unknown" | "not_launched" | "preview";

export interface StatusComponent {
  id: string;
  name: string;
  status: ComponentStatus;
  detail: string;
}

/**
 * Derives component status from real signals only (health checks, provider health, open
 * incidents). When there is no signal the status is "unknown" — never assumed operational.
 */
export async function getPlatformStatus(signals: { gateway: { ok: boolean; latencyMs: number } | null; database: boolean }) {
  const [providers, incidents] = await Promise.all([
    prisma.provider.findMany({ where: { enabled: true }, select: { slug: true, name: true, healthStatus: true, lastHealthCheckAt: true } }),
    prisma.incident.findMany({ where: { OR: [{ resolvedAt: null }, { resolvedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } }] }, orderBy: { startedAt: "desc" }, take: 20 }),
  ]);

  const open = incidents.filter((i) => !i.resolvedAt);
  const incidentStatus = (component: string): ComponentStatus | null => {
    const hits = open.filter((i) => i.components.includes(component));
    if (!hits.length) return null;
    if (hits.some((i) => i.impact === "CRITICAL")) return "major_outage";
    if (hits.some((i) => i.impact === "MAJOR")) return "partial_outage";
    return "degraded";
  };

  const checked = providers.filter((p) => p.lastHealthCheckAt && Date.now() - p.lastHealthCheckAt.getTime() < 15 * 60_000);
  const down = checked.filter((p) => p.healthStatus === "DOWN").length;
  const degraded = checked.filter((p) => p.healthStatus === "DEGRADED").length;
  let modelsStatus: ComponentStatus = "unknown";
  let modelsDetail = "No recent provider health checks.";
  if (checked.length) {
    modelsStatus = down === checked.length ? "major_outage" : down > 0 ? "partial_outage" : degraded > 0 ? "degraded" : "operational";
    modelsDetail = `${checked.length - down - degraded}/${checked.length} enabled providers healthy.`;
  } else if (!providers.length) {
    modelsDetail = "No providers enabled yet.";
  }

  const gatewayStatus: ComponentStatus = signals.gateway === null ? "unknown" : signals.gateway.ok ? "operational" : "major_outage";
  const components: StatusComponent[] = [
    { id: "api", name: "API", status: incidentStatus("api") ?? gatewayStatus, detail: signals.gateway ? `Health check ${signals.gateway.ok ? "passed" : "failed"} in ${signals.gateway.latencyMs} ms.` : "Gateway health endpoint not reachable from the status checker." },
    { id: "gateway", name: "Gateway & routing", status: incidentStatus("gateway") ?? gatewayStatus, detail: "Authentication, rate limiting, routing and fallback." },
    { id: "models", name: "Model providers", status: incidentStatus("models") ?? modelsStatus, detail: modelsDetail },
    { id: "billing", name: "Billing", status: incidentStatus("billing") ?? (signals.database ? (configuredPaymentProviders().length ? "operational" : "unknown") : "major_outage"), detail: configuredPaymentProviders().length ? `Payments via ${configuredPaymentProviders().join(", ")}.` : "No payment provider configured in this environment." },
    { id: "dashboard", name: "Dashboard", status: incidentStatus("dashboard") ?? (signals.database ? "operational" : "major_outage"), detail: signals.database ? "Database reachable." : "Database unreachable." },
    { id: "docs", name: "Documentation", status: incidentStatus("docs") ?? "operational", detail: "Served statically with the web app." },
    { id: "mcp", name: "MCP", status: "preview", detail: "Server registry in preview; tool execution not yet launched." },
    { id: "gpu", name: "GPU Cloud", status: "not_launched", detail: "Not launched. Join the waitlist." },
  ];
  return { components, incidents, generatedAt: new Date().toISOString() };
}
