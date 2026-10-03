import { createServer, type Server } from "node:http";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@inrent/db";
import { verifyWebhookSignature } from "@inrent/core/server";
import { createApiKey, listApiKeys, resolveApiKey, revokeApiKey, rotateApiKey } from "../../src/apiKeys";
import { addByokCredential, loadByokKeys } from "../../src/byok";
import { getServerEnv, resetServerEnvCache } from "../../src/env";
import { closeQueues } from "../../src/queue";
import { closeRedis } from "../../src/redis";
import { aad, decrypt } from "../../src/secrets";
import { createWebhook, deliverWebhook, emitWebhookEvent } from "../../src/webhooks";
import { createOrg, createUser, resetDatabase } from "../../src/testing";

beforeEach(resetDatabase);
afterAll(async () => {
  await closeQueues();
  await closeRedis();
  await prisma.$disconnect();
});

describe("organization isolation (IDOR)", () => {
  it("prevents users from managing another organization's keys", async () => {
    const alice = await createUser();
    const mallory = await createUser();
    const { org, project } = await createOrg(alice.id);
    const { record } = await createApiKey({ type: "USER", id: alice.id }, { organizationId: org.id, projectId: project.id, name: "prod", environment: "PRODUCTION" });

    await expect(createApiKey({ type: "USER", id: mallory.id }, { organizationId: org.id, projectId: project.id, name: "x", environment: "DEVELOPMENT" })).rejects.toThrow(/not found/i);
    await expect(revokeApiKey({ type: "USER", id: mallory.id }, org.id, record.id)).rejects.toThrow(/not found/i);
    // Mallory's own org cannot reference Alice's key id either.
    const { org: malloryOrg } = await createOrg(mallory.id);
    await expect(revokeApiKey({ type: "USER", id: mallory.id }, malloryOrg.id, record.id)).rejects.toThrow(/not found/i);
    expect((await listApiKeys(malloryOrg.id)).map((k) => k.id)).not.toContain(record.id);
  });

  it("prevents creating keys for a project in another organization", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { project: aliceProject } = await createOrg(alice.id);
    const { org: bobOrg } = await createOrg(bob.id);
    await expect(createApiKey({ type: "USER", id: bob.id }, { organizationId: bobOrg.id, projectId: aliceProject.id, name: "x", environment: "DEVELOPMENT" })).rejects.toThrow(/Project not found/);
  });

  it("enforces roles: viewers cannot create keys", async () => {
    const owner = await createUser();
    const viewer = await createUser();
    const { org, project } = await createOrg(owner.id);
    await prisma.membership.create({ data: { organizationId: org.id, userId: viewer.id, role: "VIEWER" } });
    await expect(createApiKey({ type: "USER", id: viewer.id }, { organizationId: org.id, projectId: project.id, name: "x", environment: "DEVELOPMENT" })).rejects.toThrow(/permission/);
  });
});

