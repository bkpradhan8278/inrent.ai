import type { Metadata } from "next";
import Link from "next/link";
import { PageHero } from "@/components/marketing/page-hero";
import { RoadmapTimeline } from "@/components/marketing/roadmap";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "About", description: "INRENT is building AI infrastructure without the infrastructure: one API for AI models today, GPU compute next.", alternates: { canonical: "/about" } };

export default function AboutPage() {
  return (
    <>
      <PageHero eyebrow="About" title="AI infrastructure, without the infrastructure." description="INRENT exists so developers can build with any AI model without stitching together providers, keys, billing and observability — and, next, without wrangling GPUs." />
      <section className="container-page grid gap-12 py-16 lg:grid-cols-2">
        <div className="space-y-4 text-[15px] leading-relaxed text-fg-muted">
          <p>The AI model landscape changes every month. Teams want the best model for each job, but every provider means another contract, another SDK, another bill and another dashboard.</p>
          <p>INRENT puts one well-engineered layer in between: a single OpenAI-compatible API, with routing and fallback, exact usage billing, spend controls and request-level observability. We are careful about the details that matter in production — idempotent billing, encrypted secrets, least-privilege access and honest status.</p>
          <p>We also intend to own more of the stack over time: self-hosted open-weight inference, then GPU Cloud and marketplaces for compute and models. We will only describe those as available when they are.</p>
          <div className="flex gap-3 pt-2">
            <Button asChild>
              <Link href="/sign-up">Start building</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/contact">Contact us</Link>
            </Button>
          </div>
        </div>
        <RoadmapTimeline />
      </section>
    </>
  );
}
