import type { Metadata } from "next";
import { prisma, type Prisma } from "@inrent/db";
import { AdminSearch } from "@/components/admin/search";
import { PageHeader } from "@/components/dashboard/ui";
import { requireAdmin } from "@/lib/session";
import { NativeSelect } from "@/components/ui/input";
import { ModelEditor, type ModelRow } from "./model-editor";

export const metadata: Metadata = { title: "Models & pricing" };

const dec = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? "" : d.toString());

export default async function AdminModels({ searchParams }: { searchParams: Promise<{ q?: string; filter?: string }> }) {
  const sp = await searchParams;
  const admin = await requireAdmin("models:read");
  const q = sp.q?.trim();
  const models = await prisma.model.findMany({
    where: {
      ...(q ? { OR: [{ slug: { contains: q, mode: "insensitive" } }, { displayName: { contains: q, mode: "insensitive" } }] } : {}),
      ...(sp.filter === "review" ? { verificationStatus: "NEEDS_REVIEW" } : sp.filter === "unpriced" ? { endpoints: { some: { prices: { none: { active: true } } } } } : {}),
    },
    orderBy: [{ featured: "desc" }, { vendor: "asc" }, { slug: "asc" }],
    include: {
      endpoints: {
        include: { provider: { select: { name: true, slug: true, integrationMode: true, enabled: true, resaleVerified: true } }, prices: { orderBy: { effectiveFrom: "desc" }, take: 4 } },
        orderBy: { priority: "asc" },
      },
    },
  });
  const rows: ModelRow[] = models.map((m) => ({
    id: m.id,
    slug: m.slug,
    displayName: m.displayName,
    vendor: m.vendor,
    status: m.status,
    verificationStatus: m.verificationStatus,
    verificationNotes: m.verificationNotes ?? "",
    license: m.license ?? "",
    licenseUrl: m.licenseUrl ?? "",
    commercialUse: m.commercialUse,
    resaleAllowed: m.resaleAllowed,
    featured: m.featured,
    isPublic: m.isPublic,
    isDevOnly: m.isDevOnly,
    qualityTier: m.qualityTier,
    lastVerifiedAt: m.lastVerifiedAt?.toISOString() ?? null,
    endpoints: m.endpoints.map((e) => ({
      id: e.id,
      provider: e.provider.name,
      providerSlug: e.provider.slug,
      providerEnabled: e.provider.enabled,
      integrationMode: e.provider.integrationMode,
      resaleVerified: e.provider.resaleVerified,
      providerModelId: e.providerModelId,
      enabled: e.enabled,
      priority: e.priority,
      prices: e.prices.map((p) => ({
        id: p.id,
        active: p.active,
        input: dec(p.inputPerMTok),
        output: dec(p.outputPerMTok),
        cached: dec(p.cachedInputPerMTok),
        perImage: dec(p.perImage),
        perRequest: dec(p.perRequest),
        markup: p.platformMarkupPct.toString(),
        source: p.pricingSource ?? "",
        effectiveFrom: p.effectiveFrom.toISOString(),
      })),
    })),
  }));
  return (
    <>
      <PageHeader title="Models & pricing" description="Prices are versioned: saving creates a new active price and closes the previous one. Every change records its source and is audit-logged. A model is only served with platform credit when its license, resale status and price are verified." />
      <AdminSearch action="/admin/models" q={q} placeholder="Search models">
        <NativeSelect name="filter" defaultValue={sp.filter ?? ""} className="w-auto min-w-36" aria-label="Filter">
          <option value="">All models</option>
          <option value="review">Needs review</option>
          <option value="unpriced">Has unpriced endpoint</option>
        </NativeSelect>
      </AdminSearch>
      <ModelEditor rows={rows} canWrite={admin.can("models:write")} canPrice={admin.can("pricing:write")} defaultMarkup={process.env.DEFAULT_PLATFORM_MARKUP_PCT ?? "5.5"} />
    </>
  );
}
