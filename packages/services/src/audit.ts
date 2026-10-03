import { prisma, type Prisma, type TransactionClient } from "@inrent/db";

export interface AuditInput {
  organizationId?: string | null;
  actorType: "USER" | "API_KEY" | "ADMIN" | "SYSTEM";
  actorId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
  ipHash?: string | null;
  userAgent?: string | null;
}

/** Appends an audit record. Pass a transaction client to make it atomic with the change. */
export async function recordAudit(input: AuditInput, db: TransactionClient = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      organizationId: input.organizationId ?? null,
      actorType: input.actorType,
      actorId: input.actorId ?? null,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      metadata: input.metadata,
      ipHash: input.ipHash ?? null,
      userAgent: input.userAgent?.slice(0, 256) ?? null,
    },
  });
}
