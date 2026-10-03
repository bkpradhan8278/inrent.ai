import type { Context, Hono } from "hono";
import { z } from "zod";
import { describeZodError, Errors, nanoToUsdString, usdToNano, type ApiKeyPermission } from "@inrent/core";
import { prisma } from "@inrent/db";
import {
  createApiKey,
  getBalance,
  getRequestDetail,
  getSpendState,
  getUsageOverview,
  listApiKeys,
  listRequests,
  requireProjectInOrg,
  revokeApiKey,
  ServiceError,
} from "@inrent/services";
import { authenticate, requirePermission } from "../auth";
import type { GatewayDeps, GatewayEnv } from "../types";

const createKeySchema = z.object({
  name: z.string().min(1).max(64),
  environment: z.enum(["development", "staging", "production"]).default("development"),
  project_id: z.string().uuid().optional(),
  permissions: z.array(z.enum(["inference", "keys:read", "keys:write", "usage:read", "logs:read"])).max(5).optional(),
  allowed_models: z.array(z.string().max(128)).max(100).optional(),
  spend_limit_usd: z.string().regex(/^\d+(\.\d{1,6})?$/).optional(),
  rpm_limit: z.number().int().min(1).optional(),
  tpm_limit: z.number().int().min(1).optional(),
  expires_at: z.string().datetime().optional(),
});

function keyJson(k: Awaited<ReturnType<typeof listApiKeys>>[number]) {
  return {
    id: k.id,
    name: k.name,
    prefix: k.displayPrefix,
    last_four: k.lastFour,
    environment: k.environment.toLowerCase(),
    project: { id: k.project.id, name: k.project.name },
    permissions: k.permissions,
    allowed_models: k.allowedModels,
    spend_limit_usd: k.spendLimitNano === null ? null : nanoToUsdString(k.spendLimitNano, 6),
    rpm_limit: k.rpmLimit,
    tpm_limit: k.tpmLimit,
    expires_at: k.expiresAt,
    revoked_at: k.revokedAt,
    last_used_at: k.lastUsedAt,
    created_at: k.createdAt,
  };
}

async function managed(c: Context<GatewayEnv>, deps: GatewayDeps, permission: string) {
  const auth = await authenticate(c, deps);
  if (auth.kind !== "api_key") throw Errors.permissionDenied("Management endpoints require an API key.");
  requirePermission(auth, permission);
  return auth;
}

function serviceError(e: unknown): never {
  if (e instanceof ServiceError) {
    if (e.status === 404) throw Errors.invalidRequest(e.message, null, "not_found");
    throw Errors.invalidRequest(e.message, null, e.code);
  }
  throw e;
}

