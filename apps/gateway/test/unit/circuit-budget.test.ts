import { describe, expect, it } from "vitest";
import { CircuitBreaker } from "../../src/circuit";
import { budgetViolation } from "../../src/pipeline/preflight";
import type { GatewayAuth } from "../../src/types";

describe("circuit breaker", () => {
  it("opens after repeated failures and closes after the cool-down", () => {
    let now = 1_000_000;
    const cb = new CircuitBreaker(() => now);
    for (let i = 0; i < 4; i++) cb.record("p", false);
    expect(cb.isOpen("p")).toBe(false);
    cb.record("p", false);
    expect(cb.isOpen("p")).toBe(true);
    now += 31_000;
    expect(cb.isOpen("p")).toBe(false);
  });

  it("stays closed when failures are a minority", () => {
    const cb = new CircuitBreaker(() => 5);
    for (let i = 0; i < 20; i++) cb.record("p", true);
    for (let i = 0; i < 6; i++) cb.record("p", false);
    expect(cb.isOpen("p")).toBe(false);
  });
});

const auth = (o: Partial<GatewayAuth> = {}): GatewayAuth => ({
  kind: "api_key",
  keyId: "k",
  organizationId: "o",
  projectId: "p",
  userId: null,
  source: "api",
  permissions: ["inference"],
  allowedModels: [],
  projectAllowedModels: [],
  keyRpm: null,
  keyTpm: null,
  planRpm: 100,
  planTpm: 1000,
  keySpendLimitNano: null,
  projectBudgetNano: null,
  orgMonthlyCapNano: null,
  lowBalanceThresholdNano: null,
  autoRechargeEnabled: false,
  routingPolicy: "BALANCED",
  preferByok: true,
  promptLogging: false,
  responseLogging: false,
  zeroRetention: false,
  isDemo: false,
  ...o,
});

const spend = { balanceNano: 1_000n, orgMonthNano: 0n, projectMonthNano: 0n, keyTotalNano: 0n };

describe("budget checks", () => {
  it("passes within limits", () => {
    expect(budgetViolation(auth(), spend, 500n)).toBeNull();
  });
  it("detects each limit", () => {
    expect(budgetViolation(auth({ keySpendLimitNano: 100n }), spend, 101n)?.code).toBe("api_key_budget_exceeded");
    expect(budgetViolation(auth({ projectBudgetNano: 10n }), { ...spend, projectMonthNano: 10n }, 0n)?.code).toBe("project_budget_exceeded");
    expect(budgetViolation(auth({ orgMonthlyCapNano: 50n }), { ...spend, orgMonthNano: 49n }, 2n)?.code).toBe("organization_budget_exceeded");
    expect(budgetViolation(auth(), { ...spend, balanceNano: 0n }, 0n)?.code).toBe("insufficient_credits");
    expect(budgetViolation(auth(), spend, 2_000n)?.code).toBe("insufficient_credits");
  });
});
