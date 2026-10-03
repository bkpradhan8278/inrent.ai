import { prisma } from "@inrent/db";

export const dynamic = "force-dynamic";

/** Liveness + database readiness for the web app (used by Docker/Kubernetes probes). */
export async function GET() {
  const started = Date.now();
  let database = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = true;
  } catch {
    database = false;
  }
  return Response.json({ status: database ? "ok" : "degraded", database, latencyMs: Date.now() - started, version: process.env.APP_VERSION ?? "dev" }, { status: database ? 200 : 503, headers: { "cache-control": "no-store" } });
}
