import { describe, expect, it } from "vitest";
import { formatContext, formatMs, formatPerMillion, formatUsdString } from "@/lib/format";

describe("formatters", () => {
  it("formats USD without float artefacts and with precision for tiny amounts", () => {
    expect(formatUsdString("25.000000")).toBe("$25.00");
    expect(formatUsdString("0.000004")).toBe("$0.000004");
    expect(formatUsdString("-1.5")).toBe("-$1.50");
    expect(formatUsdString(null)).toBe("—");
  });

  it("formats per-million prices exactly from decimal strings", () => {
    expect(formatPerMillion("3.000000")).toBe("$3");
    expect(formatPerMillion("0.150000")).toBe("$0.15");
    expect(formatPerMillion(null)).toBeNull();
  });

  it("formats latency and context", () => {
    expect(formatMs(845)).toBe("845ms");
    expect(formatMs(2350)).toBe("2.35s");
    expect(formatMs(null)).toBe("—");
    expect(formatContext(131072)).toBe("128K");
    expect(formatContext(1048576)).toBe("1M");
    expect(formatContext(null)).toBeNull();
  });
});
