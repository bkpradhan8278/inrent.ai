import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { prisma } from "@inrent/db";
import { PageHeader } from "@/components/dashboard/ui";
import { ModelExplorer } from "@/components/marketing/model-explorer";
import { Badge } from "@/components/ui/badge";
import { safePublicModels } from "@/lib/catalog";
import { getWorkspace } from "@/lib/session";
import { vendorName } from "@/lib/vendors";

export const metadata: Metadata = { title: "Models" };

export default async function DashboardModelsPage() {
  const ws = await getWorkspace();
  const [models, byok] = await Promise.all([
    safePublicModels(),
    prisma.byokCredential.findMany({ where: { organizationId: ws.org.id, enabled: true, deletedAt: null }, select: { provider: { select: { slug: true } } } }),
  ]);
  const connected = [...new Set(byok.map((b) => b.provider.slug))];
  return (
    <>
      <PageHeader
        title="Models"
        description="Every model shares one OpenAI-compatible API. Availability reflects platform serving status and your connected BYOK providers."
        actions={
          <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-fg-subtle">
            BYOK:
            {connected.length ? connected.map((s) => <Badge key={s} variant="iris">{vendorName(s)}</Badge>) : <Link href="/dashboard/byok" className="text-accent hover:underline">connect a provider</Link>}
          </div>
        }
      />
      <Suspense>
        <ModelExplorer models={models} />
      </Suspense>
    </>
  );
}
