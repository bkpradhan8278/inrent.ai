import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@inrent/db";
import { createApiKey, getBalance } from "@inrent/services";
import { closeQueues } from "@inrent/services/queue";
import { closeRedis, getRedis } from "@inrent/services/redis";
import { createMockCatalog, createOrg, createUser, resetDatabase } from "@inrent/services/testing";
import { bearer, chatBody, createTestGateway } from "./harness";

const USD = 1_000_000_000n;

async function setup(opts: { balance?: bigint; rpm?: number; catalog?: Parameters<typeof createMockCatalog>[0]; key?: Partial<Parameters<typeof createApiKey>[1]> } = {}) {
  const user = await createUser();
  const { org, project } = await createOrg(user.id, { balanceNano: opts.balance ?? 10n * USD, rpm: opts.rpm });
  const catalog = await createMockCatalog(opts.catalog);
  const { record, secret } = await createApiKey(
    { type: "USER", id: user.id },
    { organizationId: org.id, projectId: project.id, name: "test", environment: "DEVELOPMENT", permissions: ["inference", "keys:read", "keys:write", "usage:read", "logs:read"], ...opts.key },
  );
  const { app } = createTestGateway();
  return { user, org, project, catalog, key: record, secret, app };
}

beforeEach(async () => {
  await resetDatabase();
  await getRedis().flushdb();
});

afterAll(async () => {
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
});

describe("authentication", () => {
  it("rejects missing, malformed and unknown keys with OpenAI-style errors", async () => {
    const { app } = await setup();
    const missing = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: { "content-type": "application/json" } });
    expect(missing.status).toBe(401);
    const body = await missing.json();
    expect(body.error).toMatchObject({ type: "authentication_error", code: "missing_api_key" });
    expect(body.error.request_id).toMatch(/^req_/);
    expect(missing.headers.get("x-request-id")).toBe(body.error.request_id);

    expect((await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer("sk-nope") })).status).toBe(401);
    expect((await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer("sk-inrent-dev-" + "A".repeat(43)) })).status).toBe(401);
  });

  it("cannot use a revoked API key (cache invalidated immediately)", async () => {
    const { app, secret, key, user, org } = await setup();
    expect((await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) })).status).toBe(200);
    const { revokeApiKey } = await import("@inrent/services");
    await revokeApiKey({ type: "USER", id: user.id }, org.id, key.id);
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("revoked_api_key");
  });
});

