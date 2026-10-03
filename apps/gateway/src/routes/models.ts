import type { Hono } from "hono";
import { AUTO_MODEL_SLUG, Errors } from "@inrent/core";
import { listPublicModels, type PublicModel } from "@inrent/services";
import type { GatewayDeps, GatewayEnv } from "../types";

const TTL_MS = 30_000;
let cache: { at: number; models: PublicModel[] } | null = null;

async function models(deps: GatewayDeps): Promise<PublicModel[]> {
  if (!cache || deps.now() - cache.at > TTL_MS) cache = { at: deps.now(), models: await listPublicModels() };
  return cache.models;
}

function toApi(m: PublicModel) {
  return {
    id: m.slug,
    object: "model" as const,
    created: Math.floor(Date.parse(m.createdAt) / 1000),
    owned_by: m.vendor,
    name: m.displayName,
    description: m.description,
    context_length: m.contextLength,
    capabilities: m.capabilities,
    modalities: { input: m.modalitiesIn, output: m.modalitiesOut },
    status: m.status.toLowerCase(),
    availability: m.availability,
    pricing: m.pricing ? { currency: "USD", unit: "per_1m_tokens", input: m.pricing.input, output: m.pricing.output, cached_input: m.pricing.cachedInput } : null,
    providers: m.providers.filter((p) => p.enabled).map((p) => p.slug),
    ...(m.isDevOnly ? { dev_only: true } : {}),
  };
}

/** Public model discovery — no API key required. */
export function registerModelRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps) {
  app.get("/v1/models", async (c) => {
    const list = await models(deps);
    const data = list.map(toApi);
    data.unshift({
      id: AUTO_MODEL_SLUG,
      object: "model",
      created: 0,
      owned_by: "inrent",
      name: "INRENT Auto",
      description: "Routes each request to an eligible model using your organization's routing policy.",
      context_length: null,
      capabilities: ["chat", "streaming"],
      modalities: { input: ["text"], output: ["text"] },
      status: "active",
      availability: list.some((m) => m.availability !== "unavailable" && m.capabilities.includes("chat")) ? "platform" : "unavailable",
      pricing: null,
      providers: [],
    });
    return c.json({ object: "list", data }, 200, { "cache-control": "public, max-age=30" });
  });

  app.get("/v1/models/*", async (c) => {
    const id = decodeURIComponent(c.req.path.replace(/^\/v1\/models\//, ""));
    const m = (await models(deps)).find((x) => x.slug === id);
    if (!m) throw Errors.modelNotFound(id);
    return c.json(toApi(m), 200, { "cache-control": "public, max-age=30" });
  });
}
