import type { Metadata } from "next";
import { Suspense } from "react";
import { ModelExplorer } from "@/components/marketing/model-explorer";
import { Eyebrow } from "@/components/ui/misc";
import { safePublicModels } from "@/lib/catalog";

export const revalidate = 120;

export const metadata: Metadata = {
  title: "Models",
  description: "Explore AI models available through the INRENT API — capabilities, context length, providers and verified pricing.",
  alternates: { canonical: "/models" },
};

export default async function ModelsPage() {
  const models = await safePublicModels();
  return (
    <div className="container-page py-14">
      <div className="mb-10 flex flex-col gap-4">
        <Eyebrow>Model catalog</Eyebrow>
        <h1 className="text-display text-4xl text-fg sm:text-5xl">Models</h1>
        <p className="max-w-2xl text-fg-muted">
          Every model uses the same OpenAI-compatible API. Availability shows whether a model is served with INRENT credits, with your own provider key, or not yet enabled. Prices appear once verified against the provider&apos;s current price list.
        </p>
      </div>
      <Suspense>
        <ModelExplorer models={models} />
      </Suspense>
    </div>
  );
}
