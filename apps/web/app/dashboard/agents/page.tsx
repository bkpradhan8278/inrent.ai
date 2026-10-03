import type { Metadata } from "next";
import { isFeatureEnabled, listAgents, listMcpServers } from "@inrent/services";
import { PreviewGate } from "@/components/dashboard/preview-gate";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { safePublicModels } from "@/lib/catalog";
import { usd } from "@/lib/dashboard";
import { requireOrgPermission } from "@/lib/session";
import { AgentsManager } from "./agents-manager";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
  const ws = await requireOrgPermission("agents:read");
  const enabled = await isFeatureEnabled("AGENTS_ENABLED", ws.org.id);
  if (!enabled) {
    return (
      <>
        <PageHeader title="Agents" badge={<Badge variant="iris">Preview</Badge>} />
        <PreviewGate feature="Agents" />
      </>
    );
  }
  const [agents, servers, models] = await Promise.all([listAgents(ws.org.id), listMcpServers(ws.org.id), safePublicModels()]);
  return (
    <>
      <PageHeader
        title="Agents"
        badge={<Badge variant="iris">Preview</Badge>}
        description="Define versioned agents — model, instructions, MCP tools and a hard budget. Definitions are validated now; the hosted execution runtime is coming soon."
      />
      <AgentsManager
        canWrite={ws.can("agents:write")}
        models={models.filter((m) => m.capabilities.includes("chat")).map((m) => ({ slug: m.slug, name: m.displayName }))}
        servers={servers.filter((s) => s.enabled).map((s) => ({ id: s.id, name: s.name }))}
        agents={agents.map((a) => {
          const v = a.versions[0];
          return {
            id: a.id,
            name: a.name,
            description: a.description ?? "",
            status: a.status,
            updatedAt: a.updatedAt.toISOString(),
            version: v ? { version: v.version, modelSlug: v.modelSlug, systemPrompt: v.systemPrompt, temperature: v.temperature, maxSteps: v.maxSteps, budgetUsd: v.budgetNano !== null ? usd(v.budgetNano) : "", mcpServerIds: v.mcpServerIds } : null,
          };
        })}
      />
    </>
  );
}
