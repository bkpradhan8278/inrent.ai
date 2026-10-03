import { prisma, type Prisma } from "@inrent/db";
import { customerPricePerMTok, evaluateServing, type IntegrationMode, type ModelStatus, type VerificationStatus } from "@inrent/core";
import { envSecretResolver } from "@inrent/providers";
import { getServerEnv } from "./env";
import { isFeatureEnabled } from "./flags";

const servingInclude = {
  endpoints: {
    include: {
      provider: true,
      prices: { where: { active: true }, orderBy: { effectiveFrom: "desc" }, take: 1 },
    },
  },
} satisfies Prisma.ModelInclude;

export type ServingModel = Prisma.ModelGetPayload<{ include: typeof servingInclude }>;
export type ServingEndpoint = ServingModel["endpoints"][number];

/** Full catalog with endpoints, providers and active prices — consumed by the gateway (cached there). */
export async function loadServingCatalog(): Promise<ServingModel[]> {
  return prisma.model.findMany({
    where: { status: { not: "DISABLED" }, verificationStatus: { not: "DISABLED" } },
    include: servingInclude,
  });
}

export function priceToConfig(price: ServingEndpoint["prices"][number] | undefined) {
  if (!price) return null;
  const s = (d: Prisma.Decimal | null) => (d === null ? null : d.toString());
  return {
    inputPerMTok: s(price.inputPerMTok),
    outputPerMTok: s(price.outputPerMTok),
    cachedInputPerMTok: s(price.cachedInputPerMTok),
    reasoningPerMTok: s(price.reasoningPerMTok),
    perImage: s(price.perImage),
    perRequest: s(price.perRequest),
    platformMarkupPct: price.platformMarkupPct.toString(),
  };
}

export function hasPlatformCredential(provider: { adapter: string; credentialRef: string | null }): boolean {
  if (provider.adapter === "MOCK") return true;
  if (!provider.credentialRef) return provider.adapter === "OPENAI_COMPATIBLE"; // e.g. local Ollama without auth
  return envSecretResolver(provider.credentialRef) !== null;
}

export type Availability = "platform" | "byok" | "unavailable";

export interface PublicModel {
  id: string;
  slug: string;
  displayName: string;
  vendor: string;
  family: string | null;
  description: string;
  modalitiesIn: string[];
  modalitiesOut: string[];
  capabilities: string[];
  contextLength: number | null;
  maxOutputTokens: number | null;
  status: ModelStatus;
  verificationStatus: VerificationStatus;
  license: string | null;
  licenseUrl: string | null;
  commercialUse: boolean | null;
  openWeights: boolean;
  documentationUrl: string | null;
  lastVerifiedAt: string | null;
  isDevOnly: boolean;
  featured: boolean;
  createdAt: string;
  availability: Availability;
  /** Customer price per 1M tokens incl. platform markup, from the cheapest eligible endpoint. */
  pricing: { input: string | null; output: string | null; cachedInput: string | null; perImage: string | null; source: string | null; lastVerifiedAt: string | null } | null;
  providers: Array<{
    slug: string;
    name: string;
    providerModelId: string;
    enabled: boolean;
    availability: Availability;
    integrationMode: IntegrationMode;
    health: string;
    latencyP50Ms: number | null;
    ttftP50Ms: number | null;
    contextLength: number | null;
    supportsTools: boolean;
    supportsStreaming: boolean;
    supportsJsonMode: boolean;
    supportsStructuredOutput: boolean;
    supportsVision: boolean;
    pricing: { input: string | null; output: string | null } | null;
  }>;
}

