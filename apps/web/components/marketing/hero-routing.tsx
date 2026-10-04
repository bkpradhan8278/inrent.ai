"use client";

import { useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand/icons";
import { LogoMark } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

/**
 * Hero request-flow animation: app → INRENT gateway checks → routed provider, with one cycle
 * showing health-aware fallback. Illustrative only — it shows how routing works, not live traffic
 * or which providers are enabled. Scales as one unit via a container-query font size.
 */

const PROVIDERS = [
  { id: "openai", name: "OpenAI", y: 36 },
  { id: "anthropic", name: "Anthropic", y: 97 },
  { id: "google", name: "Google Gemini", y: 158 },
  { id: "deepseek", name: "DeepSeek", y: 219 },
  { id: "qwen", name: "Qwen", y: 280 },
  { id: "mistral", name: "Mistral", y: 341 },
  { id: "zai", name: "Z.ai GLM", y: 402 },
  { id: "xai", name: "xAI Grok", y: 463 },
  { id: "vllm", name: "Self-hosted vLLM", y: 524 },
] as const;

type ProviderId = (typeof PROVIDERS)[number]["id"];

const FLOW: Array<{ model: string; provider: ProviderId; policy: string; failed?: ProviderId }> = [
  { model: "anthropic/claude-sonnet-4", provider: "anthropic", policy: "direct" },
  { model: "openai/gpt-4.1", provider: "openai", policy: "direct" },
  { model: "inrent/auto", provider: "deepseek", policy: "balanced" },
  { model: "google/gemini-2.5-flash", provider: "google", policy: "direct" },
  { model: "qwen/qwen3-32b", provider: "qwen", policy: "fallback", failed: "vllm" },
  { model: "zai/glm-4.5", provider: "zai", policy: "direct" },
  { model: "mistral/mistral-large", provider: "mistral", policy: "direct" },
  { model: "xai/grok-3", provider: "xai", policy: "direct" },
];

const PACKET_DELAY: Record<ProviderId, string> = {
  openai: ".2s",
  anthropic: "1.1s",
  google: "2.3s",
  deepseek: ".7s",
  qwen: "3.1s",
  mistral: "1.8s",
  zai: "4s",
  xai: "2.7s",
  vllm: ".4s",
};

const CHECKS = [
  ["Auth", "key ✓"],
  ["Rate limit", "ok ✓"],
  ["Credits", "reserved ✓"],
  ["Policy", "allowed ✓"],
] as const;

const curve = (y: number) => `M380 280 C420 280 420 ${y} 460 ${y}`;

export function HeroRouting({ className }: { className?: string }) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (!document.hidden) setStep((s) => (s + 1) % FLOW.length);
    }, 2800);
    return () => clearInterval(t);
  }, []);

  const f = FLOW[step]!;
  const providerName = PROVIDERS.find((p) => p.id === f.provider)!.name;

  return (
    <figure className={cn("w-full", className)} aria-label="Diagram: your app calls the INRENT gateway, which checks the request and routes it to an eligible model provider, falling back when one is unhealthy">
      <div className="w-full [container-type:inline-size]">
        <div className="relative aspect-[640/560] w-full text-[2.5cqw]">
          <svg viewBox="0 0 640 560" className="absolute inset-0 size-full overflow-visible" aria-hidden>
            <path d="M84 134 V222" stroke="rgb(255 255 255 / .14)" strokeWidth="1.4" strokeDasharray="3 5" fill="none" />
            <path d="M168 280 H204" stroke="rgb(92 235 192 / .55)" strokeWidth="1.6" fill="none" />
            <path className="pk-on" d="M168 280 H204" stroke="#bafbe8" strokeWidth="2.4" strokeLinecap="round" fill="none" />
            {PROVIDERS.map((p) => {
              const act = p.id === f.provider;
              const fail = p.id === f.failed;
              return (
                <path
                  key={`b-${p.id}`}
                  d={curve(p.y)}
                  stroke={act ? "rgb(92 235 192 / .6)" : fail ? "rgb(255 107 107 / .55)" : "rgb(255 255 255 / .09)"}
                  strokeWidth="1.4"
                  strokeDasharray={fail ? "4 5" : "none"}
                  fill="none"
                  style={{ transition: "stroke .5s" }}
                />
              );
            })}
            {PROVIDERS.map((p) => {
              const act = p.id === f.provider;
              const fail = p.id === f.failed;
              return (
                <path
                  key={`p-${p.id}`}
                  className={act ? "pk-on" : fail ? "pk-off" : "pk-idle"}
                  d={curve(p.y)}
                  stroke={act ? "#bafbe8" : "rgb(255 255 255 / .28)"}
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  fill="none"
                  style={{ animationDelay: act ? "0s" : PACKET_DELAY[p.id] }}
                />
              );
            })}
          </svg>

          {/* request */}
          <div key={`req-${step}`} className="pop absolute left-0 top-[12.5%] w-[58.1%] rounded-[.7em] border border-white/[.09] bg-[rgb(14_17_23/.92)] px-[.8em] py-[.55em] font-mono text-[.58em] leading-[1.6] shadow-[0_20px_40px_-24px_rgba(0,0,0,.9)]">
            <div className="text-fg-subtle">
              <span className="text-accent">POST</span> /v1/chat/completions
            </div>
            <div className="truncate whitespace-nowrap text-fg-muted">
              {"{ "}
              <span className="text-iris">&quot;model&quot;</span>: <span className="text-[#f5d08a]">&quot;{f.model}&quot;</span>, <span className="text-iris">&quot;stream&quot;</span>: true {"}"}
            </div>
          </div>

          {/* app */}
          <div className="absolute left-0 top-[39.64%] flex h-[20.71%] w-[26.25%] flex-col justify-center gap-[.35em] rounded-[.8em] border border-white/10 bg-[linear-gradient(180deg,#131720,#0c0f15)] p-[.7em] shadow-[0_24px_50px_-26px_rgba(0,0,0,.9)]">
            <div className="flex items-center gap-[.45em]">
              <span className="inline-flex size-[1.7em] items-center justify-center rounded-[.45em] border border-white/[.12] bg-bg-elevated font-mono text-[.62em] whitespace-nowrap text-fg-muted">{"{ }"}</span>
              <span className="text-[.72em] font-semibold text-fg">Your app</span>
            </div>
            <div className="text-[.52em] leading-[1.4] text-fg-subtle">Any OpenAI SDK · one key</div>
          </div>

          {/* gateway */}
          <div className="absolute left-[31.875%] top-[26.79%] flex h-[46.43%] w-[27.5%] flex-col gap-[.5em] rounded-[1em] border border-[rgb(92_235_192/.32)] bg-[linear-gradient(180deg,rgba(20,30,30,.96),rgba(10,13,17,.98))] p-[.8em] shadow-[0_0_0_4px_rgba(92,235,192,.05),0_30px_70px_-30px_rgba(92,235,192,.45)]">
            <div className="flex items-center gap-[.5em]">
              <span className="relative inline-flex size-[1.7em] shrink-0">
                <span className="ping-ring absolute inset-0 rounded-[.5em] border border-[rgb(92_235_192/.7)]" aria-hidden />
                <LogoMark className="size-full" title="" />
              </span>
              <div className="min-w-0">
                <div className="truncate text-[.7em] font-semibold text-fg">INRENT Gateway</div>
                <div className="truncate font-mono text-[.5em] text-accent">api.inrent.ai/v1</div>
              </div>
            </div>
            <div className="flex flex-1 flex-col justify-center gap-[.18em] text-[.56em]">
              {CHECKS.map(([k, v], i) => (
                <div key={k} className="scan flex items-center justify-between rounded-[.4em] px-[.5em] py-[.35em]" style={{ animationDelay: `${i * 0.25}s` }}>
                  <span className="text-fg-muted">{k}</span>
                  <span className="font-mono text-accent">{v}</span>
                </div>
              ))}
              <div className="scan flex items-center justify-between rounded-[.4em] px-[.5em] py-[.35em]" style={{ animationDelay: "1s" }}>
                <span className="text-fg-muted">Route</span>
                <span className="font-mono text-fg">{f.policy}</span>
              </div>
            </div>
            <div className="flex items-center gap-[.4em] border-t border-white/[.07] pt-[.45em] font-mono text-[.48em] text-fg-subtle">
              <span className="breathe size-[.6em] rounded-full bg-success" />
              logged · request id + cost
            </div>
          </div>

          {/* response */}
          <div key={`res-${step}`} className="pop absolute left-0 top-[78.6%] w-[59.4%] rounded-[.7em] border border-white/[.09] bg-[rgb(14_17_23/.92)] px-[.8em] py-[.6em] font-mono text-[.54em] leading-[1.65]" style={{ animationDelay: ".35s" }}>
            {f.failed ? (
              <div className="text-[#ff8a8a]">
                <span className="rounded-[.35em] bg-danger-soft px-[.45em] py-[.05em]">503</span> self-hosted vLLM unhealthy → skipped
              </div>
            ) : null}
            <div className="text-fg-muted">
              <span className="rounded-[.35em] bg-[rgb(92_235_192/.14)] px-[.45em] py-[.05em] text-accent">200</span> streamed from <span className="text-fg">{providerName}</span>
            </div>
            <div className="text-fg-subtle">
              x-inrent-provider: <span className="text-[#f5d08a]">{f.provider}</span>
            </div>
          </div>

          {/* providers */}
          <ul className="absolute left-[71.875%] top-[2.32%] flex h-[95.36%] w-[28.125%] flex-col justify-between">
            {PROVIDERS.map((p) => {
              const act = p.id === f.provider;
              const fail = p.id === f.failed;
              return (
                <li
                  key={p.id}
                  className="flex h-[8.61%] items-center gap-[.45em] rounded-[.65em] border px-[.5em] transition-[background,border-color,box-shadow] duration-500"
                  style={{
                    borderColor: act ? "rgb(92 235 192 / .5)" : fail ? "rgb(255 107 107 / .4)" : "rgb(255 255 255 / .08)",
                    background: act ? "linear-gradient(90deg, rgb(92 235 192 / .14), rgb(92 235 192 / .04))" : fail ? "rgb(255 107 107 / .06)" : "rgb(14 17 23 / .9)",
                    boxShadow: act ? "0 0 0 3px rgb(92 235 192 / .07), 0 14px 30px -14px rgb(92 235 192 / .6)" : "none",
                  }}
                >
                  <span className="inline-flex size-[1.75em] shrink-0 items-center justify-center rounded-[.45em] border border-white/[.08] bg-bg-elevated">
                    <BrandLogo brand={p.id} size={16} className="size-[1.15em]!" />
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[.6em] font-medium", act ? "text-white" : fail ? "text-[#ffb3b3]" : "text-[#c3c8d2]")}>{p.name}</span>
                  {act ? <span className="shrink-0 rounded-[.35em] bg-[rgb(92_235_192/.16)] px-[.45em] py-[.2em] font-mono text-[.46em] text-accent">routed</span> : null}
                  {fail ? <span className="shrink-0 rounded-[.35em] bg-danger-soft px-[.45em] py-[.2em] font-mono text-[.46em] text-[#ff8a8a]">503</span> : null}
                  {!act && !fail ? <span className="size-[.4em] shrink-0 rounded-full bg-success opacity-55" /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <figcaption className="mt-3.5 text-right font-mono text-[11px] text-fg-subtle">Illustrative request flow · availability depends on each provider&apos;s configuration</figcaption>
    </figure>
  );
}