describe("chat completions", () => {
  it("routes, responds OpenAI-compatibly, bills exactly and logs the request", async () => {
    const { app, secret, org } = await setup();
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.object).toBe("chat.completion");
    expect(json.model).toBe("test/echo");
    expect(json.provider).toBe("mock-primary");
    expect(json.choices[0].message.content).toContain("Hello gateway");
    expect(res.headers.get("x-inrent-provider")).toBe("mock-primary");
    expect(res.headers.get("x-ratelimit-limit-requests")).toBeTruthy();

    const request = await prisma.request.findUniqueOrThrow({ where: { requestId: res.headers.get("x-request-id")! } });
    expect(request.status).toBe("SUCCESS");
    // Price $1/$2 per 1M tokens, 10% markup → charge = ceil((in×1000 + out×2000) × 1.1) nano
    const expected = (BigInt(request.inputTokens) * 1000n + BigInt(request.outputTokens) * 2000n) * 110n;
    expect(request.providerCostNano).toBe(BigInt(request.inputTokens) * 1000n + BigInt(request.outputTokens) * 2000n);
    expect(request.userChargeNano).toBe((expected + 99n) / 100n);
    expect(await getBalance(org.id)).toBe(10n * USD - request.userChargeNano);
    expect(request.promptPayload).toBeNull(); // prompt logging is off by default
  });

  it("rejects invalid requests and unknown models", async () => {
    const { app, secret } = await setup();
    const bad = await app.request("/v1/chat/completions", { method: "POST", body: JSON.stringify({ model: "test/echo", messages: [] }), headers: bearer(secret) });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.param).toBe("messages");
    const unknown = await app.request("/v1/chat/completions", { method: "POST", body: chatBody("nope/model"), headers: bearer(secret) });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.code).toBe("model_not_found");
    const notJson = await app.request("/v1/chat/completions", { method: "POST", body: "{", headers: bearer(secret) });
    expect((await notJson.json()).error.code).toBe("invalid_json");
  });

  it("falls back to the next provider when one fails", async () => {
    const { app, secret } = await setup({ catalog: { primaryFail: "always" } });
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-inrent-provider")).toBe("mock-backup");
    expect(res.headers.get("x-inrent-fallbacks")).toBe("1");
    const request = await prisma.request.findUniqueOrThrow({ where: { requestId: res.headers.get("x-request-id")! } });
    expect(request.fallbackCount).toBe(1);
    expect(JSON.stringify(request.routing)).toContain("mock-primary");
  });

  it("does not fall back on client errors and returns 502 when every provider fails", async () => {
    const bad = await setup({ catalog: { primaryFail: "bad_request" } });
    const r1 = await bad.app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(bad.secret) });
    expect(r1.status).toBe(400);
    await resetDatabase();
    const down = await setup({ catalog: { primaryFail: "always", backupFail: "always" } });
    const r2 = await down.app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(down.secret) });
    expect(r2.status).toBe(502);
    expect((await r2.json()).error.message).toMatch(/All 2 providers failed/);
    expect(await getBalance(down.org.id)).toBe(10n * USD); // failed requests are not charged
  });

  it("honours provider routing preferences", async () => {
    const { app, secret } = await setup();
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody("test/echo", { inrent: { providers: { order: ["mock-backup"] } } }), headers: bearer(secret) });
    expect(res.headers.get("x-inrent-provider")).toBe("mock-backup");
  });

  it("rejects disabled providers and unverified models for platform funding", async () => {
    const disabled = await setup({ catalog: { providerEnabled: false } });
    const r1 = await disabled.app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(disabled.secret) });
    expect(r1.status).toBe(503);
    expect((await r1.json()).error.code).toBe("model_unavailable");
    await resetDatabase();
    const unverified = await setup({ catalog: { verification: "NEEDS_REVIEW" } });
    expect((await unverified.app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(unverified.secret) })).status).toBe(503);
  });

  it("explains BYOK-only providers", async () => {
    const { app, secret } = await setup({ catalog: { integrationMode: "BYOK" } });
    await prisma.featureFlag.create({ data: { key: "BYOK_ENABLED", description: "", enabled: true } });
    const { invalidateFlagCache } = await import("@inrent/services");
    invalidateFlagCache();
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(503);
    expect((await res.json()).error.message).toMatch(/BYOK/);
  });

  it("enforces model allowlists on keys", async () => {
    const { app, secret } = await setup({ key: { allowedModels: ["other/model"] } });
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("model_not_allowed");
  });
});

describe("billing and budgets", () => {
  it("cannot spend without credits", async () => {
    const { app, secret } = await setup({ balance: 0n });
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("insufficient_credits");
  });

  it("cannot exceed an API key spending limit", async () => {
    const { app, secret, key } = await setup({ key: { spendLimitNano: 1n } });
    await prisma.spendCounter.create({ data: { scope: "key", scopeId: key.id, period: "total", spentNano: 1n } });
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("api_key_budget_exceeded");
  });

  it("cannot exceed a project monthly budget", async () => {
    const { app, secret, project } = await setup();
    await prisma.project.update({ where: { id: project.id }, data: { monthlyBudgetNano: 10n } });
    await prisma.spendCounter.create({ data: { scope: "project", scopeId: project.id, period: new Date().toISOString().slice(0, 7), spentNano: 10n } });
    const { getRedis: redis } = await import("@inrent/services/redis");
    await redis().flushdb(); // drop cached key context so the new budget applies
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    expect(res.status).toBe(402);
    expect((await res.json()).error.code).toBe("project_budget_exceeded");
  });

  it("rejects requests whose max output cost exceeds the balance", async () => {
    const { app, secret } = await setup({ balance: 1_000n });
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody("test/echo", { max_tokens: 20_000 }), headers: bearer(secret) });
    expect(res.status).toBe(402);
  });
});

