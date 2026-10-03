import { describe, expect, it } from "vitest";
import { centsToNano, formatPerMillion, formatUsd, nanoToUsdString, parseDecimalScaled, usdToNano } from "../src/money";

describe("money", () => {
  it("parses decimals exactly", () => {
    expect(parseDecimalScaled("0.15", 6)).toBe(150_000n);
    expect(parseDecimalScaled("3", 6)).toBe(3_000_000n);
    expect(parseDecimalScaled("0.000001", 6)).toBe(1n);
    expect(parseDecimalScaled("-1.5", 3)).toBe(-1500n);
    expect(parseDecimalScaled("1.2000000", 3)).toBe(1200n);
  });

  it("refuses precision loss and garbage", () => {
    expect(() => parseDecimalScaled("0.0000001", 6)).toThrow();
    expect(() => parseDecimalScaled("1e5", 2)).toThrow();
    expect(() => parseDecimalScaled("abc", 2)).toThrow();
  });

  it("converts usd and cents to nano", () => {
    expect(usdToNano("1")).toBe(1_000_000_000n);
    expect(usdToNano(25)).toBe(25_000_000_000n);
    expect(centsToNano(500)).toBe(5_000_000_000n);
  });

  it("formats nano to usd strings with rounding", () => {
    expect(nanoToUsdString(1_234_567_890n)).toBe("1.23");
    expect(nanoToUsdString(1_235_000_000n)).toBe("1.24");
    expect(nanoToUsdString(-5_000_000_000n)).toBe("-5.00");
    expect(formatUsd(1_234_500_000_000n)).toBe("$1,234.50");
    expect(formatUsd(412_000n)).toBe("$0.000412");
    expect(formatUsd(0n)).toBe("$0.00");
  });

  it("formats per-million prices", () => {
    expect(formatPerMillion("0.15")).toBe("$0.15");
    expect(formatPerMillion("2.5")).toBe("$2.5");
    expect(formatPerMillion("0.0375")).toBe("$0.0375");
    expect(formatPerMillion(null)).toBeNull();
  });
});
