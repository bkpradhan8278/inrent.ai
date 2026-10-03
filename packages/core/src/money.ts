/**
 * Money is represented as BigInt nano-USD (1 USD = 1e9 nano) everywhere money moves.
 * Catalog prices are decimal strings (USD per 1M tokens) and are converted with exact
 * integer arithmetic — never floating point.
 */

export const NANO_PER_USD = 1_000_000_000n;
export const NANO_PER_CENT = 10_000_000n;

const DECIMAL_RE = /^-?\d+(\.\d+)?$/;

/** Parses a decimal string and returns value × 10^scale as a BigInt (truncating extra digits is refused). */
export function parseDecimalScaled(value: string | number, scale: number): bigint {
  const str = typeof value === "number" ? numberToPlainString(value) : value.trim();
  if (!DECIMAL_RE.test(str)) {
    throw new Error(`Invalid decimal value: ${String(value)}`);
  }
  const negative = str.startsWith("-");
  const unsigned = negative ? str.slice(1) : str;
  const [whole = "0", frac = ""] = unsigned.split(".");
  if (frac.length > scale) {
    const extra = frac.slice(scale);
    if (/[1-9]/.test(extra)) {
      throw new Error(`Decimal ${str} has more than ${scale} significant fractional digits`);
    }
  }
  const fracPadded = (frac + "0".repeat(scale)).slice(0, scale);
  const result = BigInt(whole) * 10n ** BigInt(scale) + BigInt(fracPadded || "0");
  return negative ? -result : result;
}

function numberToPlainString(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Invalid number: ${n}`);
  // Avoid exponent notation for small/large numbers.
  const s = n.toString();
  if (!/e/i.test(s)) return s;
  return n.toFixed(12).replace(/0+$/, "").replace(/\.$/, "");
}

export function usdToNano(usd: string | number): bigint {
  return parseDecimalScaled(usd, 9);
}

export function centsToNano(cents: number | bigint): bigint {
  return BigInt(cents) * NANO_PER_CENT;
}

/** Converts nano-USD to a fixed decimal USD string, rounding half away from zero. */
export function nanoToUsdString(nano: bigint, decimals = 2): string {
  const negative = nano < 0n;
  const abs = negative ? -nano : nano;
  const scale = 10n ** BigInt(9 - decimals);
  let rounded = abs / scale;
  if ((abs % scale) * 2n >= scale) rounded += 1n;
  const base = 10n ** BigInt(decimals);
  const whole = rounded / base;
  const frac = (rounded % base).toString().padStart(decimals, "0");
  const body = decimals > 0 ? `${whole}.${frac}` : `${whole}`;
  return negative && rounded !== 0n ? `-${body}` : body;
}

/** Human formatting: "$12.34", small amounts keep more precision ("$0.000412"). */
export function formatUsd(nano: bigint, opts: { precise?: boolean } = {}): string {
  const abs = nano < 0n ? -nano : nano;
  let decimals = 2;
  if (opts.precise || (abs > 0n && abs < 10_000_000n)) decimals = 6;
  const s = nanoToUsdString(nano, decimals);
  const [whole, frac] = s.replace("-", "").split(".");
  const grouped = (whole ?? "0").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const sign = s.startsWith("-") ? "-" : "";
  return `${sign}$${grouped}${frac !== undefined ? `.${frac}` : ""}`;
}

/** Ceil division for non-negative bigints. */
export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error("Division by non-positive bigint");
  if (a <= 0n) return a / b;
  return (a + b - 1n) / b;
}

export function maxBigInt(...values: bigint[]): bigint {
  return values.reduce((m, v) => (v > m ? v : m));
}

export function minBigInt(...values: bigint[]): bigint {
  return values.reduce((m, v) => (v < m ? v : m));
}

/** Formats a price expressed in USD per 1M tokens for display, e.g. "$0.15". Exact — no float rounding. */
export function formatPerMillion(price: string | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const str = String(price).trim();
  if (!DECIMAL_RE.test(str)) return null;
  const [whole = "0", frac = ""] = str.split(".");
  const trimmed = frac.replace(/0+$/, "");
  const wholeNorm = whole.replace(/^(-?)0+(?=\d)/, "$1");
  return trimmed ? `$${wholeNorm}.${trimmed}` : `$${wholeNorm}`;
}
