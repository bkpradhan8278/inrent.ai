import type { Redis } from "ioredis";
import type { KV } from "./types";

export class RedisKV implements KV {
  constructor(private readonly redis: Redis) {}
  async get(key: string) {
    return this.redis.get(key);
  }
  async set(key: string, value: string, ttlSeconds: number) {
    await this.redis.set(key, value, "EX", ttlSeconds);
  }
  async setNx(key: string, value: string, ttlSeconds: number) {
    return (await this.redis.set(key, value, "EX", ttlSeconds, "NX")) === "OK";
  }
  async del(key: string) {
    await this.redis.del(key);
  }
}

export class MemoryKV implements KV {
  private readonly data = new Map<string, { value: string; expiresAt: number }>();
  async get(key: string) {
    const e = this.data.get(key);
    if (!e) return null;
    if (e.expiresAt < Date.now()) {
      this.data.delete(key);
      return null;
    }
    return e.value;
  }
  async set(key: string, value: string, ttlSeconds: number) {
    this.data.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  async setNx(key: string, value: string, ttlSeconds: number) {
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value, ttlSeconds);
    return true;
  }
  async del(key: string) {
    this.data.delete(key);
  }
}
