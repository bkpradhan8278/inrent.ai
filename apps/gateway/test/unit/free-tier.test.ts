import { describe, expect, it } from "vitest";
import { MemoryRateLimitStore, type RouteCandidate } from "@inrent/core";
import { enforceFreeTierQuota, freeTierDailyLimit, isFreeCandidate } from "../../src/pipeline/freeTier";
import type { GatewayAuth } from "../../src/types";

const auth = { organizationId: "org-1" } as GatewayAuth;
const free = { billingMode: "PLATFORM", inputPicoPerToken: 0n, outputPicoPerToken: 0n } as RouteCandidate;
const paid = { billingMode: "PLATFORM", inputPicoPerToken: 150n, outputPicoPerToken: 600n } as RouteCandidate;

function deps(start: number) {
  let now = start;
  const scopes: string[] = [];
  return {
    d: { rateLimitStore: new MemoryRateLimitStore(), metrics: { rateLimited: { inc: (l: { scope: string }) => scopes.push(l.scope) } }, now: () => now } as never,
    advance: (ms: number) => (now += ms),
    scopes,
  };
}

describe("free tier daily quota", () => {
  it("allows the limit, then rejects with a 429 that says when it resets", async () => {
    const { d, scopes } = deps(Date.UTC(2026, 9, 7, 12));
    for (let i = 0; i < 10; i++) await enforceFreeTierQuota(auth, free, d, 10);
    const err = await enforceFreeTierQuota(auth, free, d, 10).catch((e) => e);
    expect(err.status).toBe(429);
    expect(err.code).toBe("free_tier_limit_exceeded");
    expect(Number(err.headers["retry-after"])).toBe(12 * 3600);
    expect(scopes).toEqual(["free_tier:daily"]);
  });

  it("resets at midnight UTC", async () => {
    const { d, advance } = deps(Date.UTC(2026, 9, 7, 23, 59));
    for (let i = 0; i < 10; i++) await enforceFreeTierQuota(auth, free, d, 10);
    await expect(enforceFreeTierQuota(auth, free, d, 10)).rejects.toMatchObject({ status: 429 });
    advance(2 * 60_000);
    await expect(enforceFreeTierQuota(auth, free, d, 10)).resolves.toBeUndefined();
  });

  it("never counts paid routes, BYOK routes, or anything when the limit is 0", async () => {
    const { d } = deps(Date.UTC(2026, 9, 7));
    for (let i = 0; i < 20; i++) await enforceFreeTierQuota(auth, paid, d, 1);
    for (let i = 0; i < 20; i++) await enforceFreeTierQuota(auth, { ...free, billingMode: "BYOK" }, d, 1);
    for (let i = 0; i < 20; i++) await enforceFreeTierQuota(auth, free, d, 0);
    expect(isFreeCandidate({ ...free, outputPicoPerToken: null })).toBe(false);
  });

  it("keeps organizations separate", async () => {
    const { d } = deps(Date.UTC(2026, 9, 7));
    await enforceFreeTierQuota(auth, free, d, 1);
    await expect(enforceFreeTierQuota({ organizationId: "org-2" } as GatewayAuth, free, d, 1)).resolves.toBeUndefined();
  });

  it("reads the limit from the environment with a safe default", () => {
    expect(freeTierDailyLimit(undefined)).toBe(10);
    expect(freeTierDailyLimit("25")).toBe(25);
    expect(freeTierDailyLimit("0")).toBe(0);
    expect(freeTierDailyLimit("lots")).toBe(10);
  });
});
