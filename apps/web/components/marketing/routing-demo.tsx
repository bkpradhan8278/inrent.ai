"use client";

import { useState } from "react";
import { BrandLogo } from "@/components/brand/icons";
import { cn } from "@/lib/utils";

/**
 * Interactive routing-policy demo. Scores are relative and fictional — they show *how* policies
 * choose between eligible providers, not real provider performance.
 */

const POLICIES = [
  { id: "balanced", label: "Balanced", route: "balanced", title: "Balanced", body: "Weighs cost, latency and quality equally across eligible providers.", w: [1, 1, 1] },
  { id: "cost", label: "Lowest cost", route: "lowest_cost", title: "Lowest cost", body: "Prefers the cheapest eligible provider that still meets your constraints.", w: [0.7, 0.15, 0.15] },
  { id: "latency", label: "Lowest latency", route: "lowest_latency", title: "Lowest latency", body: "Prefers the provider with the fastest recent time-to-first-token.", w: [0.15, 0.7, 0.15] },
  { id: "quality", label: "Best quality", route: "best_quality", title: "Best quality", body: "Prefers the highest-quality eligible route for the requested model.", w: [0.15, 0.15, 0.7] },
  { id: "fallback", label: "Fallback", route: "balanced", title: "Health-aware fallback", body: "The top-ranked provider returns 503. INRENT retries on the next eligible one — before the first byte reaches your app.", w: [1, 1, 1] },
] as const;

type PolicyId = (typeof POLICIES)[number]["id"];

// c/l/q are "goodness" scores (higher = cheaper / faster / better).
const CANDS = [
  { id: "a", name: "Provider A", sub: "platform-funded", mono: "A", c: 0.45, l: 0.62, q: 0.95 },
  { id: "b", name: "Provider B", sub: "your key · BYOK", mono: "B", c: 0.7, l: 0.74, q: 0.82 },
  { id: "c", name: "Provider C", sub: "enterprise agreement", mono: "C", c: 0.88, l: 0.9, q: 0.44 },
  { id: "s", name: "Self-hosted", sub: "INRENT vLLM endpoint", mono: "S", c: 0.96, l: 0.55, q: 0.66, brand: "vllm" },
];

const METRIC_INDEX: Partial<Record<PolicyId, number>> = { cost: 0, latency: 1, quality: 2 };

/** A theme token at `pct`% opacity, for inline styles (SVG/inline colours cannot use Tailwind modifiers). */
const mix = (token: string, pct: number) => `color-mix(in oklab, var(--color-${token}) ${pct}%, transparent)`;
/** Soft red for failure text: a pale red on dark, a deeper AA red on light. */
const DANGER_TEXT = "text-[color-mix(in_oklab,var(--color-danger)_80%,var(--color-ink))]";

function Bar({ label, value, hi }: { label: string; value: number; hi: boolean }) {
  return (
    <div>
      <div className={cn("text-[11px]", hi ? "text-accent" : "text-fg-subtle")}>{label}</div>
      <div className="mt-[5px] h-[5px] overflow-hidden rounded-full bg-ink/[.06]">
        <div className="h-full rounded-full transition-[width,background] duration-700 ease-[cubic-bezier(.22,1,.36,1)]" style={{ width: `${Math.round(value * 100)}%`, background: hi ? "var(--color-accent)" : mix("ink", 22) }} />
      </div>
    </div>
  );
}