describe("rate limiting", () => {
  it("cannot bypass the per-key/plan request limit", async () => {
    const { app, secret } = await setup({ rpm: 3 });
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
      statuses.push(r.status);
      if (r.status === 429) {
        expect(r.headers.get("retry-after")).toBeTruthy();
        expect((await r.json()).error.type).toBe("rate_limit_error");
      }
    }
    expect(statuses.filter((s) => s === 200)).toHaveLength(3);
    expect(statuses.slice(3)).toEqual([429, 429]);
  });
});

describe("streaming", () => {
  it("streams SSE chunks, terminates with [DONE] and bills the final usage", async () => {
    const { app, secret, org } = await setup();
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody("test/echo", { stream: true, stream_options: { include_usage: true } }), headers: bearer(secret) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const events = text.split("\n\n").filter(Boolean);
    expect(events.at(-1)).toBe("data: [DONE]");
    const chunks = events.slice(0, -1).map((e) => JSON.parse(e.slice(6)));
    expect(chunks.map((c) => c.choices[0]?.delta?.content ?? "").join("")).toContain("Hello gateway");
    expect(chunks.every((c) => c.model === "test/echo")).toBe(true);
    expect(chunks.at(-1).usage.total_tokens).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 50));
    const request = await prisma.request.findUniqueOrThrow({ where: { requestId: res.headers.get("x-request-id")! } });
    expect(request.stream).toBe(true);
    expect(request.ttftMs).not.toBeNull();
    expect(await getBalance(org.id)).toBe(10n * USD - request.userChargeNano);
  });

  it("falls back before the first byte when a streaming provider fails", async () => {
    const { app, secret } = await setup({ catalog: { primaryFail: "rate_limit" } });
    const res = await app.request("/v1/chat/completions", { method: "POST", body: chatBody("test/echo", { stream: true }), headers: bearer(secret) });
    expect(res.status).toBe(200);
    expect(res.headers.get("x-inrent-provider")).toBe("mock-backup");
    const text = await res.text();
    expect(text).not.toContain('"usage"'); // usage chunk only when include_usage was requested
  });
});

describe("other endpoints", () => {
  it("serves embeddings, legacy completions and responses", async () => {
    const { app, secret } = await setup();
    const emb = await app.request("/v1/embeddings", { method: "POST", body: JSON.stringify({ model: "test/echo", input: ["a", "b"] }), headers: bearer(secret) });
    expect(emb.status).toBe(200);
    expect((await emb.json()).data).toHaveLength(2);
    const cmpl = await app.request("/v1/completions", { method: "POST", body: JSON.stringify({ model: "test/echo", prompt: "Say hi" }), headers: bearer(secret) });
    const cj = await cmpl.json();
    expect(cj.object).toBe("text_completion");
    expect(cj.choices[0].text).toContain("Say hi");
    const resp = await app.request("/v1/responses", { method: "POST", body: JSON.stringify({ model: "test/echo", input: "Ping" }), headers: bearer(secret) });
    const rj = await resp.json();
    expect(rj.object).toBe("response");
    expect(rj.output_text).toContain("Ping");
  });

  it("lists models publicly and returns explicit errors for roadmap endpoints", async () => {
    const { app, secret } = await setup();
    const models = await app.request("/v1/models");
    expect(models.status).toBe(200);
    const ids = (await models.json()).data.map((m: { id: string }) => m.id);
    expect(ids).toContain("inrent/auto");
    expect(ids).toContain("test/echo");
    const one = await app.request("/v1/models/test/echo");
    expect((await one.json()).id).toBe("test/echo");
    const audio = await app.request("/v1/audio/speech", { method: "POST", body: "{}", headers: bearer(secret) });
    expect(audio.status).toBe(501);
    expect((await app.request("/v1/does-not-exist")).status).toBe(404);
  });
});

