import { prisma, type HealthStatus } from "@inrent/db";
import type { Logger } from "@inrent/observability";
import { createAdapter, envSecretResolver } from "@inrent/providers";
import { emitWebhookEvent, getServerEnv } from "@inrent/services";

/**
 * Health = active probe (GET /models with the platform credential when configured) combined
 * with real traffic error rates over the last 10 minutes. Status transitions emit
 * provider.down / provider.recovered webhooks, and routing skips providers marked DOWN.
 */
export function deriveStatus(
  probes: Array<{ ok: boolean; latencyMs: number | null }>,
  traffic: { total: number; upstreamErrors: number },
): HealthStatus {
  const recent = probes.slice(0, 5);
  if (recent.length >= 3 && recent.slice(0, 3).every((p) => !p.ok)) return "DOWN";
  if (traffic.total >= 10 && traffic.upstreamErrors === traffic.total) return "DOWN";
  const latencies = recent.filter((p) => p.ok && p.latencyMs !== null).map((p) => p.latencyMs!).sort((a, b) => a - b);
  const p50 = latencies.length ? latencies[Math.floor(latencies.length / 2)]! : null;
  if (recent.some((p) => !p.ok)) return "DEGRADED";
  if (traffic.total >= 10 && traffic.upstreamErrors / traffic.total > 0.25) return "DEGRADED";
  if (p50 !== null && p50 > 5_000) return "DEGRADED";
  return recent.length ? "HEALTHY" : "UNKNOWN";
}

export async function runProviderHealthChecks(logger: Logger): Promise<void> {
  const env = getServerEnv();
  const providers = await prisma.provider.findMany({ where: { enabled: true } });
  for (const provider of providers) {
    if (provider.adapter === "MOCK" && !env.mockAllowed) continue;
    const apiKey = provider.credentialRef ? await envSecretResolver(provider.credentialRef) : null;
    let ok = false;
    let latencyMs: number | null = null;
    let error: string | null = null;
    try {
      const adapter = createAdapter({ slug: provider.slug, adapter: provider.adapter, baseUrl: provider.baseUrl, apiKey }, { allowMock: env.mockAllowed });
      const result = await adapter.healthCheck({ requestId: `health-${provider.slug}`, timeoutMs: 10_000 });
      latencyMs = result.latencyMs;
      // Without a platform credential, an auth rejection still proves the endpoint is reachable.
      ok = result.ok || (!apiKey && (result.status === 401 || result.status === 403));
      error = ok ? null : (result.error ?? "probe failed");
    } catch (e) {
      error = e instanceof Error ? e.message.slice(0, 200) : "probe failed";
    }
    await prisma.providerHealthCheck.create({ data: { providerId: provider.id, status: ok ? "HEALTHY" : "DOWN", latencyMs, error } });

    const probes = await prisma.providerHealthCheck.findMany({ where: { providerId: provider.id }, orderBy: { checkedAt: "desc" }, take: 5 });
    const [traffic] = await prisma.$queryRaw<Array<{ total: bigint; upstream_errors: bigint }>>`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE status = 'ERROR' AND ("errorCode" LIKE 'upstream%' OR "errorType" IN ('provider_error', 'timeout_error'))) AS upstream_errors
      FROM "Request" WHERE "providerSlug" = ${provider.slug} AND "createdAt" >= now() - interval '10 minutes' AND NOT "isDemo"`;
    const status = deriveStatus(
      probes.map((p) => ({ ok: p.status === "HEALTHY", latencyMs: p.latencyMs })),
      { total: Number(traffic?.total ?? 0), upstreamErrors: Number(traffic?.upstream_errors ?? 0) },
    );
    const okLatencies = probes.filter((p) => p.latencyMs !== null && p.status === "HEALTHY").map((p) => p.latencyMs!).sort((a, b) => a - b);
    await prisma.provider.update({
      where: { id: provider.id },
      data: {
        healthStatus: status,
        lastHealthCheckAt: new Date(),
        latencyP50Ms: okLatencies.length ? okLatencies[Math.floor(okLatencies.length / 2)] : provider.latencyP50Ms,
        errorRate: Number(traffic?.total ?? 0) ? Number(traffic!.upstream_errors) / Number(traffic!.total) : 0,
      },
    });

    if (status !== provider.healthStatus && (status === "DOWN" || provider.healthStatus === "DOWN")) {
      const type = status === "DOWN" ? "provider.down" : "provider.recovered";
      logger.warn({ provider: provider.slug, from: provider.healthStatus, to: status }, `provider health transition: ${type}`);
      const orgs = await prisma.webhook.findMany({ where: { enabled: true, deletedAt: null, events: { has: type } }, select: { organizationId: true }, distinct: ["organizationId"] });
      for (const o of orgs) await emitWebhookEvent(o.organizationId, type, { provider: provider.slug, status: status.toLowerCase() }).catch(() => undefined);
    }
  }
  // Keep the probe history bounded.
  await prisma.providerHealthCheck.deleteMany({ where: { checkedAt: { lt: new Date(Date.now() - 7 * 86_400_000) } } });
}
