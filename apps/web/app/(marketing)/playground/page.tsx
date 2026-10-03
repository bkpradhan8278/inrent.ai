import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHero } from "@/components/marketing/page-hero";
import { Playground } from "@/components/playground/playground";
import { safePublicModels } from "@/lib/catalog";
import { toPlaygroundModels } from "@/lib/playground-models";
import { getSession } from "@/lib/session";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Playground", description: "Test any model in the INRENT catalog, tune parameters and export the request as code.", alternates: { canonical: "/playground" } };

export default async function PublicPlaygroundPage({ searchParams }: { searchParams: Promise<{ model?: string }> }) {
  const { model } = await searchParams;
  const session = await getSession();
  if (session) redirect(`/dashboard/playground${model ? `?model=${encodeURIComponent(model)}` : ""}`);
  const models = toPlaygroundModels(await safePublicModels());
  return (
    <>
      <PageHero eyebrow="Playground" title="Try any model. Export the code." description="Tune the system prompt, temperature, tools and structured output, watch tokens and latency, then copy the exact request as cURL, Python, JavaScript or TypeScript. Sign in to run requests." />
      <section className="container-page py-12">
        <Playground models={models} apiBase={site.apiBaseUrl} signedIn={false} initial={{ model }} />
      </section>
    </>
  );
}
