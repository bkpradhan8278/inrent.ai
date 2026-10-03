import { Activity, Boxes, Cpu, Gauge, HardDrive, Rocket, Server, Terminal } from "lucide-react";
import type { Metadata } from "next";
import { GpuGrid } from "@/components/marketing/gpu-grid";
import { WaitlistForm } from "@/components/marketing/forms";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { SectionHeading } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "GPU Cloud — coming soon",
  description: "Rent GPUs, deploy models and scale inference from the same platform as your AI API. INRENT GPU Cloud is in development — join the waitlist.",
  alternates: { canonical: "/gpu" },
};

const GPUS = ["RTX 4090", "RTX 5090", "L40S", "A100", "H100", "H200", "B200", "B300"];

const CAPS = [
  { icon: Cpu, title: "GPU marketplace", body: "Compare offers across providers and INRENT capacity by GPU, VRAM, region and reliability." },
  { icon: Rocket, title: "One-click model deploys", body: "Pick a model and GPU; we provision vLLM, health-check it and register the endpoint in the gateway." },
  { icon: Terminal, title: "API & CLI first", body: "inrent gpu search, deploy, ssh, logs and stop — the same keys and billing as the API." },
  { icon: Gauge, title: "Serverless inference", body: "Scale from zero to N GPUs behind an OpenAI-compatible endpoint." },
  { icon: Activity, title: "Metrics & logs", body: "GPU utilization, memory, throughput and request logs in one dashboard." },
  { icon: HardDrive, title: "Bring your own container", body: "Custom Docker images for training, fine-tuning and batch jobs." },
];

export default function GpuPage() {
  return (
    <>
      <PageHero
        tone="amber"
        eyebrow="GPU Cloud · coming soon"
        title={<span className="text-gradient-amber">Compute is coming.</span>}
        description="Rent GPUs, deploy models and scale AI workloads from the same platform — with the same keys, billing and observability. GPU Cloud is not live yet; nothing on this page is available for rent today."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="amber">In development</Badge>
          <Badge variant="outline">No live availability or pricing yet</Badge>
        </div>
      </PageHero>

      <section className="container-page grid gap-12 py-20 lg:grid-cols-[1fr_1fr] lg:items-center">
        <div className="flex flex-col gap-6">
          <SectionHeading eyebrow="What we're building" title="Rent compute. Deploy models. Scale inference." description="A GPU layer designed around the INRENT API — so the model you deploy on a GPU becomes one more model your application can call." />
          <div className="flex flex-wrap gap-2">
            {GPUS.map((g) => (
              <span key={g} className="rounded-md border border-border bg-surface px-2.5 py-1 font-mono text-xs text-fg-muted">
                {g}
              </span>
            ))}
          </div>
          <p className="text-xs text-fg-subtle">GPU types we intend to support. Availability and pricing will be shown live once the service launches.</p>
        </div>
        <GpuGrid />
      </section>

      <section className="border-y border-border bg-bg-elevated/40">
        <div className="container-page py-20">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {CAPS.map((c) => (
              <div key={c.title} className="panel rounded-xl p-6">
                <c.icon className="size-5 text-amber" />
                <h3 className="mt-4 text-[15px] font-semibold text-fg">{c.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="container-page grid gap-12 py-20 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="flex flex-col gap-5">
          <SectionHeading eyebrow="How it will work" title="From model to endpoint" />
          <ol className="flex flex-col gap-3">
            {["Choose a model", "Choose a GPU offer", "Pick a container (vLLM, TGI or custom)", "We provision, load and health-check it", "The endpoint is registered in the INRENT gateway", "Autoscale from zero to N GPUs"].map((s, i) => (
              <li key={s} className="flex items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">
                <span className="flex size-6 items-center justify-center rounded-full border border-[rgb(245_180_85/0.4)] font-mono text-[11px] text-amber">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-bg-elevated px-4 py-3 text-xs text-fg-subtle">
            <Server className="size-4 text-fg-muted" />
            Provider-agnostic: built on a GPU provider abstraction for partner clouds and INRENT-operated hardware.
          </div>
        </div>
        <div id="waitlist" className="panel scroll-mt-24 rounded-2xl p-6 sm:p-8">
          <div className="flex items-center gap-2">
            <Boxes className="size-5 text-amber" />
            <h2 className="text-xl font-semibold text-fg">Be first to access INRENT GPU Cloud.</h2>
          </div>
          <p className="mt-2 text-sm text-fg-muted">Tell us what you plan to run. We&apos;ll reach out as capacity opens.</p>
          <div className="mt-6">
            <WaitlistForm />
          </div>
        </div>
      </section>
    </>
  );
}
