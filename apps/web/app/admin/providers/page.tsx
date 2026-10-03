import type { Metadata } from "next";
import { INTEGRATION_MODE_INFO } from "@inrent/core";
import { prisma } from "@inrent/db";
import { hasPlatformCredential } from "@inrent/services";
import { PageHeader } from "@/components/dashboard/ui";
import { requireAdmin } from "@/lib/session";
import { ProviderEditor, type ProviderRow } from "./provider-editor";

export const metadata: Metadata = { title: "Providers" };

export default async function AdminProviders() {
  const admin = await requireAdmin("providers:read");
  const providers = await prisma.provider.findMany({ orderBy: [{ enabled: "desc" }, { priority: "asc" }, { name: "asc" }], include: { _count: { select: { endpoints: true } } } });
  const rows: ProviderRow[] = providers.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    adapter: p.adapter,
    baseUrl: p.baseUrl,
    credentialRef: p.credentialRef ?? "",
    credentialResolved: hasPlatformCredential(p),
    integrationMode: p.integrationMode,
    resaleVerified: p.resaleVerified,
    termsUrl: p.termsUrl ?? "",
    termsNotes: p.termsNotes ?? "",
    termsReviewedAt: p.termsReviewedAt?.toISOString() ?? null,
    byokSupported: p.byokSupported,
    enabled: p.enabled,
    priority: p.priority,
    costMultiplier: p.costMultiplier.toString(),
    healthStatus: p.healthStatus,
    lastHealthCheckAt: p.lastHealthCheckAt?.toISOString() ?? null,
    latencyP50Ms: p.latencyP50Ms,
    endpoints: p._count.endpoints,
  }));
  return (
    <>
      <PageHeader
        title="Providers"
        description="Platform-funded serving requires a verified legal basis: resale terms reviewed, an authorized reseller agreement, an enterprise agreement, or a commercially-licensed open model. Everything else is BYOK-only. Credentials are references to a secret store — never the secret itself."
      />
      <ProviderEditor rows={rows} canWrite={admin.can("providers:write")} modes={INTEGRATION_MODE_INFO} />
    </>
  );
}
