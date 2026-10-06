import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@inrent/db";
import { addModelEndpoint, createModel } from "../../src/admin";
import { closeQueues } from "../../src/queue";
import { closeRedis } from "../../src/redis";
import { createUser, resetDatabase } from "../../src/testing";

beforeEach(resetDatabase);
afterAll(async () => {
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
});

async function provider(slug = "ollama") {
  return prisma.provider.create({ data: { slug, name: slug, baseUrl: "http://localhost:11434/v1", integrationMode: "SELF_HOSTED" } });
}

const base = { slug: "google/gemma-4-e4b-it", displayName: "Gemma 4 E4B", vendor: "google", description: "test", capabilities: ["chat" as const] };

describe("admin catalog creation", () => {
  it("creates a model that is not servable until reviewed, and audits it", async () => {
    const admin = await createUser({ platformRole: "ADMIN" });
    const m = await createModel(admin.id, { ...base, slug: "Google/Gemma-4-E4B-it", contextLength: 4096 });
    expect(m).toMatchObject({ slug: "google/gemma-4-e4b-it", status: "PREVIEW", verificationStatus: "NEEDS_REVIEW", contextLength: 4096 });
    expect(await prisma.auditLog.count({ where: { action: "model.created", targetId: m.id } })).toBe(1);
  });

  it("refuses non-admins, bad slugs, unknown capabilities and duplicates", async () => {
    const admin = await createUser({ platformRole: "ADMIN" });
    const user = await createUser();
    await expect(createModel(user.id, base)).rejects.toThrow();
    await expect(createModel(admin.id, { ...base, slug: "no-vendor" })).rejects.toThrow(/vendor\/model-name/);
    await expect(createModel(admin.id, { ...base, capabilities: ["teleport" as never] })).rejects.toThrow(/capability/);
    await expect(createModel(admin.id, { ...base, contextLength: -5 })).rejects.toThrow(/positive/);
    await createModel(admin.id, base);
    await expect(createModel(admin.id, base)).rejects.toThrow(/already exists/);
  });

  it("adds a disabled endpoint once per provider model id", async () => {
    const admin = await createUser({ platformRole: "ADMIN" });
    const m = await createModel(admin.id, base);
    const p = await provider();
    const ep = await addModelEndpoint(admin.id, m.id, { providerId: p.id, providerModelId: "gemma4:e4b-it-qat", supportsTools: true });
    expect(ep).toMatchObject({ enabled: false, providerModelId: "gemma4:e4b-it-qat", supportsTools: true, supportsStreaming: true, priority: 100 });
    await expect(addModelEndpoint(admin.id, m.id, { providerId: p.id, providerModelId: "gemma4:e4b-it-qat" })).rejects.toThrow(/already serves/);
    await expect(addModelEndpoint(admin.id, m.id, { providerId: p.id, providerModelId: "has space" })).rejects.toThrow(/without spaces/);
    expect(await prisma.auditLog.count({ where: { action: "endpoint.created" } })).toBe(1);
  });

  it("refuses endpoints from non-admins or for unknown models", async () => {
    const admin = await createUser({ platformRole: "ADMIN" });
    const user = await createUser();
    const m = await createModel(admin.id, base);
    const p = await provider();
    await expect(addModelEndpoint(user.id, m.id, { providerId: p.id, providerModelId: "x" })).rejects.toThrow();
    await expect(addModelEndpoint(admin.id, "00000000-0000-0000-0000-000000000000", { providerId: p.id, providerModelId: "x" })).rejects.toThrow(/not found/i);
  });
});
