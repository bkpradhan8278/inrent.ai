import type { Hono } from "hono";
import { prisma } from "@inrent/db";
import { OPENAPI_SPEC } from "@inrent/core/openapi";
import { safeEqual } from "@inrent/core/server";
import type { GatewayDeps, GatewayEnv } from "../types";

export function registerSystemRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps) {
  app.get("/", (c) =>
    c.json({ name: "INRENT API", version: "v1", docs: "https://inrent.ai/docs", openapi: "/openapi.json", status: "https://inrent.ai/status" }),
  );

  /** Liveness: the process is up. */
  app.get("/health", (c) => c.json({ status: "ok" }, 200, { "cache-control": "no-store" }));

  /** Readiness: dependencies reachable. */
  app.get("/ready", async (c) => {
    const checks: Record<string, boolean> = {};
    checks.database = await prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false);
    checks.redis = await deps.kv.get("inrent:ready-probe").then(() => true).catch(() => false);
    const ok = Object.values(checks).every(Boolean);
    return c.json({ status: ok ? "ready" : "degraded", checks }, ok ? 200 : 503, { "cache-control": "no-store" });
  });

  app.get("/metrics", async (c) => {
    const token = deps.metricsToken;
    if (token) {
      const provided = c.req.header("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
      if (!safeEqual(provided, token)) return c.text("unauthorized", 401);
    } else if (deps.env.runtime === "production") {
      return c.text("metrics token not configured", 403);
    }
    return c.body(await deps.metrics.registry.metrics(), 200, { "content-type": deps.metrics.registry.contentType });
  });

  app.get("/openapi.json", (c) => c.json(OPENAPI_SPEC, 200, { "cache-control": "public, max-age=300" }));
  app.get("/v1/openapi.json", (c) => c.json(OPENAPI_SPEC, 200, { "cache-control": "public, max-age=300" }));
}
