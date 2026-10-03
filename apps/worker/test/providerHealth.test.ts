import { describe, expect, it } from "vitest";
import { deriveStatus } from "../src/jobs/providerHealth";

const ok = (latencyMs = 200) => ({ ok: true, latencyMs });
const fail = { ok: false, latencyMs: null };
const quiet = { total: 0, upstreamErrors: 0 };

describe("provider health derivation", () => {
  it("is unknown without data and healthy with good probes", () => {
    expect(deriveStatus([], quiet)).toBe("UNKNOWN");
    expect(deriveStatus([ok(), ok(), ok()], quiet)).toBe("HEALTHY");
  });
  it("marks down after three consecutive failed probes", () => {
    expect(deriveStatus([fail, fail, fail, ok()], quiet)).toBe("DOWN");
  });
  it("marks degraded on intermittent failures, slow probes or elevated traffic errors", () => {
    expect(deriveStatus([ok(), fail, ok()], quiet)).toBe("DEGRADED");
    expect(deriveStatus([ok(9000), ok(9000), ok(9000)], quiet)).toBe("DEGRADED");
    expect(deriveStatus([ok(), ok()], { total: 20, upstreamErrors: 8 })).toBe("DEGRADED");
  });
  it("marks down when all recent real traffic fails upstream", () => {
    expect(deriveStatus([ok()], { total: 12, upstreamErrors: 12 })).toBe("DOWN");
  });
});
