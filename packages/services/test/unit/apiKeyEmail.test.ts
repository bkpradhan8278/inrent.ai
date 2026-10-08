import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  add: vi.fn(),
  db: {
    organization: { findUniqueOrThrow: vi.fn(), findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    apiKey: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findUnique: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("bullmq", () => ({
  Queue: class {
    add(...args: unknown[]) {
      return h.add(...args);
    }
  },
  UnrecoverableError: class UnrecoverableError extends Error {},
}));
vi.mock("@inrent/db", () => ({ prisma: h.db }));
vi.mock("../../src/audit", () => ({ recordAudit: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../src/authz", () => ({ requireOrgPermission: vi.fn().mockResolvedValue(undefined), requireProjectInOrg: vi.fn().mockResolvedValue(undefined) }));

import { createApiKey, rotateApiKey, type Actor } from "../../src/apiKeys";
import { resetServerEnvCache } from "../../src/env";

const ORG = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const user: Actor = { type: "USER", id: "user-1" };
const input = { organizationId: ORG, projectId: PROJECT, name: "CI key", environment: "PRODUCTION" as const };

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "inrent.ai");
  vi.stubEnv("APP_URL", "https://inrent.ai");
  resetServerEnvCache();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  h.add.mockReset().mockResolvedValue(undefined);
  h.db.organization.findUniqueOrThrow.mockResolvedValue({ id: ORG, name: "Acme", plan: null });
  h.db.organization.findUnique.mockResolvedValue({ name: "Acme" });
  h.db.user.findUnique.mockResolvedValue({ name: "Asha", email: "asha@example.com", deletedAt: null });
  h.db.apiKey.create.mockImplementation(async ({ data }: { data: { name: string; displayPrefix: string } }) => ({
    id: "33333333-3333-4333-8333-333333333333",
    name: data.name,
    displayPrefix: data.displayPrefix,
    createdAt: new Date("2026-10-06T14:05:00Z"),
  }));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("API key email", () => {
  it("queues the notice after creation with the prefix only, never the secret or hash", async () => {
    const { record, secret } = await createApiKey(user, input);
    expect(h.add).toHaveBeenCalledTimes(1);
    const [jobName, job, opts] = h.add.mock.calls[0]!;
    expect(jobName).toBe("api_key_created");
    expect(opts.jobId).toBe(`email:api_key_created:${record.id}`);
    expect(job).toEqual({
      to: "asha@example.com",
      template: "api_key_created",
      data: {
        name: "Asha",
        keyName: "CI key",
        keyPrefix: record.displayPrefix,
        workspaceName: "Acme",
        createdAtIso: "2026-10-06T14:05:00.000Z",
        manageUrl: "https://app.inrent.ai/keys",
      },
    });

    const queued = JSON.stringify(h.add.mock.calls);
    const stored = h.db.apiKey.create.mock.calls[0]![0].data;
    expect(queued).not.toContain(secret);
    expect(queued).not.toContain(secret.slice(record.displayPrefix.length));
    expect(queued).not.toContain(stored.keyHash);
    expect(queued).not.toContain(stored.lastFour);
  });

  it("links to /dashboard/keys on one host when no root domain is configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "");
    await createApiKey(user, input);
    expect(h.add.mock.calls[0]![1].data.manageUrl).toBe("https://inrent.ai/dashboard/keys");
  });

  it("still returns the key when the queue is down", async () => {
    h.add.mockRejectedValue(new Error("ECONNREFUSED"));
    const result = await createApiKey(user, input);
    expect(result.secret).toMatch(/^sk-inrent-prod-/);
  });

  it("still returns the key when looking up the recipient fails", async () => {
    h.db.user.findUnique.mockRejectedValue(new Error("db down"));
    const result = await createApiKey(user, input);
    expect(result.secret).toMatch(/^sk-inrent-prod-/);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("sends nothing to phone-only placeholder addresses or for API-key actors", async () => {
    h.db.user.findUnique.mockResolvedValue({ name: "Phone user", email: "919876543210@phone.inrent.invalid", deletedAt: null });
    await createApiKey(user, input);
    await createApiKey({ type: "API_KEY", id: "key-x" }, input);
    expect(h.add).not.toHaveBeenCalled();
  });

  it("marks a rotation as rotated", async () => {
    h.db.apiKey.findFirst.mockResolvedValue({
      id: "old-key",
      projectId: PROJECT,
      name: "CI key",
      environment: "PRODUCTION",
      scope: "PROJECT",
      permissions: ["inference"],
      allowedModels: [],
      spendLimitNano: null,
      rpmLimit: null,
      tpmLimit: null,
      expiresAt: null,
      revokedAt: null,
    });
    h.db.apiKey.update.mockResolvedValue({});
    h.db.apiKey.findUnique.mockResolvedValue(null);
    h.db.$transaction.mockResolvedValue([]);
    const { secret } = await rotateApiKey(user, ORG, "old-key");
    expect(h.add).toHaveBeenCalledTimes(1);
    const job = h.add.mock.calls[0]![1];
    expect(job.template).toBe("api_key_created");
    expect(job.data.rotated).toBe("true");
    expect(JSON.stringify(job)).not.toContain(secret.slice(-20));
  });
});