export function RoutingDemo() {
  const [policyId, setPolicyId] = useState<PolicyId>("balanced");
  const pol = POLICIES.find((p) => p.id === policyId)!;
  const isFallback = policyId === "fallback";
  const metric = METRIC_INDEX[policyId] ?? -1;

  const total = pol.w[0] + pol.w[1] + pol.w[2];
  const scored = CANDS.map((c) => ({ c, sc: isFallback && c.id === "b" ? 0 : (c.c * pol.w[0] + c.l * pol.w[1] + c.q * pol.w[2]) / total }));
  const best = scored.reduce((a, b) => (b.sc > a.sc ? b : a));

  return (
    <div className="relative mx-auto max-w-[1040px] overflow-hidden rounded-[22px] border border-ink/[.08] bg-card-gradient shadow-[var(--shadow-lift)]">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(600px_260px_at_70%_0%,color-mix(in_oklab,var(--color-accent)_8%,transparent),transparent)]" aria-hidden />
      <div role="group" aria-label="Routing policy" className="relative flex flex-wrap gap-1.5 border-b border-ink/[.07] p-3.5">
        {POLICIES.map((p) => {
          const active = p.id === policyId;
          return (
            <button
              key={p.id}
              type="button"
              aria-pressed={active}
              onClick={() => setPolicyId(p.id)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-[10px] border px-3.5 text-[14px] font-medium transition-colors",
                active ? "border-accent/[.45] bg-accent/[.12] text-fg" : "border-ink/[.07] text-fg-muted hover:border-ink/[.14] hover:text-fg",
              )}
            >
              <span className={cn("size-[7px] rounded-full", active ? (p.id === "fallback" ? "bg-[color-mix(in_oklab,var(--color-danger)_80%,var(--color-ink))]" : "bg-accent") : "bg-ink/20")} />
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="relative flex flex-wrap">
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-[18px] border-ink/[.06] p-5 sm:p-[26px] md:border-r">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[.14em] text-fg-subtle">Request</div>
            <pre data-theme="dark" className="mt-2.5 overflow-x-auto rounded-xl border border-ink/[.07] bg-bg px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-fg-muted">
              {"{\n  "}
              <span className="text-iris">&quot;model&quot;</span>: <span className="text-[#f5d08a]">&quot;inrent/auto&quot;</span>
              {",\n  "}
              <span className="text-iris">&quot;inrent&quot;</span>: {"{ "}
              <span className="text-iris">&quot;route&quot;</span>: <span className="text-[#f5d08a]">&quot;{pol.route}&quot;</span>
              {" }\n}"}
            </pre>
          </div>
          <div key={policyId} className="pop" aria-live="polite">
            <div className="font-display text-[20px] font-semibold tracking-[-0.02em] text-fg">{pol.title}</div>
            <p className="mt-1.5 text-[14.5px] leading-[1.55] text-fg-muted">{pol.body}</p>
          </div>
          <div data-theme="dark" className="mt-auto rounded-xl border border-ink/[.07] bg-bg px-4 py-3.5 font-mono text-[12.5px] leading-[1.8]">
            <div className="text-fg-subtle">{"// decision, logged with the request"}</div>
            <div>
              <span className="text-fg-subtle">provider</span> <span className="text-accent">{best.c.name.toLowerCase().replace(" ", "-")}</span>
            </div>
            <div>
              <span className="text-fg-subtle">attempts</span> <span className="text-fg">{isFallback ? 2 : 1}</span>
            </div>
            <div>
              <span className="text-fg-subtle">reason&nbsp;&nbsp;</span> <span className="text-fg-muted">{isFallback ? "provider-b unhealthy (503) → next eligible" : "highest weighted score"}</span>
            </div>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1.4_1_420px] flex-col gap-3 p-5 sm:p-[26px]">
          <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[.14em] text-fg-subtle">
            <span>Eligible providers</span>
            <span>Illustrative scores</span>
          </div>
          {scored.map(({ c, sc }) => {
            const chosen = c.id === best.c.id;
            const failed = isFallback && c.id === "b";
            return (
              <div
                key={c.id}
                className="relative rounded-[14px] border px-4 py-3.5 transition-[background,border-color,box-shadow] duration-500"
                style={{
                  borderColor: chosen ? mix("accent", 45) : failed ? mix("danger", 35) : mix("ink", 7),
                  background: chosen ? `linear-gradient(90deg, ${mix("accent", 10)}, ${mix("accent", 2)})` : failed ? mix("danger", 4) : mix("ink", 1.5),
                  boxShadow: chosen ? `0 18px 40px -22px ${mix("accent", 60)}` : "none",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "inline-flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border font-mono text-[13px] font-semibold",
                      chosen ? "border-accent/40 text-accent" : "border-ink/[.08] text-fg-muted",
                      c.brand ? "bg-bg" : chosen ? "bg-accent/[.14]" : "bg-ink/[.04]",
                    )}
                  >
                    {c.brand ? <BrandLogo brand={c.brand} size={20} /> : c.mono}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-semibold text-fg">{c.name}</div>
                    <div className="text-[12px] text-fg-subtle">{c.sub}</div>
                  </div>
                  <span className={cn("shrink-0 rounded-[7px] px-[9px] py-1 font-mono text-[12px]", chosen ? "bg-accent/[.14] text-accent" : failed ? `bg-danger-soft ${DANGER_TEXT}` : "bg-ink/[.05] text-fg-subtle")}>
                    {chosen ? "→ routed" : failed ? "✕ 503 · skipped" : "standby"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2.5">
                  <Bar label="cost" value={c.c} hi={metric === 0} />
                  <Bar label="latency" value={c.l} hi={metric === 1} />
                  <Bar label="quality" value={c.q} hi={metric === 2} />
                </div>
                <div className="mt-3 flex items-center gap-2.5">
                  <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-ink/[.05]">
                    <div
                      className="absolute inset-y-0 left-0 rounded-full transition-[width,background] duration-700 ease-[cubic-bezier(.22,1,.36,1)]"
                      style={{ width: `${Math.round(sc * 100)}%`, background: chosen ? "linear-gradient(90deg, var(--color-accent-strong), var(--color-iris))" : failed ? "var(--color-danger)" : mix("ink", 18) }}
                    />
                  </div>
                  <span className={cn("w-[34px] shrink-0 text-right font-mono text-[12px]", chosen ? "text-accent" : "text-fg-subtle")}>{failed ? "—" : sc.toFixed(2)}</span>
                </div>
                {chosen ? (
                  <div key={policyId} className="absolute inset-x-4 -bottom-px h-0.5 overflow-hidden" aria-hidden>
                    <span className="lane absolute top-0 -ml-[60px] h-0.5 w-[60px] bg-[linear-gradient(90deg,transparent,var(--color-accent))]" />
                  </div>
                ) : null}
              </div>
            );
          })}
          {isFallback ? (
            <div className="pop flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-danger/[.35] bg-danger/[.05] px-3.5 py-3 font-mono text-[12.5px] text-fg-muted">
              <span className={DANGER_TEXT}>attempt 1 → Provider B · 503</span>
              <span className="text-fg-subtle" aria-hidden>
                →
              </span>
              <span className="text-accent">attempt 2 → {best.c.name} · 200</span>
              <span className="text-fg-subtle">· retried before the first byte</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