describe("API key lifecycle", () => {
  it("stores only a hash, resolves active keys and rejects revoked/rotated keys", async () => {
    const user = await createUser();
    const { org, project } = await createOrg(user.id);
    const { record, secret } = await createApiKey({ type: "USER", id: user.id }, { organizationId: org.id, projectId: project.id, name: "k", environment: "PRODUCTION" });
    expect(secret).toMatch(/^sk-inrent-prod-/);
    const stored = await prisma.apiKey.findUniqueOrThrow({ where: { id: record.id } });
    expect(stored.keyHash).not.toContain(secret.slice(15));
    expect(JSON.stringify(stored)).not.toContain(secret);
    expect((await resolveApiKey(secret)).ok).toBe(true);

    const rotated = await rotateApiKey({ type: "USER", id: user.id }, org.id, record.id);
    expect(await resolveApiKey(secret)).toEqual({ ok: false, reason: "revoked" });
    expect((await resolveApiKey(rotated.secret)).ok).toBe(true);

    await revokeApiKey({ type: "USER", id: user.id }, org.id, rotated.record.id);
    expect(await resolveApiKey(rotated.secret)).toEqual({ ok: false, reason: "revoked" });
    expect(await resolveApiKey("sk-inrent-prod-" + "A".repeat(43))).toEqual({ ok: false, reason: "unknown" });
    expect(await resolveApiKey("garbage")).toEqual({ ok: false, reason: "malformed" });
  });

  it("rejects expired keys and suspended organizations", async () => {
    const user = await createUser();
    const { org, project } = await createOrg(user.id);
    const { record, secret } = await createApiKey({ type: "USER", id: user.id }, { organizationId: org.id, projectId: project.id, name: "k", environment: "DEVELOPMENT", expiresAt: new Date(Date.now() + 60_000) });
    await prisma.apiKey.update({ where: { id: record.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    expect(await resolveApiKey(secret)).toEqual({ ok: false, reason: "expired" });
    await prisma.apiKey.update({ where: { id: record.id }, data: { expiresAt: null } });
    await prisma.organization.update({ where: { id: org.id }, data: { suspendedAt: new Date() } });
    expect(await resolveApiKey(secret)).toEqual({ ok: false, reason: "suspended" });
  });
});

describe("BYOK encryption", () => {
  it("encrypts at rest and binds ciphertext to the organization", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const { org: other } = await createOrg(user.id);
    await prisma.featureFlag.create({ data: { key: "BYOK_ENABLED", description: "", enabled: true } });
    const provider = await prisma.provider.create({ data: { slug: "acme", name: "Acme", baseUrl: "https://api.acme.test/v1", enabled: true } });
    await addByokCredential(user.id, org.id, { providerId: provider.id, label: "mine", apiKey: "sk-acme-very-secret-1234" });
    const row = await prisma.byokCredential.findFirstOrThrow({ where: { organizationId: org.id } });
    expect(row.encryptedKey).not.toContain("very-secret");
    expect(row.keyHint).toBe("…1234");
    expect((await loadByokKeys(org.id)).get(provider.id)).toBe("sk-acme-very-secret-1234");
    expect(() => decrypt(row.encryptedKey, aad.byok(other.id, provider.id))).toThrow();
  });
});

describe("webhooks", () => {
  let server: Server;
  const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
  let status = 200;

  beforeEach(async () => {
    received.length = 0;
    status = 200;
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ headers: req.headers, body });
        res.statusCode = status;
        res.end("ok");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  });

  afterAll(() => server?.close());

  it("delivers signed events and schedules retries on failure", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const port = (server.address() as { port: number }).port;
    const { webhook, secret } = await createWebhook(user.id, org.id, { url: `http://127.0.0.1:${port}/hook`, events: ["credit.low"] });
    expect(webhook.secretHint).toMatch(/^…/);

    await emitWebhookEvent(org.id, "credit.low", { balance_usd: "1.00" });
    const delivery = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: webhook.id } });
    expect(await deliverWebhook(delivery.id)).toBe("succeeded");
    expect(received).toHaveLength(1);
    const sig = received[0]!.headers["inrent-signature"] as string;
    expect(verifyWebhookSignature(secret, received[0]!.body, sig)).toBe(true);

    status = 500;
    await emitWebhookEvent(org.id, "credit.low", { balance_usd: "0.50" });
    const failing = await prisma.webhookDelivery.findFirstOrThrow({ where: { webhookId: webhook.id, status: "PENDING" } });
    expect(await deliverWebhook(failing.id)).toBe("retry");
    const after = await prisma.webhookDelivery.findUniqueOrThrow({ where: { id: failing.id } });
    expect(after.attempts).toBe(1);
    expect(after.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects private destinations when private URLs are not allowed (SSRF)", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const previous = process.env.ALLOW_PRIVATE_WEBHOOK_URLS;
    process.env.ALLOW_PRIVATE_WEBHOOK_URLS = "false";
    resetServerEnvCache();
    try {
      expect(getServerEnv().ALLOW_PRIVATE_WEBHOOK_URLS).toBe("false");
      await expect(createWebhook(user.id, org.id, { url: "https://169.254.169.254/latest", events: ["credit.low"] })).rejects.toThrow(/rejected/);
      await expect(createWebhook(user.id, org.id, { url: "http://example.com/hook", events: ["credit.low"] })).rejects.toThrow(/https/);
    } finally {
      process.env.ALLOW_PRIVATE_WEBHOOK_URLS = previous;
      resetServerEnvCache();
    }
  });
});
