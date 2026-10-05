import { Bot, Brain, Coins, Gauge, Layers, Plug } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Agents — preview",
  description: "Define versioned agents with a model, system prompt, MCP tools, budget and step limits. Hosted agent runtime is on the roadmap.",
  alternates: { canonical: "/agents" },
};

export default function AgentsPage() {
  return (
    <>
      <PageHero eyebrow="Agents · preview" title="Agents with budgets and boundaries." description="Define agents as versioned configuration — model, instructions, MCP tools, memory, temperature, budget and maximum steps. The hosted runtime and agent marketplace are on the roadmap.">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/dashboard/agents">Open agent builder</Link>
          </Button>
          <Badge variant="outline" className="self-center">
            Runtime not yet available
          </Badge>
        </div>
      </PageHero>
      <section className="container-page py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: Bot, t: "Versioned definitions", d: "Every edit creates an immutable version, so you can pin and roll back." },
            { icon: Layers, t: "Any catalog model", d: "Agents call models through the same gateway, routing and fallback." },
            { icon: Plug, t: "MCP tools", d: "Attach approved MCP servers; tool permissions are enforced per organization." },
            { icon: Coins, t: "Budgets", d: "Per-agent spend ceilings on top of key, project and organization limits." },
            { icon: Gauge, t: "Step limits", d: "Bound the number of model/tool iterations an agent may take." },
            { icon: Brain, t: "Memory & knowledge", d: "Optional memory and knowledge sources (roadmap)." },
          ].map((x) => (
            <div key={x.t} className="panel rounded-xl p-6">
              <x.icon className="size-5 text-accent" />
              <h3 className="mt-4 text-[15px] font-semibold text-fg">{x.t}</h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
