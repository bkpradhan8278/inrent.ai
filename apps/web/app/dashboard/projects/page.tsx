import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { currentPeriod } from "@inrent/services";
import { PageHeader } from "@/components/dashboard/ui";
import { usd } from "@/lib/dashboard";
import { getWorkspace } from "@/lib/session";
import { ProjectsManager, type ProjectRow } from "./projects-manager";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const ws = await getWorkspace();
  const ids = ws.projects.map((p) => p.id);
  const [keyCounts, spend] = await Promise.all([
    prisma.apiKey.groupBy({ by: ["projectId"], where: { organizationId: ws.org.id, revokedAt: null }, _count: true }),
    prisma.spendCounter.findMany({ where: { scope: "project", scopeId: { in: ids }, period: currentPeriod() } }),
  ]);
  const rows: ProjectRow[] = ws.projects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description ?? "",
    isDefault: p.isDefault,
    budgetUsd: p.monthlyBudgetNano !== null ? usd(p.monthlyBudgetNano) : "",
    allowedModels: p.allowedModels,
    keys: keyCounts.find((k) => k.projectId === p.id)?._count ?? 0,
    monthSpendUsd: usd(spend.find((s) => s.scopeId === p.id)?.spentNano ?? 0n),
    createdAt: p.createdAt.toISOString(),
  }));
  return (
    <>
      <PageHeader title="Projects" description="Projects isolate keys, budgets, model allowlists and analytics within an organization." />
      <ProjectsManager rows={rows} canManage={ws.can("projects:write")} activeProjectId={ws.project.id} />
    </>
  );
}
