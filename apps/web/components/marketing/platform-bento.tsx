import { Activity, KeyRound, Plug, Route, ShieldCheck, Users, Wallet, Webhook, type LucideIcon } from "lucide-react";
import { BrandLogo } from "@/components/brand/icons";
import { cn } from "@/lib/utils";

/** Platform features as a bento grid. Visual chips are illustrative UI, not live data. */

function Tile({ icon: Icon, tint, title, body, wide, className, children }: { icon: LucideIcon; tint: string; title: string; body: string; wide?: boolean; className?: string; children?: React.ReactNode }) {
  return (
    <article
      className={cn(
        "lift relative flex min-h-[260px] flex-col gap-3.5 overflow-hidden rounded-[20px] border border-ink/[.08] bg-card-gradient p-6 sm:p-[26px] light:shadow-[var(--shadow-panel)]",
        wide && "sm:col-span-2",
        className,
      )}
    >
      <div className={cn("glow pointer-events-none absolute rounded-full opacity-20", wide ? "-right-16 -top-24 size-[300px]" : "-right-20 -top-20 size-[220px]")} style={{ background: `radial-gradient(closest-side, rgb(${tint} / .5), transparent)` }} aria-hidden />
      {/* --tint is the brand colour; in light the icon is deepened toward ink so it keeps contrast on the pale tile. */}
      <span
        className="ico relative inline-flex size-[46px] items-center justify-center rounded-[13px] border text-[rgb(var(--tint))] light:text-[color-mix(in_oklab,rgb(var(--tint))_58%,var(--color-ink))]"
        style={{ "--tint": tint, borderColor: `rgb(${tint} / .4)`, background: `radial-gradient(circle at 30% 20%, rgb(${tint} / .3), var(--color-tile) 70%)`, boxShadow: `inset 0 1px 0 rgb(255 255 255 / .1), 0 12px 28px -10px rgb(${tint} / .5)` } as React.CSSProperties}
      >
        <Icon className="size-[22px]" strokeWidth={1.8} />
      </span>
      <h3 className={cn("relative mt-1 font-semibold tracking-[-0.02em] text-fg", wide ? "text-[21px]" : "text-[19px]")}>{title}</h3>
      <p className={cn("relative max-w-[460px] leading-relaxed text-fg-muted", wide ? "text-[14.5px]" : "text-[14px]")}>{body}</p>
      {children ? <div className="relative mt-auto">{children}</div> : null}
    </article>
  );
}

const chip = "rounded-[7px] border border-ink/[.08] px-2 py-[5px] text-fg-muted";

