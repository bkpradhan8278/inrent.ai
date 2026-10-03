import "server-only";
import { prisma } from "@inrent/db";
import { getPlatformStatus } from "@inrent/services";

/** Gathers real signals (gateway health probe, database) and derives component status. */
export async function loadStatus() {
  const gatewayUrl = process.env.GATEWAY_INTERNAL_URL ?? "http://localhost:8080";
  let gateway: { ok: boolean; latencyMs: number } | null = null;
  const started = Date.now();
  try {
    const res = await fetch(`${gatewayUrl}/ready`, { cache: "no-store", signal: AbortSignal.timeout(3_000) });
    gateway = { ok: res.ok, latencyMs: Date.now() - started };
  } catch {
    gateway = null;
  }
  const database = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
  if (!database) {
    return {
      components: [{ id: "dashboard", name: "Dashboard", status: "major_outage" as const, detail: "Database unreachable." }],
      incidents: [],
      generatedAt: new Date().toISOString(),
    };
  }
  return getPlatformStatus({ gateway, database });
}
