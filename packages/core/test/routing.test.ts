import { describe, expect, it } from "vitest";
import { rankCandidates, type RouteCandidate, type RouteInput } from "../src/routing";

function candidate(overrides: Partial<RouteCandidate> & { providerSlug: string }): RouteCandidate {
  return {
    endpointId: `ep-${overrides.providerSlug}`,
    modelId: "m1",
    modelSlug: "vendor/model",
    providerId: `p-${overrides.providerSlug}`,
    providerModelId: "model",
    billingMode: "PLATFORM",
    endpointPriority: 100,
    providerPriority: 100,
    health: "HEALTHY",
    latencyP50Ms: 800,
    ttftP50Ms: null,
    inputPicoPerToken: 1_000_000n,
    outputPicoPerToken: 2_000_000n,
    qualityTier: 3,
    contextLength: 128_000,
    supports: { tools: true, vision: false, jsonMode: true, structuredOutput: false, streaming: true },
    ...overrides,
  };
}

const base: RouteInput = {
  policy: "BALANCED",
  requirements: {},
  estimatedInputTokens: 1_000,
  estimatedOutputTokens: 500,
};

describe("routing engine", () => {
  const cheap = candidate({ providerSlug: "cheap", inputPicoPerToken: 100_000n, outputPicoPerToken: 200_000n, latencyP50Ms: 2_000 });
  const fast = candidate({ providerSlug: "fast", inputPicoPerToken: 3_000_000n, outputPicoPerToken: 6_000_000n, latencyP50Ms: 200 });
  const mid = candidate({ providerSlug: "mid" });

  it("orders by cost for LOWEST_COST", () => {
    const d = rankCandidates([fast, mid, cheap], { ...base, policy: "LOWEST_COST" });
    expect(d.ranked.map((c) => c.providerSlug)).toEqual(["cheap", "mid", "fast"]);
  });

  it("orders by latency for LOWEST_LATENCY", () => {
    const d = rankCandidates([cheap, mid, fast], { ...base, policy: "LOWEST_LATENCY" });
    expect(d.ranked[0]?.providerSlug).toBe("fast");
  });

  it("orders by quality for BEST_QUALITY", () => {
    const best = candidate({ providerSlug: "best", qualityTier: 5, inputPicoPerToken: 9_000_000n });
    const d = rankCandidates([cheap, best, fast], { ...base, policy: "BEST_QUALITY" });
    expect(d.ranked[0]?.providerSlug).toBe("best");
  });

  it("excludes providers that are down and records why", () => {
    const down = candidate({ providerSlug: "down", health: "DOWN", inputPicoPerToken: 1n });
    const d = rankCandidates([down, mid], base);
    expect(d.ranked.map((c) => c.providerSlug)).toEqual(["mid"]);
    expect(d.rejected).toContainEqual(expect.objectContaining({ providerSlug: "down", reason: "provider_down" }));
  });

  it("penalizes degraded providers", () => {
    const degraded = candidate({ providerSlug: "degraded", health: "DEGRADED", inputPicoPerToken: 1n, outputPicoPerToken: 1n });
    const d = rankCandidates([degraded, mid], { ...base, policy: "LOWEST_COST" });
    expect(d.ranked[0]?.providerSlug).toBe("mid");
  });

  it("filters by capability requirements", () => {
    const vision = candidate({ providerSlug: "vision", supports: { ...mid.supports, vision: true } });
    const d = rankCandidates([mid, vision], { ...base, requirements: { vision: true } });
    expect(d.ranked.map((c) => c.providerSlug)).toEqual(["vision"]);
    expect(d.rejected[0]?.reason).toBe("vision_not_supported");
  });

  it("filters by context length", () => {
    const small = candidate({ providerSlug: "small", contextLength: 1_000 });
    const d = rankCandidates([small, mid], base);
    expect(d.ranked.map((c) => c.providerSlug)).toEqual(["mid"]);
  });

  it("honours provider order, only and ignore preferences", () => {
    const d1 = rankCandidates([cheap, mid, fast], { ...base, policy: "LOWEST_COST", preferences: { order: ["fast"] } });
    expect(d1.ranked[0]?.providerSlug).toBe("fast");
    const d2 = rankCandidates([cheap, mid, fast], { ...base, preferences: { only: ["mid"] } });
    expect(d2.ranked.map((c) => c.providerSlug)).toEqual(["mid"]);
    const d3 = rankCandidates([cheap, mid, fast], { ...base, preferences: { ignore: ["cheap", "fast"] } });
    expect(d3.ranked.map((c) => c.providerSlug)).toEqual(["mid"]);
  });

  it("disables fallbacks when requested and caps attempts", () => {
    const d = rankCandidates([cheap, mid, fast], { ...base, preferences: { allowFallbacks: false } });
    expect(d.ranked).toHaveLength(1);
    const many = Array.from({ length: 6 }, (_, i) => candidate({ providerSlug: `p${i}` }));
    expect(rankCandidates(many, base).ranked).toHaveLength(3);
  });

  it("prefers BYOK endpoints when requested", () => {
    const byok = candidate({ providerSlug: "byok", billingMode: "BYOK", inputPicoPerToken: 9_000_000n });
    const d = rankCandidates([cheap, byok], { ...base, policy: "LOWEST_COST", preferences: { preferByok: true } });
    expect(d.ranked[0]?.providerSlug).toBe("byok");
  });

  it("is deterministic for ties", () => {
    const a = candidate({ providerSlug: "a" });
    const b = candidate({ providerSlug: "b" });
    expect(rankCandidates([b, a], base).ranked.map((c) => c.providerSlug)).toEqual(["a", "b"]);
    expect(rankCandidates([a, b], base).ranked.map((c) => c.providerSlug)).toEqual(["a", "b"]);
  });
});
