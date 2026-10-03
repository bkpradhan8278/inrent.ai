import { Prisma, prisma, type CreditTransactionType, type TransactionClient } from "@inrent/db";
import { formatUsd } from "@inrent/core";
import { recordAudit } from "./audit";
import { requireAdminPermission, requireOrgPermission } from "./authz";
import { ValidationError } from "./errors";

/**
 * Credit ledger.
 *
 * Invariants
 * - Every balance change writes exactly one CreditTransaction with a unique idempotency key.
 *   Replaying the same grant/charge is a no-op (duplicate payment webhooks, retried jobs).
 * - Balance updates use a single UPDATE … RETURNING, which row-locks the balance, so
 *   concurrent charges serialize correctly without read-modify-write races.
 * - The ledger is append-only; corrections are new ADJUSTMENT/REFUND entries.
 */

export function currentPeriod(date = new Date()): string {
  return date.toISOString().slice(0, 7);
}

function isUniqueViolation(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

export interface LedgerEntryInput {
  organizationId: string;
  type: CreditTransactionType;
  amountNano: bigint;
  description: string;
  idempotencyKey: string;
  requestId?: string;
  paymentId?: string;
  createdById?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface LedgerResult {
  duplicate: boolean;
  balanceAfterNano: bigint;
  transactionId: string;
}

async function applyEntry(tx: TransactionClient, input: LedgerEntryInput): Promise<LedgerResult> {
  const rows = await tx.$queryRaw<Array<{ balanceNano: bigint }>>`
    UPDATE "CreditBalance" SET "balanceNano" = "balanceNano" + ${input.amountNano}, "updatedAt" = now()
    WHERE "organizationId" = ${input.organizationId}::uuid
    RETURNING "balanceNano"`;
  let balance = rows[0]?.balanceNano;
  if (balance === undefined) {
    await tx.creditBalance.create({ data: { organizationId: input.organizationId, balanceNano: input.amountNano } });
    balance = input.amountNano;
  }
  const txn = await tx.creditTransaction.create({
    data: {
      organizationId: input.organizationId,
      type: input.type,
      amountNano: input.amountNano,
      balanceAfterNano: balance,
      description: input.description,
      idempotencyKey: input.idempotencyKey,
      requestId: input.requestId,
      paymentId: input.paymentId,
      createdById: input.createdById,
      metadata: input.metadata,
    },
  });
  return { duplicate: false, balanceAfterNano: balance, transactionId: txn.id };
}

/** Applies a ledger entry atomically and idempotently. Pass `tx` to join an outer transaction. */
export async function applyLedgerEntry(input: LedgerEntryInput, tx?: TransactionClient): Promise<LedgerResult> {
  if (tx) return applyEntry(tx, input);
  try {
    return await prisma.$transaction((t) => applyEntry(t, input));
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await prisma.creditTransaction.findUniqueOrThrow({ where: { idempotencyKey: input.idempotencyKey } });
    return { duplicate: true, balanceAfterNano: existing.balanceAfterNano, transactionId: existing.id };
  }
}

export async function grantCredits(input: Omit<LedgerEntryInput, "amountNano"> & { amountNano: bigint }, tx?: TransactionClient) {
  if (input.amountNano <= 0n) throw new ValidationError("Grant amount must be positive.");
  return applyLedgerEntry(input, tx);
}

export async function getBalance(organizationId: string): Promise<bigint> {
  const b = await prisma.creditBalance.findUnique({ where: { organizationId } });
  return b?.balanceNano ?? 0n;
}

export interface SpendState {
  balanceNano: bigint;
  orgMonthNano: bigint;
  projectMonthNano: bigint;
  keyTotalNano: bigint;
}

/** One round-trip read of balance and budget counters for pre-flight checks. */
export async function getSpendState(organizationId: string, projectId: string, apiKeyId: string | null): Promise<SpendState> {
  const period = currentPeriod();
  const [balance, counters] = await Promise.all([
    prisma.creditBalance.findUnique({ where: { organizationId } }),
    prisma.spendCounter.findMany({
      where: {
        OR: [
          { scope: "org", scopeId: organizationId, period },
          { scope: "project", scopeId: projectId, period },
          ...(apiKeyId ? [{ scope: "key", scopeId: apiKeyId, period: "total" }] : []),
        ],
      },
    }),
  ]);
  const get = (scope: string) => counters.find((c) => c.scope === scope)?.spentNano ?? 0n;
  return { balanceNano: balance?.balanceNano ?? 0n, orgMonthNano: get("org"), projectMonthNano: get("project"), keyTotalNano: get("key") };
}

export interface UsageChargeInput {
  organizationId: string;
  projectId: string;
  apiKeyId: string | null;
  requestId: string;
  amountNano: bigint;
  description: string;
  metadata?: Prisma.InputJsonValue;
}

async function incrementCounters(tx: TransactionClient, input: UsageChargeInput) {
  const period = currentPeriod();
  const rows: Array<[string, string, string]> = [
    ["org", input.organizationId, period],
    ["project", input.projectId, period],
  ];
  if (input.apiKeyId) rows.push(["key", input.apiKeyId, "total"]);
  for (const [scope, scopeId, p] of rows) {
    await tx.$executeRaw`
      INSERT INTO "SpendCounter" ("scope", "scopeId", "period", "spentNano", "updatedAt")
      VALUES (${scope}, ${scopeId}, ${p}, ${input.amountNano}, now())
      ON CONFLICT ("scope", "scopeId", "period")
      DO UPDATE SET "spentNano" = "SpendCounter"."spentNano" + EXCLUDED."spentNano", "updatedAt" = now()`;
  }
}

/** Charges a completed request. Idempotent on requestId. Balance may dip below zero by at most one request. */
export async function chargeUsage(input: UsageChargeInput, tx: TransactionClient): Promise<LedgerResult | null> {
  if (input.amountNano <= 0n) return null;
  const result = await applyLedgerEntry(
    {
      organizationId: input.organizationId,
      type: "USAGE",
      amountNano: -input.amountNano,
      description: input.description,
      idempotencyKey: `usage:${input.requestId}`,
      requestId: input.requestId,
      metadata: input.metadata,
    },
    tx,
  );
  await incrementCounters(tx, input);
  return result;
}

/** Admin/finance adjustment (refund or correction). Always audited. */
export async function adjustCredits(adminUserId: string, input: { organizationId: string; amountNano: bigint; reason: string; idempotencyKey: string; type?: "ADJUSTMENT" | "REFUND" | "PROMO" }) {
  await requireAdminPermission(adminUserId, "refunds:write");
  if (input.amountNano === 0n) throw new ValidationError("Amount cannot be zero.");
  if (input.reason.trim().length < 3) throw new ValidationError("A reason is required.");
  const result = await applyLedgerEntry({
    organizationId: input.organizationId,
    type: input.type ?? "ADJUSTMENT",
    amountNano: input.amountNano,
    description: `${input.type ?? "Adjustment"}: ${input.reason.trim()}`,
    idempotencyKey: input.idempotencyKey,
    createdById: adminUserId,
  });
  await recordAudit({
    organizationId: input.organizationId,
    actorType: "ADMIN",
    actorId: adminUserId,
    action: "billing.credits_adjusted",
    targetType: "organization",
    targetId: input.organizationId,
    metadata: { amount: formatUsd(input.amountNano), reason: input.reason, duplicate: result.duplicate },
  });
  return result;
}

export async function updateSpendControls(
  userId: string,
  organizationId: string,
  input: {
    monthlySpendCapNano?: bigint | null;
    lowBalanceThresholdNano?: bigint | null;
    autoRechargeEnabled?: boolean;
    autoRechargeThresholdNano?: bigint | null;
    autoRechargeAmountNano?: bigint | null;
  },
) {
  await requireOrgPermission(userId, organizationId, "billing:manage");
  if (input.autoRechargeEnabled) {
    const threshold = input.autoRechargeThresholdNano;
    const amount = input.autoRechargeAmountNano;
    if (!threshold || !amount || amount < 5_000_000_000n || amount > 1_000_000_000_000n) {
      throw new ValidationError("Auto-recharge needs a threshold and a recharge amount between $5 and $1,000.");
    }
  }
  const updated = await prisma.organization.update({ where: { id: organizationId }, data: input });
  await recordAudit({
    organizationId,
    actorType: "USER",
    actorId: userId,
    action: input.autoRechargeEnabled === undefined ? "billing.limits_updated" : input.autoRechargeEnabled ? "billing.auto_recharge_enabled" : "billing.auto_recharge_disabled",
    targetType: "organization",
    targetId: organizationId,
  });
  return updated;
}
