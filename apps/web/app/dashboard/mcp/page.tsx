import type { Metadata } from "next";
import { isFeatureEnabled, listMcpServers, MCP_TEMPLATES } from "@inrent/services";
import { PreviewGate } from "@/components/dashboard/preview-gate";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { requireOrgPermission } from "@/lib/session";
import { McpManager } from "./mcp-manager";

export const metadata: Metadata = { title: "MCP" };

export default async function McpPage() {
  const ws = await requireOrgPermission("mcp:read");
  const enabled = await isFeatureEnabled("MCP_ENABLED", ws.org.id);
  const servers = enabled ? await listMcpServers(ws.org.id) : [];
  return (
    <>
      <PageHeader
        title="MCP servers"
        badge={<Badge variant="iris">Preview</Badge>}
        description="Register Model Context Protocol servers and approve each tool individually. Tools start disabled; write and destructive tools need an owner or admin. Gateway-side tool execution is coming soon — this is the control plane."
      />
      {enabled ? (
        <McpManager
          canWrite={ws.can("mcp:write")}
          isAdmin={ws.role === "OWNER" || ws.role === "ADMIN"}
          templates={MCP_TEMPLATES}
          servers={servers.map((s) => ({ ...s, createdAt: s.createdAt.toISOString(), tools: s.tools.map((t) => ({ ...t, approvedAt: t.approvedAt?.toISOString() ?? null })) }))}
        />
      ) : (
        <PreviewGate feature="MCP" />
      )}
    </>
  );
}
