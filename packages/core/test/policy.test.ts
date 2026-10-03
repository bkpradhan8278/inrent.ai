import { describe, expect, it } from "vitest";
import { evaluateServing, type ServingPolicyInput } from "../src/policy";

function input(overrides: {
  provider?: Partial<ServingPolicyInput["provider"]>;
  model?: Partial<ServingPolicyInput["model"]>;
  rest?: Partial<Omit<ServingPolicyInput, "provider" | "model">>;
}): ServingPolicyInput {
  return {
    provider: {
      slug: "acme",
      enabled: true,
      integrationMode: "AUTHORIZED_RESELLER",
      resaleVerified: true,
      byokSupported: true,
      hasPlatformCredential: true,
      adapter: "OPENAI_COMPATIBLE",
      ...overrides.provider,
    },
    model: {
      status: "ACTIVE",
      verificationStatus: "VERIFIED",
      commercialUse: true,
      resaleAllowed: true,
      isDevOnly: false,
      ...overrides.model,
    },
    endpointEnabled: true,
    hasActivePrice: true,
    hasByokCredential: false,
    environment: "production",
    flags: { byok: true },
    ...overrides.rest,
  };
}

describe("serving policy", () => {
  it("allows platform funding only with verified resale terms", () => {
    expect(evaluateServing(input({})).platform.eligible).toBe(true);
    expect(evaluateServing(input({ provider: { resaleVerified: false } })).platform).toEqual({
      eligible: false,
      reason: "resale_terms_not_verified",
    });
  });

  it("never platform-funds BYOK-mode providers", () => {
    const d = evaluateServing(input({ provider: { integrationMode: "BYOK" }, rest: { hasByokCredential: true } }));
    expect(d.platform.reason).toBe("provider_byok_only");
    expect(d.byok.eligible).toBe(true);
  });

  it("treats unknown resale rights as not allowed", () => {
    expect(evaluateServing(input({ model: { resaleAllowed: null } })).platform.reason).toBe("model_resale_not_allowed");
  });

  it("requires verified commercial license for self-hosted/open-weight", () => {
    const d = evaluateServing(input({ provider: { integrationMode: "SELF_HOSTED" }, model: { commercialUse: null } }));
    expect(d.platform.reason).toBe("license_not_verified_for_commercial_use");
    expect(evaluateServing(input({ provider: { integrationMode: "OPEN_WEIGHT" } })).platform.eligible).toBe(true);
  });

  it("requires model verification for platform funding but allows BYOK for models under review", () => {
    const d = evaluateServing(input({ model: { verificationStatus: "NEEDS_REVIEW" }, rest: { hasByokCredential: true } }));
    expect(d.platform.reason).toBe("model_not_verified");
    expect(d.byok.eligible).toBe(true);
  });

  it("rejects disabled providers, endpoints and models for both modes", () => {
    expect(evaluateServing(input({ provider: { enabled: false } })).byok.reason).toBe("provider_disabled");
    expect(evaluateServing(input({ rest: { endpointEnabled: false } })).platform.reason).toBe("endpoint_disabled");
    expect(evaluateServing(input({ model: { status: "DISABLED" } })).platform.reason).toBe("model_disabled");
  });

  it("requires enterprise agreements for custom enterprise providers", () => {
    const p = { integrationMode: "CUSTOM_ENTERPRISE" as const };
    expect(evaluateServing(input({ provider: p })).platform.reason).toBe("enterprise_agreement_required");
    expect(evaluateServing(input({ provider: p, rest: { orgEnterpriseProviders: ["acme"] } })).platform.eligible).toBe(true);
  });

  it("requires price and platform credential", () => {
    expect(evaluateServing(input({ rest: { hasActivePrice: false } })).platform.reason).toBe("price_not_configured");
    expect(evaluateServing(input({ provider: { hasPlatformCredential: false } })).platform.reason).toBe(
      "platform_credential_missing",
    );
  });

  it("refuses mock/dev-only models in production", () => {
    expect(evaluateServing(input({ model: { isDevOnly: true } })).platform.reason).toBe("dev_only_model");
    expect(evaluateServing(input({ model: { isDevOnly: true }, rest: { environment: "development" } })).platform.eligible).toBe(true);
  });

  it("gates beta models behind a flag", () => {
    expect(evaluateServing(input({ model: { status: "BETA" } })).platform.reason).toBe("beta_models_disabled");
    expect(evaluateServing(input({ model: { status: "BETA" }, rest: { flags: { betaModels: true } } })).platform.eligible).toBe(true);
  });

  it("respects the BYOK feature flag", () => {
    expect(evaluateServing(input({ rest: { hasByokCredential: true, flags: { byok: false } } })).byok.reason).toBe("byok_disabled");
  });
});