function toPublic(model: ServingModel, environment: ReturnType<typeof getServerEnv>["runtime"], betaModels: boolean): PublicModel {
  let best: { input: string | null; output: string | null; cachedInput: string | null; perImage: string | null; source: string | null; lastVerifiedAt: string | null; sort: number } | null = null;
  let modelAvailability: Availability = "unavailable";
  const providers = model.endpoints
    .filter((e) => e.provider.adapter !== "MOCK" || model.isDevOnly)
    .map((e) => {
      const price = e.prices[0];
      const config = priceToConfig(price);
      const hasTokenPrice = Boolean(config && (config.inputPerMTok !== null || config.outputPerMTok !== null || config.perImage !== null));
      const decision = evaluateServing({
        provider: {
          slug: e.provider.slug,
          enabled: e.provider.enabled,
          integrationMode: e.provider.integrationMode,
          resaleVerified: e.provider.resaleVerified,
          byokSupported: e.provider.byokSupported,
          hasPlatformCredential: hasPlatformCredential(e.provider),
          adapter: e.provider.adapter,
        },
        model: { status: model.status, verificationStatus: model.verificationStatus, commercialUse: model.commercialUse, resaleAllowed: model.resaleAllowed, isDevOnly: model.isDevOnly },
        endpointEnabled: e.enabled,
        hasActivePrice: hasTokenPrice,
        hasByokCredential: true, // public view: "available if you bring a key"
        environment,
        flags: { betaModels, byok: true },
      });
      const availability: Availability = decision.platform.eligible ? "platform" : decision.byok.eligible ? "byok" : "unavailable";
      if (availability === "platform" || (availability === "byok" && modelAvailability === "unavailable")) modelAvailability = availability;
      const customer =
        config && price?.active
          ? {
              input: customerPricePerMTok(config.inputPerMTok, config.platformMarkupPct),
              output: customerPricePerMTok(config.outputPerMTok, config.platformMarkupPct),
            }
          : null;
      if (availability === "platform" && config && price) {
        const input = customerPricePerMTok(config.inputPerMTok, config.platformMarkupPct);
        const output = customerPricePerMTok(config.outputPerMTok, config.platformMarkupPct);
        const sort = Number(input ?? 0) + Number(output ?? 0);
        if (!best || sort < best.sort) {
          best = {
            input,
            output,
            cachedInput: customerPricePerMTok(config.cachedInputPerMTok ?? null, config.platformMarkupPct),
            perImage: customerPricePerMTok(config.perImage ?? null, config.platformMarkupPct),
            source: price.pricingSource,
            lastVerifiedAt: price.lastVerifiedAt?.toISOString() ?? null,
            sort,
          };
        }
      }
      return {
        slug: e.provider.slug,
        name: e.provider.name,
        providerModelId: e.providerModelId,
        enabled: e.enabled && e.provider.enabled,
        availability,
        integrationMode: e.provider.integrationMode,
        health: e.healthStatus === "UNKNOWN" ? e.provider.healthStatus : e.healthStatus,
        latencyP50Ms: e.latencyP50Ms ?? e.provider.latencyP50Ms,
        ttftP50Ms: e.ttftP50Ms,
        contextLength: e.contextLength ?? model.contextLength,
        supportsTools: e.supportsTools,
        supportsStreaming: e.supportsStreaming,
        supportsJsonMode: e.supportsJsonMode,
        supportsStructuredOutput: e.supportsStructuredOutput,
        supportsVision: e.supportsVision,
        pricing: customer,
      };
    });
  const chosen = best as { input: string | null; output: string | null; cachedInput: string | null; perImage: string | null; source: string | null; lastVerifiedAt: string | null } | null;
  return {
    id: model.id,
    slug: model.slug,
    displayName: model.displayName,
    vendor: model.vendor,
    family: model.family,
    description: model.description,
    modalitiesIn: model.modalitiesIn,
    modalitiesOut: model.modalitiesOut,
    capabilities: model.capabilities,
    contextLength: model.contextLength,
    maxOutputTokens: model.maxOutputTokens,
    status: model.status,
    verificationStatus: model.verificationStatus,
    license: model.license,
    licenseUrl: model.licenseUrl,
    commercialUse: model.commercialUse,
    openWeights: model.openWeights,
    documentationUrl: model.documentationUrl,
    lastVerifiedAt: model.lastVerifiedAt?.toISOString() ?? null,
    isDevOnly: model.isDevOnly,
    featured: model.featured,
    createdAt: model.createdAt.toISOString(),
    availability: modelAvailability,
    pricing: chosen ? { input: chosen.input, output: chosen.output, cachedInput: chosen.cachedInput, perImage: chosen.perImage, source: chosen.source, lastVerifiedAt: chosen.lastVerifiedAt } : null,
    providers,
  };
}

async function betaEnabled(): Promise<boolean> {
  return isFeatureEnabled("BETA_MODELS_ENABLED");
}

export async function listPublicModels(): Promise<PublicModel[]> {
  const env = getServerEnv();
  const models = await prisma.model.findMany({
    where: {
      isPublic: true,
      status: { not: "DISABLED" },
      verificationStatus: { not: "DISABLED" },
      ...(env.runtime === "production" ? { isDevOnly: false } : {}),
    },
    include: servingInclude,
    orderBy: [{ featured: "desc" }, { vendor: "asc" }, { displayName: "asc" }],
  });
  const beta = await betaEnabled();
  return models.map((m) => toPublic(m, env.runtime, beta));
}

export async function getPublicModel(slug: string): Promise<PublicModel | null> {
  const env = getServerEnv();
  const model = await prisma.model.findUnique({ where: { slug }, include: servingInclude });
  if (!model || !model.isPublic || model.status === "DISABLED" || model.verificationStatus === "DISABLED") return null;
  if (model.isDevOnly && env.runtime === "production") return null;
  return toPublic(model, env.runtime, await betaEnabled());
}

export async function listPublicProviders() {
  return prisma.provider.findMany({
    where: { adapter: { not: "MOCK" } },
    select: { slug: true, name: true, description: true, websiteUrl: true, integrationMode: true, enabled: true, byokSupported: true, healthStatus: true, supportedEndpoints: true },
    orderBy: [{ priority: "asc" }, { name: "asc" }],
  });
}
