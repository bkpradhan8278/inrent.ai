import {
  AUTO_MODEL_SLUG,
  customerPricePerMTok,
  Errors,
  evaluateServing,
  picoPerToken,
  type PriceConfig,
  type RouteCandidate,
  type RoutePreferences,
  type RouteRequirements,
  type RoutingPolicy,
} from "@inrent/core";
import { hasPlatformCredential, priceToConfig, type ServingEndpoint, type ServingModel } from "@inrent/services";
import type { CircuitBreaker } from "../circuit";
import type { GatewayAuth } from "../types";

export type EndpointKind = "chat" | "embeddings" | "images";

export interface CandidateMeta {
  model: ServingModel;
  endpoint: ServingEndpoint;
  price: PriceConfig | null;
}

export interface CandidateSet {
  candidates: RouteCandidate[];
  meta: Map<string, CandidateMeta>;
  /** Why endpoints were not eligible — used to explain model_unavailable errors. */
  unavailable: Array<{ provider: string; model: string; platform?: string; byok?: string }>;
}

const KIND_CAPABILITY: Record<EndpointKind, string> = { chat: "chat", embeddings: "embedding", images: "image_generation" };

function hasRequiredPrice(kind: EndpointKind, price: PriceConfig | null): boolean {
  if (!price) return false;
  if (kind === "chat") return price.inputPerMTok !== null && price.outputPerMTok !== null;
  if (kind === "embeddings") return price.inputPerMTok !== null;
  return price.perImage !== null && price.perImage !== undefined;
}

export interface CandidateContext {
  auth: GatewayAuth;
  byokProviders: Set<string>;
  environment: "development" | "staging" | "production" | "test";
  flags: { betaModels: boolean; byok: boolean };
  circuit: CircuitBreaker;
}

function modelAllowed(auth: GatewayAuth, slug: string): boolean {
  if (auth.allowedModels.length && !auth.allowedModels.includes(slug)) return false;
  if (auth.projectAllowedModels.length && !auth.projectAllowedModels.includes(slug)) return false;
  return true;
}

function endpointCandidates(model: ServingModel, kind: EndpointKind, ctx: CandidateContext, out: CandidateSet) {
  for (const endpoint of model.endpoints) {
    const provider = endpoint.provider;
    if (!provider.supportedEndpoints.includes(kind === "images" ? "images" : kind)) continue;
    const price = priceToConfig(endpoint.prices[0]);
    const decision = evaluateServing({
      provider: {
        slug: provider.slug,
        enabled: provider.enabled,
        integrationMode: provider.integrationMode,
        resaleVerified: provider.resaleVerified,
        byokSupported: provider.byokSupported,
        hasPlatformCredential: hasPlatformCredential(provider),
        adapter: provider.adapter,
      },
      model: { status: model.status, verificationStatus: model.verificationStatus, commercialUse: model.commercialUse, resaleAllowed: model.resaleAllowed, isDevOnly: model.isDevOnly },
      endpointEnabled: endpoint.enabled,
      hasActivePrice: hasRequiredPrice(kind, price),
      hasByokCredential: ctx.byokProviders.has(provider.id),
      environment: ctx.environment,
      flags: ctx.flags,
    });
    let billingMode: "PLATFORM" | "BYOK" | null = null;
    if (decision.byok.eligible && (ctx.auth.preferByok || !decision.platform.eligible)) billingMode = "BYOK";
    else if (decision.platform.eligible) billingMode = "PLATFORM";
    if (!billingMode) {
      out.unavailable.push({ provider: provider.slug, model: model.slug, platform: decision.platform.reason, byok: decision.byok.reason });
      continue;
    }
    const markup = price?.platformMarkupPct ?? "0";
    const health = ctx.circuit.isOpen(provider.slug) ? "DOWN" : endpoint.healthStatus !== "UNKNOWN" ? endpoint.healthStatus : provider.healthStatus;
    const candidate: RouteCandidate = {
      endpointId: endpoint.id,
      modelId: model.id,
      modelSlug: model.slug,
      providerId: provider.id,
      providerSlug: provider.slug,
      providerModelId: endpoint.providerModelId,
      billingMode,
      endpointPriority: endpoint.priority,
      providerPriority: provider.priority,
      health,
      latencyP50Ms: endpoint.latencyP50Ms ?? provider.latencyP50Ms,
      ttftP50Ms: endpoint.ttftP50Ms,
      inputPicoPerToken: picoPerToken(customerPricePerMTok(price?.inputPerMTok ?? null, markup)),
      outputPicoPerToken: picoPerToken(customerPricePerMTok(price?.outputPerMTok ?? null, markup)),
      qualityTier: model.qualityTier,
      contextLength: endpoint.contextLength ?? model.contextLength,
      supports: {
        tools: endpoint.supportsTools,
        vision: endpoint.supportsVision || model.modalitiesIn.includes("image"),
        jsonMode: endpoint.supportsJsonMode,
        structuredOutput: endpoint.supportsStructuredOutput,
        streaming: endpoint.supportsStreaming,
      },
    };
    out.candidates.push(candidate);
    out.meta.set(endpoint.id, { model, endpoint, price });
  }
}

