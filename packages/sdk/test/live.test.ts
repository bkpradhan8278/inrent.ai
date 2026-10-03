import { beforeAll, describe, expect, it } from "vitest";
import { Inrent, InrentError } from "../src";

/**
 * Optional end-to-end checks against a running gateway (local dev with the mock provider).
 * Run with: INRENT_LIVE_API_KEY=sk-inrent-dev-… INRENT_LIVE_BASE_URL=http://localhost:8080/v1 pnpm --filter @inrent/sdk test
 */
const key = process.env.INRENT_LIVE_API_KEY;
const baseURL = process.env.INRENT_LIVE_BASE_URL ?? "http://localhost:8080/v1";

describe.skipIf(!key)("live gateway", () => {
  let client: Inrent;
  beforeAll(() => {
    client = new Inrent({ apiKey: key, baseURL, maxRetries: 0 });
  });

  it("chat completion with metadata", async () => {
    const r = await client.chat.completions.create({ model: "inrent/mock-echo", messages: [{ role: "user", content: "ping" }] });
    expect(r.choices[0]?.message.content).toContain("ping");
    expect(r._meta.requestId).toMatch(/^req_/);
  });

  it("streams", async () => {
    const stream = await client.chat.completions.create({ model: "inrent/mock-echo", messages: [{ role: "user", content: "stream me" }], stream: true });
    expect(await stream.text()).toContain("stream me");
  });

  it("embeddings, models, key, usage, requests", async () => {
    const e = await client.embeddings.create({ model: "inrent/mock-embed", input: ["a", "b"] });
    expect(e.data).toHaveLength(2);
    const models = await client.models.list();
    expect(models.data.some((m) => m.id === "inrent/auto")).toBe(true);
    const k = await client.keys.current();
    expect(k.permissions).toContain("inference");
    const u = await client.usage.retrieve({ days: 7 });
    expect(u.days).toBe(7);
    const reqs = await client.requests.list({ limit: 3 });
    expect(reqs.data.length).toBeGreaterThan(0);
    const detail = await client.requests.retrieve(reqs.data[0]!.request_id);
    expect(detail.request_id).toBe(reqs.data[0]!.request_id);
  });

  it("typed errors", async () => {
    const err = await client.chat.completions.create({ model: "nope/does-not-exist", messages: [{ role: "user", content: "x" }] }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InrentError);
    expect((err as InrentError).status).toBe(404);
    expect((err as InrentError).requestId).toMatch(/^req_/);
  });
});
