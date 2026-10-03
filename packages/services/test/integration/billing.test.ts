import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@inrent/db";
import { applyLedgerEntry, chargeUsage, getBalance, getSpendState, grantCredits } from "../../src/billing";
import { createOrg, createUser, resetDatabase } from "../../src/testing";

beforeEach(resetDatabase);
afterAll(() => prisma.$disconnect());

describe("credit ledger", () => {
  it("grants credits idempotently", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id);
    const input = { organizationId: org.id, type: "PURCHASE" as const, amountNano: 5_000_000_000n, description: "test", idempotencyKey: "payment:abc" };
    const first = await grantCredits(input);
    const second = await grantCredits(input);
    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(await getBalance(org.id)).toBe(5_000_000_000n);
    expect(await prisma.creditTransaction.count({ where: { organizationId: org.id } })).toBe(1);
  });

  it("serializes concurrent charges without losing updates", async () => {
    const user = await createUser();
    const { org, project } = await createOrg(user.id, { balanceNano: 1_000_000n });
    await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        prisma.$transaction((tx) =>
          chargeUsage({ organizationId: org.id, projectId: project.id, apiKeyId: null, requestId: `req_${i}`, amountNano: 1_000n, description: "usage" }, tx),
        ),
      ),
    );
    expect(await getBalance(org.id)).toBe(1_000_000n - 25_000n);
    const txns = await prisma.creditTransaction.findMany({ where: { organizationId: org.id }, orderBy: { balanceAfterNano: "desc" } });
    // Each entry records a distinct running balance — proof that updates were serialized.
    expect(new Set(txns.map((t) => t.balanceAfterNano.toString())).size).toBe(25);
    const state = await getSpendState(org.id, project.id, null);
    expect(state.orgMonthNano).toBe(25_000n);
    expect(state.projectMonthNano).toBe(25_000n);
  });

  it("charges each request at most once", async () => {
    const user = await createUser();
    const { org, project } = await createOrg(user.id, { balanceNano: 10_000n });
    const charge = () =>
      prisma.$transaction((tx) => chargeUsage({ organizationId: org.id, projectId: project.id, apiKeyId: null, requestId: "req_once", amountNano: 500n, description: "usage" }, tx));
    await charge();
    await expect(charge()).rejects.toThrow();
    expect(await getBalance(org.id)).toBe(9_500n);
  });

  it("tracks API key lifetime spend", async () => {
    const user = await createUser();
    const { org, project } = await createOrg(user.id, { balanceNano: 10_000n });
    const key = await prisma.apiKey.create({ data: { organizationId: org.id, projectId: project.id, name: "k", displayPrefix: "p", lastFour: "1234", keyHash: "h1" } });
    await prisma.$transaction((tx) => chargeUsage({ organizationId: org.id, projectId: project.id, apiKeyId: key.id, requestId: "r1", amountNano: 700n, description: "u" }, tx));
    expect((await getSpendState(org.id, project.id, key.id)).keyTotalNano).toBe(700n);
  });

  it("supports negative adjustments through the same ledger", async () => {
    const user = await createUser();
    const { org } = await createOrg(user.id, { balanceNano: 1_000n });
    const r = await applyLedgerEntry({ organizationId: org.id, type: "REFUND", amountNano: -400n, description: "refund", idempotencyKey: "refund:1" });
    expect(r.balanceAfterNano).toBe(600n);
  });
});
