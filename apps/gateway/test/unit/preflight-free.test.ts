import { describe, expect, it, vi } from "vitest";
import type { RouteCandidate } from "@inrent/core";

const spend = { balanceNano: 0n, keyTotalNano: 0n, projectMonthNano: 0n, orgMonthNano: 0n };
vi.mock("@inrent/services", () => ({ getSpendState: async () => spend }));

const { preflight } = await import("../../src/pipeline/preflight");

const auth = { organizationId: "o", projectId: "p", keyId: "k", keySpendLimitNano: null, projectBudgetNano: null, orgMonthlyCapNano: null } as never;
const deps = { env: { BYOK_FEE_PCT: "0" } } as never;
const price = (input: string, output: string) => ({ inputPerMTok: input, outputPerMTok: output, platformMarkupPct: "5.5" });

const free = { endpointId: "free", billingMode: "PLATFORM", inputPicoPerToken: 0n, outputPicoPerToken: 0n } as RouteCandidate;
const paid = { endpointId: "paid", billingMode: "PLATFORM", inputPicoPerToken: 1_000_000n, outputPicoPerToken: 2_000_000n } as RouteCandidate;
const byok = { endpointId: "byok", billingMode: "BYOK", inputPicoPerToken: null, outputPicoPerToken: null } as RouteCandidate;
const meta = new Map<string, never>([
  ["free", { price: price("0", "0") } as never],
  ["paid", { price: price("1", "2") } as never],
]);

describe("preflight with an empty balance", () => {
  it("serves a free model", async () => {
    const r = await preflight(auth, [free], meta, 100, 512, deps);
    expect(r.ranked).toEqual([free]);
  });

  it("still blocks a paid model", async () => {
    await expect(preflight(auth, [paid], meta, 100, 512, deps)).rejects.toMatchObject({ code: "insufficient_credits" });
  });

  it("drops paid routes but keeps free and BYOK fallbacks", async () => {
    const r = await preflight(auth, [paid, free, byok], meta, 100, 512, deps);
    expect(r.ranked).toEqual([free, byok]);
  });
});