export function PlatformBento() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile wide icon={Route} tint="92 235 192" title="Routing & fallback" body="Route by cost, latency or quality. When a provider fails, retry on the next eligible one — before the first byte.">
        <div className="flex flex-wrap items-center gap-2 font-mono text-[12px]">
          <span className="inline-flex items-center gap-2 rounded-[10px] border border-danger/30 bg-danger/[.06] px-2.5 py-2 text-[#ff9a9a] light:text-danger">
            <BrandLogo brand="vllm" size={16} />
            vLLM · 503
          </span>
          <svg viewBox="0 0 40 12" width="40" height="12" aria-hidden>
            <path className="pk-on stroke-accent" d="M0 6 H40" strokeWidth="2" strokeLinecap="round" fill="none" />
          </svg>
          <span className="inline-flex items-center gap-2 rounded-[10px] border border-accent/[.35] bg-accent/[.08] px-2.5 py-2 text-accent">
            <BrandLogo brand="qwen" size={16} />
            Qwen · 200
          </span>
          <span className="text-fg-subtle">fallbacks=1</span>
        </div>
      </Tile>
      <Tile icon={Wallet} tint="247 185 85" title="Unified billing" body="Prepaid credits across every provider. Exact, server-side usage accounting with per-request cost.">
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          <span className="flex-[34] bg-[#d97757]" />
          <span className="flex-[24] bg-fg" />
          <span className="flex-[18] bg-[#4796e3]" />
          <span className="flex-[14] bg-[#4d6bfe]" />
          <span className="flex-[10] bg-ink/[.12]" />
        </div>
      </Tile>
      <Tile icon={KeyRound} tint="169 151 255" title="Keys with guardrails" body="Per-key model allowlists, spend limits, rate limits, expiry and environments. Only hashes are stored.">
        <div className="flex flex-wrap gap-1.5 font-mono text-[11.5px]">
          <span className="rounded-[7px] bg-[rgb(169_151_255/.1)] px-2 py-[5px] text-[#c9bfff] light:text-iris">inr_live_••••</span>
          <span className={chip}>allowlist</span>
          <span className={chip}>spend cap</span>
          <span className={chip}>expires</span>
        </div>
      </Tile>
      <Tile icon={Plug} tint="240 140 204" title="Bring your own key" body="Use your own provider accounts through the same API. Keys are encrypted and never shown again.">
        <div className="flex items-center">
          {["openai", "anthropic", "google"].map((b, i) => (
            <span key={b} className={cn("inline-flex size-[34px] items-center justify-center rounded-[10px] border border-ink/10 bg-bg", i && "-ml-1.5")}>
              <BrandLogo brand={b} size={18} />
            </span>
          ))}
          <span className="ml-2.5 font-mono text-[11.5px] text-fg-subtle">sk-•••• encrypted</span>
        </div>
      </Tile>
      <Tile wide icon={Activity} tint="98 183 255" title="Observability" body="Request logs, latency, TTFT, tokens, errors and routing decisions — with privacy-first payload retention.">
        <svg viewBox="0 0 300 90" className="h-[90px] w-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="bento-obs" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" className="[stop-color:#62b7ff] light:[stop-color:var(--color-info)]" stopOpacity=".35" />
              <stop offset="1" className="[stop-color:#62b7ff] light:[stop-color:var(--color-info)]" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0 22H300M0 45H300M0 68H300" className="stroke-ink/[.05]" fill="none" />
          <path d="M0 72 C30 68 45 60 70 62 S110 46 135 48 S180 32 205 38 S250 20 300 16 V90 H0 Z" fill="url(#bento-obs)" />
          <path d="M0 72 C30 68 45 60 70 62 S110 46 135 48 S180 32 205 38 S250 20 300 16" className="stroke-[#62b7ff] light:stroke-info" strokeWidth="2" fill="none" vectorEffect="non-scaling-stroke" />
          <path d="M0 82 C40 79 60 76 90 77 S140 68 170 70 S230 60 300 58" className="stroke-accent" strokeWidth="1.6" fill="none" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        </svg>
      </Tile>
      <Tile icon={Webhook} tint="255 143 112" title="Webhooks" body="Signed events for requests, credits, payments and provider health, with automatic retries.">
        <div className="flex flex-col gap-1.5 font-mono text-[11.5px] text-fg-muted">
          <span className="flex justify-between">
            <span>request.completed</span>
            <span className="text-success">200</span>
          </span>
          <span className="flex justify-between">
            <span>credits.low</span>
            <span className="text-amber">retry 2</span>
          </span>
        </div>
      </Tile>
      <Tile wide icon={Users} tint="112 201 160" title="Teams & projects" body="Organizations, roles, project budgets and shared billing — built for more than one developer.">
        <div className="flex flex-wrap gap-1.5 text-[12px]">
          <span className="rounded-[7px] bg-[rgb(112_201_160/.12)] px-2 py-1 text-[#8fe0ba] light:text-success">Owner</span>
          {["Admin", "Developer", "Viewer"].map((r) => (
            <span key={r} className={chip}>
              {r}
            </span>
          ))}
        </div>
      </Tile>
      <Tile wide icon={ShieldCheck} tint="128 168 255" title="Secure by default" body="Encrypted secrets, audit logs, RBAC, SSRF-safe outbound calls and strict input limits.">
        <ul className="grid max-w-md grid-cols-2 gap-2 text-[13px] text-fg-muted">
          {["Encrypted secrets", "Audit logs", "RBAC", "SSRF-safe egress"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" className="stroke-[#93b4ff] light:stroke-info" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M5 12.5l4.2 4.2L19 7" />
              </svg>
              {t}
            </li>
          ))}
        </ul>
      </Tile>
    </div>
  );
}
