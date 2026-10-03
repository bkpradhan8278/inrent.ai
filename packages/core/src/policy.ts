/**
 * Serving policy: decides whether an endpoint may be used with platform funds or only with
 * the customer's own provider key (BYOK).
 *
 * Principle: INRENT never assumes it may resell a provider's API. Platform-funded serving is
 * only allowed when an admin has recorded the legal basis for it:
 *   DIRECT_RESALE / AUTHORIZED_RESELLER → provider terms reviewed (resaleVerified) AND the
 *                                         model explicitly marked resaleAllowed
 *   CUSTOM_ENTERPRISE                   → only for organizations with that agreement
 *   SELF_HOSTED / OPEN_WEIGHT           → model license verified for commercial use
 *   BYOK                                → never platform-funded
 * Unknown (null) license or resale information is treated as "not allowed".
 */

export type IntegrationMode =
  | "DIRECT_RESALE"
  | "AUTHORIZED_RESELLER"
  | "BYOK"
  | "CUSTOM_ENTERPRISE"
  | "SELF_HOSTED"
  | "OPEN_WEIGHT";

export type ModelStatus = "ACTIVE" | "BETA" | "PREVIEW" | "DEPRECATED" | "DISABLED";
export type VerificationStatus = "VERIFIED" | "NEEDS_REVIEW" | "RESTRICTED" | "DISABLED";

export interface ServingPolicyInput {
  provider: {
    slug: string;
    enabled: boolean;
    integrationMode: IntegrationMode;
    resaleVerified: boolean;
    byokSupported: boolean;
    hasPlatformCredential: boolean;
    adapter: string;
  };
  model: {
    status: ModelStatus;
    verificationStatus: VerificationStatus;
    commercialUse: boolean | null;
    resaleAllowed: boolean | null;
    isDevOnly: boolean;
  };
  endpointEnabled: boolean;
  hasActivePrice: boolean;
  hasByokCredential: boolean;
  orgEnterpriseProviders?: string[];
  flags?: { betaModels?: boolean; byok?: boolean };
  environment: "development" | "staging" | "production" | "test";
}

export interface Eligibility {
  eligible: boolean;
  reason?: string;
}

export interface ServingDecision {
  platform: Eligibility;
  byok: Eligibility;
}

function base(input: ServingPolicyInput): Eligibility {
  const { provider, model } = input;
  if (!provider.enabled) return { eligible: false, reason: "provider_disabled" };
  if (!input.endpointEnabled) return { eligible: false, reason: "endpoint_disabled" };
  if (model.status === "DISABLED" || model.verificationStatus === "DISABLED") {
    return { eligible: false, reason: "model_disabled" };
  }
  if (model.status === "BETA" && !input.flags?.betaModels) return { eligible: false, reason: "beta_models_disabled" };
  if ((model.isDevOnly || provider.adapter === "MOCK") && input.environment === "production") {
    return { eligible: false, reason: "dev_only_model" };
  }
  return { eligible: true };
}

export function evaluateServing(input: ServingPolicyInput): ServingDecision {
  const b = base(input);
  if (!b.eligible) return { platform: b, byok: b };
  const { provider, model } = input;

  // BYOK — the customer's own agreement with the provider applies.
  let byok: Eligibility;
  if (input.flags?.byok === false) byok = { eligible: false, reason: "byok_disabled" };
  else if (!provider.byokSupported) byok = { eligible: false, reason: "byok_not_supported" };
  else if (!input.hasByokCredential) byok = { eligible: false, reason: "no_byok_credential" };
  else byok = { eligible: true };

  // Platform-funded serving.
  let platform: Eligibility = { eligible: true };
  if (model.verificationStatus !== "VERIFIED") {
    platform = { eligible: false, reason: "model_not_verified" };
  } else {
    switch (provider.integrationMode) {
      case "BYOK":
        platform = { eligible: false, reason: "provider_byok_only" };
        break;
      case "DIRECT_RESALE":
      case "AUTHORIZED_RESELLER":
        if (!provider.resaleVerified) platform = { eligible: false, reason: "resale_terms_not_verified" };
        else if (model.resaleAllowed !== true) platform = { eligible: false, reason: "model_resale_not_allowed" };
        break;
      case "CUSTOM_ENTERPRISE":
        if (!input.orgEnterpriseProviders?.includes(provider.slug)) {
          platform = { eligible: false, reason: "enterprise_agreement_required" };
        }
        break;
      case "SELF_HOSTED":
      case "OPEN_WEIGHT":
        if (model.commercialUse !== true) platform = { eligible: false, reason: "license_not_verified_for_commercial_use" };
        break;
    }
  }
  if (platform.eligible && !input.hasActivePrice) platform = { eligible: false, reason: "price_not_configured" };
  if (platform.eligible && !provider.hasPlatformCredential) {
    platform = { eligible: false, reason: "platform_credential_missing" };
  }
  return { platform, byok };
}

export const INTEGRATION_MODE_INFO: Record<IntegrationMode, { label: string; description: string; platformFunded: boolean }> = {
  DIRECT_RESALE: {
    label: "Direct resale",
    description: "Provider terms reviewed and permit resale of API access.",
    platformFunded: true,
  },
  AUTHORIZED_RESELLER: {
    label: "Authorized reseller",
    description: "INRENT holds a reseller or partner agreement with the provider.",
    platformFunded: true,
  },
  BYOK: {
    label: "Bring your own key",
    description: "Requests run on the customer's own provider account and key.",
    platformFunded: false,
  },
  CUSTOM_ENTERPRISE: {
    label: "Enterprise agreement",
    description: "Available only to organizations covered by a specific agreement.",
    platformFunded: true,
  },
  SELF_HOSTED: {
    label: "Self-hosted",
    description: "Served from INRENT-operated infrastructure; model license must permit commercial use.",
    platformFunded: true,
  },
  OPEN_WEIGHT: {
    label: "Open weights (hosted partner)",
    description: "Open-weight model served by an inference partner; license must permit commercial use.",
    platformFunded: true,
  },
};
