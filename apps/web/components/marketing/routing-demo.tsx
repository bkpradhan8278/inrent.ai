"use client";

import { m, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Illustrative routing demo. Values are relative and fictional — they show *how* policies
 * choose, not real provider performance.
 */
const ROUTES = [
  { id: "a", name: "Provider A", cost: 0.35, latency: 0.8, quality: 0.6 },
  { id: "b", name: "Provider B", cost: 0.7, latency: 0.3, quality: 0.75 },
  { id: "c", name: "Provider C", cost: 0.9, latency: 0.55, quality: 0.95 },
  { id: "d", name: "Self-hosted", cost: 0.2, latency: 0.6, quality: 0.55 },
];

const POLICIES = [
  { id: "balanced", label: "Balanced", pick: "b", note: "Weighs cost, latency and quality." },
  { id: "cost", label: "Lowest cost", pick: "d", note: "Cheapest eligible endpoint first." },
  { id: "latency", label: "Lowest latency", pick: "b", note: "Fastest time-to-first-token first." },
  { id: "quality", label: "Best quality", pick: "c", note: "Highest quality tier first." },
  { id: "fallback", label: "Fallback", pick: "a", note: "Primary fails → next provider, automatically." },
] as const;

export function RoutingDemo() {
  const [policy, setPolicy] = useState<(typeof POLICIES)[number]["id"]>("balanced");
  // Each selection is a "run"; the fallback animation fails the primary 900ms into its run.
  const [run, setRun] = useState(0);
  const [failedRun, setFailedRun] = useState(-1);
  const failed = policy === "fallback" && failedRun === run;
  const current = POLICIES.find((p) => p.id === policy)!;

  useEffect(() => {
    if (policy !== "fallback") return;
    const t = setTimeout(() => setFailedRun(run), 900);
    return () => clearTimeout(t);
  }, [policy, run]);

  const chosen = policy === "fallback" ? (failed ? "a" : "b") : current.pick;

  return (
    <div className="panel overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center gap-1 border-b border-border p-2">
        {POLICIES.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => {
              setPolicy(p.id);
              setRun((r) => r + 1);
            }}
            aria-pressed={policy === p.id}
            className={cn("relative h-8 rounded-md px-3 text-[13px] transition-colors", policy === p.id ? "text-fg" : "text-fg-subtle hover:text-fg-muted")}
          >
            {policy === p.id ? <m.span layoutId="routing-policy" className="absolute inset-0 -z-0 rounded-md bg-surface-3 shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
            <span className="relative z-10">{p.label}</span>
          </button>
        ))}
      </div>
      <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col justify-between gap-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">Request</div>
            <pre className="mt-2 overflow-x-auto rounded-lg border border-border bg-[#080a0e] p-3 font-mono text-[12px] leading-relaxed text-fg-muted">
{`{
  "model": "inrent/auto",
  "inrent": { "route": "${policy === "fallback" ? "balanced" : policy === "cost" ? "lowest_cost" : policy === "latency" ? "lowest_latency" : policy === "quality" ? "best_quality" : "balanced"}" }
}`}
            </pre>
          </div>
          <AnimatePresence mode="wait">
            <m.p key={policy} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-sm text-fg-muted">
              {current.note}
            </m.p>
          </AnimatePresence>
        </div>
        <ul className="flex flex-col gap-2.5" aria-live="polite">
          {ROUTES.map((r) => {
            const isChosen = r.id === chosen;
            const isFailed = policy === "fallback" && failed && r.id === "b";
            return (
              <m.li key={r.id} layout className={cn("relative rounded-lg border px-3.5 py-3 transition-colors duration-300", isChosen ? "border-[rgb(92_235_192/0.45)] bg-accent-soft shadow-[0_8px_28px_-18px_rgb(92_235_192/0.7)]" : isFailed ? "border-[rgb(255_107_107/0.4)] bg-danger-soft" : "border-border bg-bg-elevated")}>
                <div className="flex items-center justify-between gap-3">
                  <span className={cn("text-[13px] font-medium", isChosen ? "text-fg" : "text-fg-muted")}>{r.name}</span>
                  <span className={cn("font-mono text-[11px]", isChosen ? "text-accent" : isFailed ? "text-danger" : "text-fg-subtle")}>
                    {isChosen ? "→ routed" : isFailed ? "✕ 503 · falling back" : "standby"}
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-3">
                  {(["cost", "latency", "quality"] as const).map((k) => (
                    <div key={k}>
                      <div className="mb-1 font-mono text-[9.5px] uppercase tracking-wider text-fg-subtle">{k}</div>
                      <div className="h-1 overflow-hidden rounded-full bg-surface-3">
                        <m.div className={cn("h-full rounded-full", k === "quality" ? "bg-iris" : k === "cost" ? "bg-amber" : "bg-accent")} initial={false} animate={{ width: `${r[k] * 100}%` }} transition={{ duration: 0.6 }} />
                      </div>
                    </div>
                  ))}
                </div>
              </m.li>
            );
          })}
        </ul>
      </div>
      <div className="border-t border-border px-5 py-2.5 font-mono text-[10.5px] text-fg-subtle">Illustrative values. Real routing uses configured prices, measured latency and provider health.</div>
    </div>
  );
}
