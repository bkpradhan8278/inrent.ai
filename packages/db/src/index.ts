import { Prisma, PrismaClient } from "@prisma/client";

export { Prisma, PrismaClient };
export type * from "@prisma/client";

declare global {
  var __inrentPrisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  return new PrismaClient({
    log: process.env.PRISMA_LOG_QUERIES === "true" ? ["query", "warn", "error"] : ["warn", "error"],
  });
}

/**
 * Shared Prisma client. Reused across hot reloads in development so we do not
 * exhaust database connections.
 */
export const prisma: PrismaClient = globalThis.__inrentPrisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__inrentPrisma = prisma;
}

export type TransactionClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends">;
