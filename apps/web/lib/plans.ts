import "server-only";
import { prisma } from "@inrent/db";

export async function safePlans() {
  try {
    return await prisma.plan.findMany({ orderBy: { sortOrder: "asc" } });
  } catch {
    return [];
  }
}