describe("management API", () => {
  it("creates and revokes keys without permission escalation", async () => {
    const { app, secret, user, org, project } = await setup();
    const created = await app.request("/v1/keys", { method: "POST", body: JSON.stringify({ name: "ci", permissions: ["inference"] }), headers: bearer(secret) });
    expect(created.status).toBe(201);
    const { data } = await created.json();
    expect(data.key).toMatch(/^sk-inrent-dev-/);

    const limited = await createApiKey({ type: "USER", id: user.id }, { organizationId: org.id, projectId: project.id, name: "limited", environment: "DEVELOPMENT", permissions: ["inference", "keys:write"] });
    const escalate = await app.request("/v1/keys", { method: "POST", body: JSON.stringify({ name: "x", permissions: ["logs:read"] }), headers: bearer(limited.secret) });
    expect(escalate.status).toBe(403);
    expect((await escalate.json()).error.code).toBe("permission_escalation");

    const inferenceOnly = await createApiKey({ type: "USER", id: user.id }, { organizationId: org.id, projectId: project.id, name: "inf", environment: "DEVELOPMENT" });
    expect((await app.request("/v1/keys", { headers: bearer(inferenceOnly.secret) })).status).toBe(403);

    const revoked = await app.request(`/v1/keys/${data.id}`, { method: "DELETE", headers: bearer(secret) });
    expect(revoked.status).toBe(200);
    expect((await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(data.key) })).status).toBe(401);
  });

  it("cannot access another organization's keys or logs", async () => {
    const a = await setup();
    const res = await a.app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(a.secret) });
    const requestId = res.headers.get("x-request-id")!;
    // Second org with its own key
    const otherUser = await createUser();
    const { org: otherOrg, project: otherProject } = await createOrg(otherUser.id, { balanceNano: USD });
    const other = await createApiKey({ type: "USER", id: otherUser.id }, { organizationId: otherOrg.id, projectId: otherProject.id, name: "o", environment: "DEVELOPMENT", permissions: ["inference", "keys:write", "keys:read", "logs:read"] });

    expect((await a.app.request(`/v1/keys/${a.key.id}`, { method: "DELETE", headers: bearer(other.secret) })).status).toBe(400);
    expect((await a.app.request(`/v1/requests/${requestId}`, { headers: bearer(other.secret) })).status).toBe(400);
    const list = await (await a.app.request("/v1/keys", { headers: bearer(other.secret) })).json();
    expect(list.data.map((k: { id: string }) => k.id)).not.toContain(a.key.id);
    expect(await prisma.apiKey.findUniqueOrThrow({ where: { id: a.key.id } }).then((k) => k.revokedAt)).toBeNull();
    // Project from another org cannot be targeted
    const cross = await a.app.request("/v1/keys", { method: "POST", body: JSON.stringify({ name: "x", project_id: otherProject.id, permissions: ["inference"] }), headers: bearer(a.secret) });
    expect(cross.status).toBe(400);
  });

  it("reports key info, usage and request logs", async () => {
    const { app, secret } = await setup();
    await app.request("/v1/chat/completions", { method: "POST", body: chatBody(), headers: bearer(secret) });
    const key = await (await app.request("/v1/key", { headers: bearer(secret) })).json();
    expect(key.data.prefix).toMatch(/^sk-inrent-dev-/);
    const usage = await (await app.request("/v1/usage?days=7", { headers: bearer(secret) })).json();
    expect(usage.data.totals.requests).toBe(1);
    const logs = await (await app.request("/v1/requests", { headers: bearer(secret) })).json();
    expect(logs.data[0].model).toBe("test/echo");
  });
});
