import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { isFeatureEnabled, listByokCredentials } from "@inrent/services";
import { PageHeader } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { requireOrgPermission } from "@/lib/session";
import { ByokManager } from "./byok-manager";

export const metadata: Metadata = { title: "Bring your own key" };

export default async function ByokPage() {
  const ws = await requireOrgPermission("byok:read");
  const [enabled, creds, providers] = await Promise.all([
    isFeatureEnabled("BYOK_ENABLED", ws.org.id),
    listByokCredentials(ws.org.id),
    prisma.provider.findMany({ where: { byokSupported: true, adapter: { not: "MOCK" } }, select: { id: true, name: true, slug: true, termsUrl: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader
        title="Bring your own key"
        badge={<Badge variant="iris">BYOK</Badge>}
        description="Route requests through your own provider accounts. Your provider bills you directly; INRENT adds routing, fallback, logging and analytics. Keys are encrypted with AES-256-GCM and never shown again."
      />
      <ByokManager
        enabled={enabled}
        canWrite={ws.can("byok:write")}
        preferByok={ws.org.preferByok}
        providers={providers.map((p) => ({ id: p.id, name: p.name, slug: p.slug, termsUrl: p.termsUrl }))}
        creds={creds.map((c) => ({
          id: c.id,
          label: c.label,
          hint: c.keyHint,
          enabled: c.enabled,
          provider: c.provider.name,
          providerSlug: c.provider.slug,
          lastTestedAt: c.lastTestedAt?.toISOString() ?? null,
          lastTestOk: c.lastTestOk,
          lastTestError: c.lastTestError,
          createdAt: c.createdAt.toISOString(),
        }))}
      />
    </>
  );
}
