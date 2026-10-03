import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { RoadmapTimeline } from "@/components/marketing/roadmap";

export const metadata: Metadata = { title: "Roadmap", description: "From a unified AI API to GPU cloud and AI infrastructure marketplaces — the INRENT roadmap.", alternates: { canonical: "/roadmap" } };

export default function RoadmapPage() {
  return (
    <>
      <PageHero eyebrow="Roadmap" title="AI APIs today. AI compute next." description="INRENT is built in phases. Each phase ships properly before the next begins; dates are shared when we are confident in them." />
      <section className="container-page py-16">
        <RoadmapTimeline />
        <p className="mt-8 text-xs text-fg-subtle">The roadmap describes intent, not commitments. Features marked planned are not available today.</p>
      </section>
    </>
  );
}
