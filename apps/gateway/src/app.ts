import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { Errors, isInrentError, LIMITS, newRequestId, newTraceId } from "@inrent/core";
import { registerInferenceRoutes } from "./routes/inference";
import { registerManagementRoutes } from "./routes/management";
import { registerModelRoutes } from "./routes/models";
import { registerSystemRoutes } from "./routes/system";
import { GatewayState } from "./state";
import type { GatewayDeps, GatewayEnv } from "./types";

const TRACEPARENT = /^00-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/;

function clientIp(c: { req: { header: (n: string) => string | undefined }; env: unknown }, trustProxy: boolean): string | null {
  if (trustProxy) {
    const xff = c.req.header("x-forwarded-for");
    if (xff) return xff.split(",")[0]!.trim().slice(0, 64);
    const real = c.req.header("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return incoming?.socket?.remoteAddress ?? null;
}

export function createApp(deps: GatewayDeps) {
  const app = new Hono<GatewayEnv>();
  const state = new GatewayState(deps);

  app.use("*", async (c, next) => {
    c.set("requestId", newRequestId());
    const tp = c.req.header("traceparent");
    c.set("traceId", (tp && TRACEPARENT.exec(tp)?.[1]) || newTraceId());
    c.set("startedAt", performance.now());
    c.set("clientIp", clientIp(c, deps.trustProxy));
    await next();
    c.header("x-request-id", c.get("requestId"));
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "no-referrer");
  });

  // Bearer-token API: no cookies, so any origin may call it from the browser.
  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["authorization", "content-type", "x-api-key", "x-request-id", "traceparent", "openai-beta", "x-stainless-*"],
      exposeHeaders: [
        "x-request-id",
        "x-inrent-trace-id",
        "x-inrent-provider",
        "x-inrent-model",
        "x-inrent-fallbacks",
        "x-inrent-billing-mode",
        "x-inrent-cost-usd",
        "x-ratelimit-limit-requests",
        "x-ratelimit-remaining-requests",
        "x-ratelimit-reset-requests",
        "x-ratelimit-limit-tokens",
        "x-ratelimit-remaining-tokens",
        "x-ratelimit-reset-tokens",
        "retry-after",
      ],
      maxAge: 86_400,
    }),
  );

  app.use(
    "/v1/*",
    bodyLimit({
      maxSize: LIMITS.maxBodyBytes,
      onError: (c) => c.json(Errors.invalidRequest(`Request body exceeds ${LIMITS.maxBodyBytes / 1024 / 1024} MB.`, null, "payload_too_large").toBody(c.get("requestId")), 413),
    }),
  );

  registerSystemRoutes(app, deps);
  registerModelRoutes(app, deps);
  registerManagementRoutes(app, deps);
  registerInferenceRoutes(app, deps, state);

  app.notFound((c) =>
    c.json(Errors.invalidRequest(`Unknown endpoint ${c.req.method} ${c.req.path}. See https://inrent.ai/docs/api.`, null, "unknown_endpoint").toBody(c.get("requestId")), 404),
  );

  app.onError((err, c) => {
    const requestId = c.get("requestId") ?? null;
    if (isInrentError(err)) {
      if (err.status >= 500 && err.type === "api_error") deps.reporter.captureException(err, { requestId: requestId ?? undefined });
      return c.json(err.toBody(requestId), err.status as 400, { ...err.headers, "x-request-id": requestId ?? "" });
    }
    deps.reporter.captureException(err, { requestId: requestId ?? undefined });
    return c.json(Errors.internal().toBody(requestId), 500, { "x-request-id": requestId ?? "" });
  });

  return { app, state };
}
