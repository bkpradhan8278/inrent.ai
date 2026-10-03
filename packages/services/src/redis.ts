import { Redis } from "ioredis";
import type { RateLimitResult, RateLimitStore } from "@inrent/core";
import { getServerEnv } from "./env";

let client: Redis | null = null;

export function getRedis(): Redis {
  client ??= new Redis(getServerEnv().REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  return client;
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit().catch(() => client?.disconnect());
    client = null;
  }
}

/**
 * Atomic sliding-window check-and-consume (see @inrent/core/ratelimit for the algorithm).
 * KEYS[1]=current window key, KEYS[2]=previous window key
 * ARGV: limit, windowMs, cost, elapsedMs
 */
const HIT_SCRIPT = `
local curr = tonumber(redis.call('GET', KEYS[1]) or '0')
local prev = tonumber(redis.call('GET', KEYS[2]) or '0')
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local cost = tonumber(ARGV[3])
local elapsed = tonumber(ARGV[4])
local weight = (window - elapsed) / window
if weight < 0 then weight = 0 end
local estimate = prev * weight + curr
if estimate + cost > limit then
  return {0, tostring(estimate)}
end
redis.call('INCRBY', KEYS[1], cost)
redis.call('PEXPIRE', KEYS[1], window * 2)
return {1, tostring(estimate + cost)}
`;

export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis = getRedis()) {}

  async hit(key: string, limit: number, windowMs: number, cost: number, now: number): Promise<RateLimitResult> {
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const elapsed = now - windowStart;
    const res = (await this.redis.eval(
      HIT_SCRIPT,
      2,
      `${key}:${windowStart}`,
      `${key}:${windowStart - windowMs}`,
      limit,
      windowMs,
      Math.max(0, Math.ceil(cost)),
      elapsed,
    )) as [number, string];
    const allowed = res[0] === 1;
    const current = Number(res[1]);
    const resetMs = windowMs - elapsed;
    return {
      allowed,
      limit,
      current: Math.ceil(current),
      remaining: Math.max(0, Math.floor(limit - current)),
      resetMs,
      retryAfterMs: allowed ? 0 : Math.max(1000, resetMs),
    };
  }

  async add(key: string, windowMs: number, amount: number, now: number): Promise<void> {
    if (amount <= 0) return;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const k = `${key}:${windowStart}`;
    await this.redis.multi().incrby(k, Math.ceil(amount)).pexpire(k, windowMs * 2).exec();
  }
}

export const CACHE_KEYS = {
  apiKey: (hash: string) => `inrent:apikey:${hash}`,
  catalogVersion: "inrent:catalog:version",
} as const;
