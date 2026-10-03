import { describe, expect, it } from "vitest";
import { evaluateRateLimits, MemoryRateLimitStore, slidingEstimate } from "../src/ratelimit";

describe("rate limiting", () => {
  it("computes the sliding estimate", () => {
    expect(slidingEstimate(10, 5, 60_000, 30_000)).toBe(10);
    expect(slidingEstimate(10, 5, 60_000, 60_000)).toBe(5);
  });

  it("allows up to the limit and then rejects with retry info", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000_000_000;
    for (let i = 0; i < 3; i++) {
      expect((await store.hit("k", 3, 60_000, 1, now + i)).allowed).toBe(true);
    }
    const blocked = await store.hit("k", 3, 60_000, 1, now + 10);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("does not count rejected requests (no self-inflicted lockout)", async () => {
    const store = new MemoryRateLimitStore();
    const now = 1_000_000_020_000;
    await store.hit("k", 1, 1_000, 1, now);
    for (let i = 0; i < 5; i++) await store.hit("k", 1, 1_000, 1, now + 1);
    // two windows later everything has decayed
    expect((await store.hit("k", 1, 1_000, 1, now + 2_500)).allowed).toBe(true);
  });

  it("cannot be bypassed by spreading across the window boundary", async () => {
    const store = new MemoryRateLimitStore();
    const windowStart = 1_000_000_020_000 - (1_000_000_020_000 % 60_000);
    for (let i = 0; i < 10; i++) await store.hit("b", 10, 60_000, 1, windowStart + 59_000);
    // Immediately after the boundary, the previous window still weighs ~98%.
    expect((await store.hit("b", 10, 60_000, 1, windowStart + 60_500)).allowed).toBe(false);
  });

  it("evaluates multiple rules and reports headers", async () => {
    const store = new MemoryRateLimitStore();
    const rules = [
      { id: "key:rpm", kind: "requests" as const, key: "rl:key", limit: 5, windowMs: 60_000, cost: 1 },
      { id: "key:tpm", kind: "tokens" as const, key: "rl:key:tok", limit: 1_000, windowMs: 60_000, cost: 400 },
    ];
    const now = 2_000_000_000_000;
    const first = await evaluateRateLimits(store, rules, now);
    expect(first.allowed).toBe(true);
    expect(first.headers["x-ratelimit-limit-requests"]).toBe("5");
    expect(first.headers["x-ratelimit-remaining-tokens"]).toBe("600");
    await evaluateRateLimits(store, rules, now + 1);
    const third = await evaluateRateLimits(store, rules, now + 2);
    expect(third.allowed).toBe(false);
    expect(third.violated?.id).toBe("key:tpm");
    expect(third.headers["retry-after"]).toBeDefined();
  });

  it("records post-hoc token usage", async () => {
    const store = new MemoryRateLimitStore();
    const now = 3_000_000_000_000;
    await store.add("t", 60_000, 900, now);
    expect((await store.hit("t", 1_000, 60_000, 200, now + 1)).allowed).toBe(false);
  });
});
