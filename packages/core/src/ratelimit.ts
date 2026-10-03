/**
 * Sliding-window rate limiting (two fixed windows, weighted). Accurate to within a few
 * percent, O(1) memory per key, and implementable atomically in Redis with one Lua script.
 * The Redis store lives in @inrent/services; this module defines the algorithm, rule
 * evaluation and response headers, plus an in-memory store for tests and single-node dev.
 */

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  /** Estimated usage in the sliding window after this hit (or current usage when rejected). */
  current: number;
  remaining: number;
  /** Milliseconds until the current fixed window rolls over. */
  resetMs: number;
  retryAfterMs: number;
}

export interface RateLimitStore {
  /** Atomically check and (if allowed) consume `cost` units. */
  hit(key: string, limit: number, windowMs: number, cost: number, now: number): Promise<RateLimitResult>;
  /** Record usage after the fact (e.g. tokens once a response completes). Never rejects. */
  add(key: string, windowMs: number, amount: number, now: number): Promise<void>;
}

export interface RateLimitRule {
  id: string;
  kind: "requests" | "tokens";
  key: string;
  limit: number;
  windowMs: number;
  /** Units consumed by this request (requests: 1; tokens: estimated input tokens). */
  cost: number;
}

export function slidingEstimate(prev: number, curr: number, windowMs: number, elapsedInWindow: number): number {
  const weight = Math.max(0, (windowMs - elapsedInWindow) / windowMs);
  return prev * weight + curr;
}

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly counters = new Map<string, { value: number; expiresAt: number }>();

  private get(key: string, now: number): number {
    const entry = this.counters.get(key);
    if (!entry) return 0;
    if (entry.expiresAt <= now) {
      this.counters.delete(key);
      return 0;
    }
    return entry.value;
  }

  private incr(key: string, amount: number, ttlMs: number, now: number): void {
    const value = this.get(key, now) + amount;
    this.counters.set(key, { value, expiresAt: now + ttlMs });
  }

  async hit(key: string, limit: number, windowMs: number, cost: number, now: number): Promise<RateLimitResult> {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const currKey = `${key}:${windowStart}`;
    const prevKey = `${key}:${windowStart - windowMs}`;
    const elapsed = now - windowStart;
    const estimate = slidingEstimate(this.get(prevKey, now), this.get(currKey, now), windowMs, elapsed);
    const resetMs = windowMs - elapsed;
    if (estimate + cost > limit) {
      return {
        allowed: false,
        limit,
        current: Math.ceil(estimate),
        remaining: Math.max(0, Math.floor(limit - estimate)),
        resetMs,
        retryAfterMs: Math.max(1000, resetMs),
      };
    }
    this.incr(currKey, cost, windowMs * 2, now);
    return {
      allowed: true,
      limit,
      current: Math.ceil(estimate + cost),
      remaining: Math.max(0, Math.floor(limit - estimate - cost)),
      resetMs,
      retryAfterMs: 0,
    };
  }

  async add(key: string, windowMs: number, amount: number, now: number): Promise<void> {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    this.incr(`${key}:${windowStart}`, amount, windowMs * 2, now);
  }
}

export interface RateLimitOutcome {
  allowed: boolean;
  violated?: RateLimitRule;
  results: Array<{ rule: RateLimitRule; result: RateLimitResult }>;
  headers: Record<string, string>;
}

/** Evaluates rules in order; stops at the first violation. */
export async function evaluateRateLimits(
  store: RateLimitStore,
  rules: RateLimitRule[],
  now: number = Date.now(),
): Promise<RateLimitOutcome> {
  const results: RateLimitOutcome["results"] = [];
  for (const rule of rules) {
    if (rule.limit <= 0) continue;
    const result = await store.hit(rule.key, rule.limit, rule.windowMs, rule.cost, now);
    results.push({ rule, result });
    if (!result.allowed) {
      return { allowed: false, violated: rule, results, headers: rateLimitHeaders(results, rule) };
    }
  }
  return { allowed: true, results, headers: rateLimitHeaders(results) };
}

function fmtSeconds(ms: number): string {
  return `${Math.max(0, Math.ceil(ms / 1000))}s`;
}

/** OpenAI-style headers, reporting the tightest request and token rules. */
export function rateLimitHeaders(
  results: Array<{ rule: RateLimitRule; result: RateLimitResult }>,
  violated?: RateLimitRule,
): Record<string, string> {
  const headers: Record<string, string> = {};
  const tightest = (kind: "requests" | "tokens") =>
    results
      .filter((r) => r.rule.kind === kind)
      .sort((a, b) => a.result.remaining / a.result.limit - b.result.remaining / b.result.limit)[0];
  for (const kind of ["requests", "tokens"] as const) {
    const t = tightest(kind);
    if (!t) continue;
    headers[`x-ratelimit-limit-${kind}`] = String(t.result.limit);
    headers[`x-ratelimit-remaining-${kind}`] = String(t.result.remaining);
    headers[`x-ratelimit-reset-${kind}`] = fmtSeconds(t.result.resetMs);
  }
  if (violated) {
    const v = results.find((r) => r.rule === violated);
    if (v) {
      headers["retry-after"] = String(Math.ceil(v.result.retryAfterMs / 1000));
      headers["x-ratelimit-scope"] = violated.id;
    }
  }
  return headers;
}
