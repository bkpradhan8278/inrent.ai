import { cn } from "@/lib/utils";

export const PHASES = [
  { n: 1, title: "Unified AI API", body: "OpenAI-compatible API, keys, credits, usage, logs and the developer platform.", state: "now" },
  { n: 2, title: "More providers + routing", body: "Broader catalog, cost/latency routing, health-aware fallback, BYOK across providers.", state: "next" },
  { n: 3, title: "Self-hosted inference", body: "Open-weight models served on INRENT-operated vLLM endpoints.", state: "later" },
  { n: 4, title: "MCP + Agents", body: "Tool connectivity with permissions and audit, then hosted agent runtime.", state: "later" },
  { n: 5, title: "GPU Cloud", body: "Rent GPUs, deploy models and scale inference from the same account.", state: "later" },
  { n: 6, title: "GPU Marketplace", body: "Verified hosts list capacity; customers deploy, monitor and pay per second.", state: "later" },
  { n: 7, title: "Model Marketplace", body: "Verified publishers ship models with licensing, pricing and revenue share.", state: "later" },
  { n: 8, title: "Enterprise AI Infrastructure", body: "Dedicated deployments, private networking, data residency and SLAs.", state: "later" },
] as const;

export function RoadmapTimeline({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={cn("grid gap-3", compact ? "sm:grid-cols-2 lg:grid-cols-4" : "md:grid-cols-2")}>
      {PHASES.map((p) => (
        <li
          key={p.n}
          className={cn(
            "relative rounded-xl border p-5 transition-colors",
            p.state === "now" ? "border-[rgb(92_235_192/0.4)] bg-accent-soft" : p.state === "next" ? "border-border-strong bg-surface" : "border-border bg-bg-elevated",
          )}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">Phase {p.n}</span>
            {p.state === "now" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg">
                <span className="size-1.5 rounded-full bg-accent-fg" /> Building now
              </span>
            ) : p.state === "next" ? (
              <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] text-fg-muted">In progress</span>
            ) : (
              <span className="rounded-full border border-border px-2 py-0.5 text-[10px] text-fg-subtle">Planned</span>
            )}
          </div>
          <h3 className="mt-3 text-[15px] font-semibold text-fg">{p.title}</h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-fg-muted">{p.body}</p>
        </li>
      ))}
    </ol>
  );
}
