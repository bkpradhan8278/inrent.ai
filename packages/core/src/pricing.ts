import { ceilDiv, parseDecimalScaled } from "./money";

/**
 * Pricing engine.
 *
 * Catalog prices are USD per 1M tokens (decimal strings, up to 6 fractional digits).
 * Internally: $X per 1M tokens == X × 10^6 pico-USD per token, so all token math is exact
 * BigInt arithmetic in pico-USD, rounded UP to nano-USD once at the end.
 *
 *   provider_cost = Σ(tokens × provider_rate) × provider_cost_multiplier
 *   user_charge   = provider_cost × (1 + markup%)            (platform-funded)
 *   user_charge   = list_cost × byok_fee%                     (BYOK — customer pays provider)
 *   gross_margin  = user_charge − provider_cost
 */

export interface PriceConfig {
  inputPerMTok: string | null;
  outputPerMTok: string | null;
  cachedInputPerMTok?: string | null;
  reasoningPerMTok?: string | null;
  perImage?: string | null;
  perRequest?: string | null;
  platformMarkupPct: string;
}

export interface UsageInput {
  inputTokens: number;
  outputTokens: number;
  cachedTokens?: number;
  reasoningTokens?: number;
  images?: number;
  requests?: number;
}

export type BillingMode = "PLATFORM" | "BYOK";

export interface CostBreakdown {
  /** What INRENT pays the provider (0 for BYOK). */
  providerCostNano: bigint;
  /** What the customer is charged by INRENT. */
  userChargeNano: bigint;
  marginNano: bigint;
  /** For BYOK: estimated list cost the customer pays the provider directly. */
  listCostNano: bigint;
}

export class PricingNotConfiguredError extends Error {
  constructor(field: string) {
    super(`Price '${field}' is not configured for this endpoint`);
    this.name = "PricingNotConfiguredError";
  }
}

const PICO_PER_NANO = 1000n;

function rate(price: string | null | undefined, field: string, strict: boolean): bigint {
  if (price === null || price === undefined) {
    if (strict) throw new PricingNotConfiguredError(field);
    return 0n;
  }
  return parseDecimalScaled(price, 6);
}

function nonNeg(n: number | undefined): bigint {
  if (!n || n < 0 || !Number.isFinite(n)) return 0n;
  return BigInt(Math.floor(n));
}

/** Provider list cost in pico-USD for a usage record. */
export function listCostPico(price: PriceConfig, usage: UsageInput, strict = true): bigint {
  const input = nonNeg(usage.inputTokens);
  const output = nonNeg(usage.outputTokens);
  const cached = nonNeg(usage.cachedTokens) > input ? input : nonNeg(usage.cachedTokens);
  const reasoning = nonNeg(usage.reasoningTokens) > output ? output : nonNeg(usage.reasoningTokens);

  let pico = 0n;
  if (input > 0n) {
    const inRate = rate(price.inputPerMTok, "inputPerMTok", strict);
    const cachedRate =
      price.cachedInputPerMTok !== null && price.cachedInputPerMTok !== undefined
        ? parseDecimalScaled(price.cachedInputPerMTok, 6)
        : inRate;
    pico += (input - cached) * inRate + cached * cachedRate;
  }
  if (output > 0n) {
    const outRate = rate(price.outputPerMTok, "outputPerMTok", strict);
    if (price.reasoningPerMTok !== null && price.reasoningPerMTok !== undefined && reasoning > 0n) {
      pico += reasoning * parseDecimalScaled(price.reasoningPerMTok, 6) + (output - reasoning) * outRate;
    } else {
      pico += output * outRate;
    }
  }
  const images = nonNeg(usage.images);
  if (images > 0n) {
    pico += images * parseDecimalScaled(price.perImage ?? (strict ? missing("perImage") : "0"), 9) * PICO_PER_NANO;
  }
  if (price.perRequest) {
    const requests = usage.requests === undefined ? 1n : nonNeg(usage.requests);
    pico += requests * parseDecimalScaled(price.perRequest, 9) * PICO_PER_NANO;
  }
  return pico;
}

function missing(field: string): never {
  throw new PricingNotConfiguredError(field);
}

/** markupPct "5.5" → 5500 (thousandths of a percent). */
function markupMilli(pct: string): bigint {
  const m = parseDecimalScaled(pct, 3);
  if (m < 0n) throw new Error("Markup cannot be negative");
  return m;
}

export function applyMarkup(nano: bigint, markupPct: string): bigint {
  return ceilDiv(nano * (100_000n + markupMilli(markupPct)), 100_000n);
}

export function computeCost(
  price: PriceConfig,
  usage: UsageInput,
  opts: { billingMode: BillingMode; costMultiplier?: string; byokFeePct?: string },
): CostBreakdown {
  const strict = opts.billingMode === "PLATFORM";
  const multiplier = parseDecimalScaled(opts.costMultiplier ?? "1", 4);
  const pico = listCostPico(price, usage, strict);
  const listCostNano = ceilDiv(pico, PICO_PER_NANO);

  if (opts.billingMode === "BYOK") {
    const feeMilli = markupMilli(opts.byokFeePct ?? "0");
    const userChargeNano = feeMilli === 0n ? 0n : ceilDiv(listCostNano * feeMilli, 100_000n);
    return { providerCostNano: 0n, userChargeNano, marginNano: userChargeNano, listCostNano };
  }

  const providerCostNano = ceilDiv(pico * multiplier, PICO_PER_NANO * 10_000n);
  const userChargeNano = applyMarkup(listCostNano, price.platformMarkupPct);
  return {
    providerCostNano,
    userChargeNano,
    marginNano: userChargeNano - providerCostNano,
    listCostNano,
  };
}

/** Upper-bound estimate of a request's charge, used for pre-flight credit checks. */
export function estimateMaxCharge(
  price: PriceConfig,
  estimatedInputTokens: number,
  maxOutputTokens: number | null,
): bigint {
  const pico = listCostPico(
    { ...price, cachedInputPerMTok: null, reasoningPerMTok: null },
    { inputTokens: estimatedInputTokens, outputTokens: maxOutputTokens ?? 0 },
    false,
  );
  return applyMarkup(ceilDiv(pico, PICO_PER_NANO), price.platformMarkupPct);
}

/** Customer-facing price per 1M tokens (provider price × (1 + markup)), as a decimal string. */
export function customerPricePerMTok(providerPrice: string | null, markupPct: string): string | null {
  if (providerPrice === null) return null;
  const micro = parseDecimalScaled(providerPrice, 6);
  const withMarkup = ceilDiv(micro * (100_000n + markupMilli(markupPct)), 100_000n);
  const whole = withMarkup / 1_000_000n;
  const frac = (withMarkup % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : `${whole}`;
}

/** User price in pico-USD per token (for routing comparisons). */
export function picoPerToken(perMTok: string | null): bigint | null {
  return perMTok === null ? null : parseDecimalScaled(perMTok, 6);
}