/**
 * Builds routing candidates for a requested model (or inrent/auto), honouring key/project
 * model allowlists, serving policy (resale/BYOK/license) and capability requirements.
 */
export function buildCandidates(
  requested: string,
  kind: EndpointKind,
  catalog: { bySlug: Map<string, ServingModel>; all: ServingModel[] },
  ctx: CandidateContext,
): CandidateSet {
  const set: CandidateSet = { candidates: [], meta: new Map(), unavailable: [] };
  if (requested === AUTO_MODEL_SLUG) {
    if (kind !== "chat") throw Errors.invalidRequest(`'${AUTO_MODEL_SLUG}' is only available for chat completions.`, "model");
    for (const model of catalog.all) {
      if (!model.capabilities.includes("chat") || !modelAllowed(ctx.auth, model.slug)) continue;
      if (model.isDevOnly && ctx.environment === "production") continue;
      endpointCandidates(model, kind, ctx, set);
    }
    return set;
  }
  const model = catalog.bySlug.get(requested);
  if (!model || (model.isDevOnly && ctx.environment === "production")) throw Errors.modelNotFound(requested);
  if (!model.capabilities.includes(KIND_CAPABILITY[kind])) {
    throw Errors.invalidRequest(`'${requested}' does not support ${kind === "chat" ? "chat completions" : kind}.`, "model", "unsupported_model_for_endpoint");
  }
  if (!modelAllowed(ctx.auth, model.slug)) throw Errors.modelNotAllowed(requested);
  endpointCandidates(model, kind, ctx, set);
  return set;
}

export function explainUnavailable(model: string, set: CandidateSet) {
  const reasons = new Set(set.unavailable.flatMap((u) => [u.platform, u.byok].filter(Boolean) as string[]));
  let hint = "No provider for this model is currently enabled.";
  if (reasons.has("no_byok_credential") && (reasons.has("provider_byok_only") || reasons.has("model_not_verified") || reasons.has("resale_terms_not_verified"))) {
    const providers = [...new Set(set.unavailable.filter((u) => u.byok === "no_byok_credential").map((u) => u.provider))];
    hint = `This model is available with your own provider key. Add a BYOK key for ${providers.join(" or ")} in Dashboard → BYOK.`;
  } else if (reasons.has("byok_disabled") && reasons.has("provider_byok_only")) {
    hint = "This model is only available with your own provider key, and bring-your-own-key is not enabled for your organization.";
  } else if (reasons.has("price_not_configured")) {
    hint = "Pricing for this model has not been published yet.";
  } else if (reasons.has("provider_disabled") || reasons.has("endpoint_disabled")) {
    hint = "This model's providers are not enabled yet.";
  }
  return Errors.modelUnavailable(model, hint, { providers: set.unavailable.slice(0, 10) });
}

export function requirementsFromChat(body: {
  tools?: unknown[];
  response_format?: { type: string };
  stream?: boolean;
  messages: Array<{ content?: unknown }>;
}): RouteRequirements {
  const hasImage = body.messages.some((m) => Array.isArray(m.content) && (m.content as Array<{ type?: string }>).some((p) => p?.type === "image_url"));
  return {
    tools: Boolean(body.tools?.length),
    vision: hasImage,
    jsonMode: body.response_format?.type === "json_object",
    structuredOutput: body.response_format?.type === "json_schema",
    streaming: Boolean(body.stream),
  };
}

export function policyFrom(route: string | undefined, orgPolicy: string): RoutingPolicy {
  switch (route) {
    case "lowest_cost":
      return "LOWEST_COST";
    case "lowest_latency":
      return "LOWEST_LATENCY";
    case "best_quality":
      return "BEST_QUALITY";
    case "balanced":
      return "BALANCED";
    default:
      return (["BALANCED", "LOWEST_COST", "LOWEST_LATENCY", "BEST_QUALITY", "CUSTOM"].includes(orgPolicy) ? orgPolicy : "BALANCED") as RoutingPolicy;
  }
}

export function preferencesFrom(ext: { providers?: { order?: string[]; only?: string[]; ignore?: string[]; allow_fallbacks?: boolean } } | undefined, preferByok: boolean): RoutePreferences {
  return {
    order: ext?.providers?.order,
    only: ext?.providers?.only,
    ignore: ext?.providers?.ignore,
    allowFallbacks: ext?.providers?.allow_fallbacks,
    preferByok,
  };
}
