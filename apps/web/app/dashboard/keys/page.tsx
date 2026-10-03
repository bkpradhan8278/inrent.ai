import type { Metadata } from "next";
import { listApiKeys } from "@inrent/services";
import { PageHeader } from "@/components/dashboard/ui";
import { usd } from "@/lib/dashboard";
import { getWorkspace } from "@/lib/session";
import { site } from "@/lib/site";
import { KeysManager, type KeyRow } from "./keys-manager";

export const metadata: Metadata = { title: "API Keys" };

export default async function KeysPage({ searchParams }: { searchParams: Promise<{ create?: string }> }) {
  const { create } = await searchParams;
  const ws = await getWorkspace();
  const keys = await listApiKeys(ws.org.id, { includeRevoked: true });
  const rows: KeyRow[] = keys.map((k) => ({
    id: k.id,
    name: k.name,
    prefix: k.displayPrefix,
    lastFour: k.lastFour,
    environment: k.environment,
    projectId: k.projectId,
    projectName: ws.projects.find((p) => p.id === k.projectId)?.name ?? "—",
    permissions: k.permissions,
    allowedModels: k.allowedModels,
    spendLimitUsd: k.spendLimitNano !== null ? usd(k.spendLimitNano) : "",
    rpmLimit: k.rpmLimit,
    tpmLimit: k.tpmLimit,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    createdAt: k.createdAt.toISOString(),
  }));
  return (
    <>
      <PageHeader title="API Keys" description="Keys authenticate requests to the INRENT API. Secrets are shown once and stored only as salted hashes." />
      <KeysManager
        rows={rows}
        projects={ws.projects.map((p) => ({ id: p.id, name: p.name }))}
        activeProjectId={ws.project.id}
        canWrite={ws.can("keys:write")}
        openCreate={create === "1"}
        apiBase={site.apiBaseUrl}
      />
    </>
  );
}