export function registerManagementRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps) {
  /** Information about the calling key (any valid key). */
  app.get("/v1/key", async (c) => {
    const auth = await authenticate(c, deps);
    if (!auth.keyId) throw Errors.permissionDenied("This endpoint requires an API key.");
    const [key, spend] = await Promise.all([
      prisma.apiKey.findUniqueOrThrow({ where: { id: auth.keyId }, include: { project: { select: { id: true, name: true } } } }),
      getSpendState(auth.organizationId, auth.projectId, auth.keyId),
    ]);
    return c.json({
      data: {
        id: key.id,
        name: key.name,
        prefix: key.displayPrefix,
        environment: key.environment.toLowerCase(),
        organization_id: auth.organizationId,
        project: key.project,
        permissions: key.permissions,
        limits: {
          spend_limit_usd: key.spendLimitNano === null ? null : nanoToUsdString(key.spendLimitNano, 6),
          rpm: auth.keyRpm ?? auth.planRpm,
          tpm: auth.keyTpm ?? auth.planTpm,
        },
        usage: { spent_usd: nanoToUsdString(spend.keyTotalNano, 6) },
        balance_usd: nanoToUsdString(spend.balanceNano, 6),
        expires_at: key.expiresAt,
      },
    });
  });

  app.get("/v1/keys", async (c) => {
    const auth = await managed(c, deps, "keys:read");
    const keys = await listApiKeys(auth.organizationId, { includeRevoked: c.req.query("include_revoked") === "true" });
    return c.json({ object: "list", data: keys.map(keyJson) });
  });

  app.post("/v1/keys", async (c) => {
    const auth = await managed(c, deps, "keys:write");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch {
      throw Errors.invalidRequest("Request body must be valid JSON.", null, "invalid_json");
    }
    const parsed = createKeySchema.safeParse(raw);
    if (!parsed.success) {
      const { message, param } = describeZodError(parsed.error);
      throw Errors.invalidRequest(message, param);
    }
    const body = parsed.data;
    const permissions = (body.permissions ?? ["inference"]) as ApiKeyPermission[];
    // A key can never mint a key with more power than it has itself.
    const escalation = permissions.filter((p) => !auth.permissions.includes(p));
    if (escalation.length) throw Errors.permissionDenied(`Cannot grant permissions this key does not have: ${escalation.join(", ")}.`, "permission_escalation");
    try {
      const projectId = body.project_id ?? auth.projectId;
      await requireProjectInOrg(projectId, auth.organizationId);
      const { record, secret } = await createApiKey(
        { type: "API_KEY", id: auth.keyId! },
        {
          organizationId: auth.organizationId,
          projectId,
          name: body.name,
          environment: body.environment.toUpperCase() as "DEVELOPMENT" | "STAGING" | "PRODUCTION",
          permissions,
          allowedModels: body.allowed_models,
          spendLimitNano: body.spend_limit_usd ? usdToNano(body.spend_limit_usd) : null,
          rpmLimit: body.rpm_limit ?? null,
          tpmLimit: body.tpm_limit ?? null,
          expiresAt: body.expires_at ? new Date(body.expires_at) : null,
        },
      );
      const full = (await listApiKeys(auth.organizationId)).find((k) => k.id === record.id)!;
      return c.json({ data: { ...keyJson(full), key: secret }, warning: "Store this key now. It will not be shown again." }, 201);
    } catch (e) {
      serviceError(e);
    }
  });

  app.delete("/v1/keys/:id", async (c) => {
    const auth = await managed(c, deps, "keys:write");
    try {
      await revokeApiKey({ type: "API_KEY", id: auth.keyId! }, auth.organizationId, c.req.param("id"));
    } catch (e) {
      serviceError(e);
    }
    return c.json({ id: c.req.param("id"), revoked: true });
  });

  app.get("/v1/usage", async (c) => {
    const auth = await managed(c, deps, "usage:read");
    const days = Math.min(90, Math.max(1, Number(c.req.query("days") ?? 30) || 30));
    const [o, balance] = await Promise.all([getUsageOverview(auth.organizationId, { days, projectId: c.req.query("project_id") ?? null }), getBalance(auth.organizationId)]);
    return c.json({
      data: {
        days: o.days,
        balance_usd: nanoToUsdString(balance, 6),
        totals: { ...o.totals, spend_usd: nanoToUsdString(o.totals.spendNano, 6), spendNano: undefined },
        daily: o.series.map((d) => ({ date: d.date, requests: d.requests, errors: d.errors, input_tokens: d.inputTokens, output_tokens: d.outputTokens, spend_usd: nanoToUsdString(d.spendNano, 6) })),
        by_model: o.byModel.map((m) => ({ model: m.model, requests: m.requests, tokens: m.tokens, spend_usd: nanoToUsdString(m.spendNano, 6) })),
        by_provider: o.byProvider.map((p) => ({ provider: p.provider, requests: p.requests, errors: p.errors, avg_latency_ms: p.avgLatencyMs, spend_usd: nanoToUsdString(p.spendNano, 6) })),
        demo_data: o.hasDemoData,
      },
    });
  });

  app.get("/v1/requests", async (c) => {
    const auth = await managed(c, deps, "logs:read");
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 50) || 50));
    const status = c.req.query("status")?.toUpperCase();
    const { items, nextCursor } = await listRequests(
      auth.organizationId,
      { model: c.req.query("model"), status: status === "SUCCESS" || status === "ERROR" || status === "CANCELLED" ? status : undefined },
      { cursor: c.req.query("cursor"), limit },
    );
    return c.json({
      object: "list",
      data: items.map((r) => ({
        request_id: r.requestId,
        created_at: r.createdAt,
        endpoint: r.endpoint,
        model: r.modelSlug ?? r.modelRequested,
        provider: r.providerSlug,
        status: r.status.toLowerCase(),
        http_status: r.httpStatus,
        error_code: r.errorCode,
        input_tokens: r.inputTokens,
        output_tokens: r.outputTokens,
        cost_usd: nanoToUsdString(r.userChargeNano, 9),
        latency_ms: r.latencyMs,
        ttft_ms: r.ttftMs,
        fallbacks: r.fallbackCount,
        api_key: r.apiKey?.displayPrefix ?? null,
        project: r.project.name,
      })),
      next_cursor: nextCursor,
    });
  });

  app.get("/v1/requests/:id", async (c) => {
    const auth = await managed(c, deps, "logs:read");
    const r = await getRequestDetail(auth.organizationId, c.req.param("id"), { includePayloads: false });
    if (!r) throw Errors.invalidRequest("Request not found.", "id", "not_found");
    return c.json({
      data: {
        request_id: r.requestId,
        trace_id: r.traceId,
        created_at: r.createdAt,
        endpoint: r.endpoint,
        model_requested: r.modelRequested,
        model: r.modelSlug,
        provider: r.providerSlug,
        billing_mode: r.billingMode.toLowerCase(),
        status: r.status.toLowerCase(),
        http_status: r.httpStatus,
        error: r.errorCode ? { type: r.errorType, code: r.errorCode, message: r.errorMessage } : null,
        usage: { input_tokens: r.inputTokens, output_tokens: r.outputTokens, cached_tokens: r.cachedTokens, estimated: r.usageEstimated },
        cost_usd: nanoToUsdString(r.userChargeNano, 9),
        latency_ms: r.latencyMs,
        ttft_ms: r.ttftMs,
        routing: r.routing,
      },
    });
  });

}
