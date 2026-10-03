import { describe, expect, it } from "vitest";
import {
  applyMarkup,
  computeCost,
  customerPricePerMTok,
  estimateMaxCharge,
  listCostPico,
  PricingNotConfiguredError,
  type PriceConfig,
} from "../src/pricing";

const price: PriceConfig = {
  inputPerMTok: "0.15",
  outputPerMTok: "0.60",
  cachedInputPerMTok: "0.075",
  platformMarkupPct: "5.5",
};

describe("pricing engine", () => {
  it("computes exact provider cost in pico-USD", () => {
    // 1M input tokens at $0.15 = $0.15 = 150_000_000 nano = 1.5e11 pico
    expect(listCostPico(price, { inputTokens: 1_000_000, outputTokens: 0 })).toBe(150_000_000_000n);
    // 1 output token at $0.60/M = 0.6 micro = 600_000 pico
    expect(listCostPico(price, { inputTokens: 0, outputTokens: 1 })).toBe(600_000n);
  });

  it("charges cached tokens at the cached rate", () => {
    const pico = listCostPico(price, { inputTokens: 1_000, outputTokens: 0, cachedTokens: 400 });
    // 600 × 150_000 + 400 × 75_000
    expect(pico).toBe(600n * 150_000n + 400n * 75_000n);
  });

  it("applies markup and computes margin for platform-funded requests", () => {
    const cost = computeCost(price, { inputTokens: 1_000_000, outputTokens: 1_000_000 }, { billingMode: "PLATFORM" });
    // provider: $0.75 → 750_000_000 nano; user: × 1.055 = 791_250_000
    expect(cost.providerCostNano).toBe(750_000_000n);
    expect(cost.userChargeNano).toBe(791_250_000n);
    expect(cost.marginNano).toBe(41_250_000n);
  });

  it("rounds charges up to the next nano-USD", () => {
    const tiny: PriceConfig = { inputPerMTok: "0.0001", outputPerMTok: "0", platformMarkupPct: "5.5" };
    const cost = computeCost(tiny, { inputTokens: 1, outputTokens: 0 }, { billingMode: "PLATFORM" });
    // $0.0001/M → 100 pico/token = 0.1 nano → ceil → 1 nano provider; user ceil(1 × 1.055) = 2
    expect(cost.providerCostNano).toBe(1n);
    expect(cost.userChargeNano).toBe(2n);
    // $0.15/M → 150 nano per token exactly
    expect(computeCost(price, { inputTokens: 1, outputTokens: 0 }, { billingMode: "PLATFORM" }).providerCostNano).toBe(150n);
  });

  it("applies provider cost multipliers to provider cost only", () => {
    const cost = computeCost(
      price,
      { inputTokens: 1_000_000, outputTokens: 0 },
      { billingMode: "PLATFORM", costMultiplier: "0.8" },
    );
    expect(cost.providerCostNano).toBe(120_000_000n);
    expect(cost.userChargeNano).toBe(158_250_000n);
    expect(cost.marginNano).toBe(38_250_000n);
  });

  it("charges only the BYOK fee for BYOK requests", () => {
    const noFee = computeCost(price, { inputTokens: 1_000_000, outputTokens: 0 }, { billingMode: "BYOK" });
    expect(noFee.providerCostNano).toBe(0n);
    expect(noFee.userChargeNano).toBe(0n);
    expect(noFee.listCostNano).toBe(150_000_000n);
    const fee = computeCost(price, { inputTokens: 1_000_000, outputTokens: 0 }, { billingMode: "BYOK", byokFeePct: "5" });
    expect(fee.userChargeNano).toBe(7_500_000n);
  });

  it("refuses platform billing without configured prices", () => {
    expect(() =>
      computeCost({ inputPerMTok: null, outputPerMTok: null, platformMarkupPct: "0" }, { inputTokens: 10, outputTokens: 10 }, { billingMode: "PLATFORM" }),
    ).toThrow(PricingNotConfiguredError);
  });

  it("supports per-image and per-request prices", () => {
    const imgPrice: PriceConfig = { inputPerMTok: null, outputPerMTok: null, perImage: "0.04", platformMarkupPct: "0" };
    const cost = computeCost(imgPrice, { inputTokens: 0, outputTokens: 0, images: 2 }, { billingMode: "PLATFORM" });
    expect(cost.userChargeNano).toBe(80_000_000n);
  });

  it("estimates max charge with markup", () => {
    expect(estimateMaxCharge(price, 1_000_000, 1_000_000)).toBe(791_250_000n);
    expect(estimateMaxCharge(price, 0, null)).toBe(0n);
  });

  it("computes customer-facing per-million prices", () => {
    expect(customerPricePerMTok("0.15", "5.5")).toBe("0.15825");
    expect(customerPricePerMTok("2", "0")).toBe("2");
    expect(customerPricePerMTok(null, "5")).toBeNull();
    expect(applyMarkup(1000n, "10")).toBe(1100n);
  });
});
