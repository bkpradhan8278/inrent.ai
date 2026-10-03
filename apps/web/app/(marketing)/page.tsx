import { Activity, ArrowRight, Bot, KeyRound, Network, Plug, Route, ShieldCheck, Users, Wallet, Webhook } from "lucide-react";
import Link from "next/link";
import { CodeTabs } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Eyebrow, SectionHeading } from "@/components/ui/misc";
import { GpuGrid } from "@/components/marketing/gpu-grid";
import { ModelCard } from "@/components/marketing/model-card";
import { ObservabilityPreview } from "@/components/marketing/observability-preview";
import { RoadmapTimeline } from "@/components/marketing/roadmap";
import { RoutingDemo } from "@/components/marketing/routing-demo";
import { RoutingVisual } from "@/components/marketing/routing-visual";
import { Terminal } from "@/components/marketing/terminal";
import { Reveal } from "@/components/motion";
import { safePublicModels } from "@/lib/catalog";
import { site } from "@/lib/site";
import { chatSnippets } from "@/lib/snippets";

export const revalidate = 300;

const FEATURES = [
  { icon: Route, title: "Routing & fallback", body: "Route by cost, latency or quality. When a provider fails, retry on the next eligible one — before the first byte." },
  { icon: Wallet, title: "Unified billing", body: "Prepaid credits across every provider. Exact, server-side usage accounting with per-request cost." },
  { icon: KeyRound, title: "Keys with guardrails", body: "Per-key model allowlists, spend limits, rate limits, expiry and environments. Only hashes are stored." },
  { icon: Activity, title: "Observability", body: "Request logs, latency, TTFT, tokens, errors and routing decisions — with privacy-first payload retention." },
  { icon: Plug, title: "Bring your own key", body: "Use your own provider accounts through the same API. Keys are encrypted and never shown again." },
  { icon: Webhook, title: "Webhooks", body: "Signed events for requests, credits, payments and provider health, with automatic retries." },
  { icon: Users, title: "Teams & projects", body: "Organizations, roles, project budgets and shared billing — built for more than one developer." },
  { icon: ShieldCheck, title: "Secure by default", body: "Encrypted secrets, audit logs, RBAC, SSRF-safe outbound calls and strict input limits." },
];

export default async function HomePage() {
  const models = await safePublicModels();
  const featured = [...models.filter((m) => m.featured && !m.isDevOnly), ...models.filter((m) => !m.featured && !m.isDevOnly)].slice(0, 8);
  const providerCount = new Set(models.flatMap((m) => m.providers.map((p) => p.slug))).size;

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-0 -top-16" aria-hidden />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[520px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgb(92_235_192/0.13),transparent)]" aria-hidden />
        <div className="container-page relative grid items-center gap-12 pb-20 pt-14 lg:grid-cols-[1.05fr_1fr] lg:pb-28 lg:pt-20">
          <div className="flex min-w-0 flex-col gap-7">
            <Reveal>
              <Link href="/changelog" className="group inline-flex w-fit items-center gap-2 rounded-full border border-border bg-surface/60 py-1 pl-1 pr-3 text-[12.5px] text-fg-muted backdrop-blur transition-colors hover:border-border-strong">
                <span className="rounded-full bg-accent-soft px-2 py-0.5 font-mono text-[10.5px] text-accent">New</span>
                OpenAI-compatible API · streaming, routing, BYOK
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </Reveal>
            <Reveal delay={0.05}>
              <h1 className="text-display text-[2.9rem] text-fg sm:text-6xl lg:text-[4.4rem]">
                One API.
                <br />
                <span className="text-gradient">Every AI model.</span>
              </h1>
            </Reveal>
            <Reveal delay={0.1}>
              <p className="max-w-xl text-[16.5px] leading-relaxed text-fg-muted">
                Connect your application to leading AI models through one developer-first API — with unified billing, routing, observability and infrastructure.
              </p>
            </Reveal>
            <Reveal delay={0.15}>
              <div className="flex flex-wrap items-center gap-3">
                <Button asChild size="lg">
                  <Link href="/sign-up">
                    Start building <ArrowRight />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="secondary">
                  <Link href="/models">Explore models</Link>
                </Button>
                <Link href="/docs" className="inline-flex items-center gap-1.5 px-2 text-sm text-fg-muted transition-colors hover:text-fg">
                  View documentation <ArrowRight className="size-3.5" />
                </Link>
              </div>
            </Reveal>
            <Reveal delay={0.2}>
              <div className="flex w-fit max-w-full items-center gap-3 rounded-lg border border-border bg-bg-elevated/80 py-1.5 pl-3.5 pr-1.5 font-mono text-[12.5px] backdrop-blur">
                <span className="text-fg-subtle">base_url</span>
                <span className="truncate text-fg">{site.apiBaseUrl}</span>
                <CopyButton value={site.apiBaseUrl} label="Copy base URL" />
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.1} y={24}>
            <RoutingVisual />
          </Reveal>
        </div>
      </section>

      {/* ── Provider strip ───────────────────────────────────────────────── */}
      <section className="border-y border-border bg-bg-elevated/60">
        <div className="container-page flex flex-col items-center gap-5 py-8 md:flex-row md:justify-between">
          <p className="max-w-sm text-center text-[13px] text-fg-subtle md:text-left">
            Integrations are configured per provider: platform-funded where terms allow, your own key where they don&apos;t.
          </p>
          <ul className="flex flex-wrap justify-center gap-x-6 gap-y-3 font-display text-[14px] font-medium tracking-tight text-fg-subtle md:max-w-[62%] md:justify-end">
            {["OpenAI", "Anthropic", "Google Gemini", "DeepSeek", "Qwen", "Mistral", "Z.ai GLM", "Meta Llama", "vLLM"].map((n) => (
              <li key={n} className="transition-colors hover:text-fg-muted">
                {n}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Models ───────────────────────────────────────────────────────── */}
      <section className="container-page py-24">
        <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionHeading
            eyebrow="Model catalog"
            title={
              <>
                One API. <span className="text-gradient">Infinite models.</span>
              </>
            }
            description="Frontier, open-weight and self-hosted models behind a single schema. Every model page shows capabilities, context, providers and price — published only after verification."
          />
          <Button asChild variant="secondary">
            <Link href="/models">
              Browse all {models.filter((m) => !m.isDevOnly).length || ""} models <ArrowRight />
            </Link>
          </Button>
        </div>
        {featured.length ? (
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((m, i) => (
              <Reveal key={m.slug} delay={Math.min(i * 0.05, 0.3)}>
                <ModelCard model={m} />
              </Reveal>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-xl border border-dashed border-border p-10 text-center text-sm text-fg-subtle">The model catalog is loading. Check back shortly or browse the docs.</div>
        )}
        <p className="mt-6 text-xs text-fg-subtle">
          {providerCount ? `${providerCount} provider integrations configured. ` : ""}
          Availability reflects each provider&apos;s current configuration; models without a published price can still be used with your own provider key where supported.
        </p>
      </section>

      {/* ── Developer experience ─────────────────────────────────────────── */}
      <section className="relative border-y border-border bg-bg-elevated/40">
        <div className="container-page grid gap-12 py-24 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
          <div className="flex flex-col gap-6">
            <SectionHeading
              eyebrow="Developer experience"
              title="Swap the base URL. Keep your code."
              description="INRENT speaks the OpenAI API. Point any OpenAI SDK at INRENT, use your INRENT key, and pick from every model in the catalog — or use our SDKs and CLI."
            />
            <ul className="flex flex-col gap-3 text-sm text-fg-muted">
              {[
                "Chat, streaming (SSE), tools, structured output, embeddings and images",
                "Request IDs, provider and cost on every response",
                "Official TypeScript and Python SDKs, plus a polished CLI",
              ].map((t) => (
                <li key={t} className="flex items-start gap-3">
                  <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                  {t}
                </li>
              ))}
            </ul>
            <div className="flex gap-3">
              <Button asChild>
                <Link href="/docs/quickstart">Quickstart — 5 minutes</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/docs/api-reference">API reference</Link>
              </Button>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-4">
            <CodeTabs tabs={chatSnippets("inrent/auto").slice(0, 4)} title="chat.completions" />
            <Terminal />
          </div>
        </div>
      </section>

      {/* ── Routing ──────────────────────────────────────────────────────── */}
      <section className="container-page py-24">
        <SectionHeading
          eyebrow="Routing"
          align="center"
          title={
            <>
              Build once. <span className="text-gradient">Route anywhere.</span>
            </>
          }
          description="Choose a policy per organization or per request. INRENT ranks eligible providers, skips unhealthy ones and falls back automatically — every decision is logged with the request."
        />
        <Reveal className="mx-auto mt-12 max-w-4xl">
          <RoutingDemo />
        </Reveal>
      </section>

      {/* ── Platform ─────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-bg-elevated/40">
        <div className="container-page py-24">
          <SectionHeading eyebrow="Platform" title="Everything between your app and the model." description="The production plumbing you would otherwise build yourself — designed as one coherent platform." />
          <div className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={Math.min(i * 0.04, 0.24)} className="h-full">
                <div className="group h-full bg-surface p-6 transition-colors hover:bg-surface-2">
                  <div className="flex size-9 items-center justify-center rounded-lg border border-border-strong bg-bg-elevated text-accent transition-transform duration-300 group-hover:-translate-y-0.5">
                    <f.icon className="size-4" />
                  </div>
                  <h3 className="mt-4 text-[15px] font-semibold text-fg">{f.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{f.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Observability ────────────────────────────────────────────────── */}
      <section className="container-page grid gap-12 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
        <SectionHeading
          eyebrow="Observability"
          title="See every request. Understand every dollar."
          description="Usage by model, provider, project and key. Latency and time-to-first-token. Errors with what happened, why and how to fix it. Export anything as CSV or JSON."
        />
        <Reveal>
          <ObservabilityPreview />
        </Reveal>
      </section>

      {/* ── Provider-safe ────────────────────────────────────────────────── */}
      <section className="border-y border-border bg-bg-elevated/40">
        <div className="container-page grid gap-10 py-20 md:grid-cols-3">
          <div className="md:col-span-1">
            <Eyebrow>Built the right way</Eyebrow>
            <h2 className="text-display mt-4 text-3xl text-fg">Provider-safe by design.</h2>
            <p className="mt-4 text-sm leading-relaxed text-fg-muted">INRENT never assumes it may resell a provider&apos;s API. Each provider is configured with an explicit integration mode, and models are verified before platform-funded serving.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">
            {[
              { t: "Authorized & direct resale", d: "Platform-funded only where provider terms or a signed agreement permit it." },
              { t: "Bring your own key", d: "Your provider account, your terms — routed, logged and billed through INRENT." },
              { t: "Self-hosted open weights", d: "Served on INRENT-operated infrastructure after license verification." },
              { t: "Enterprise agreements", d: "Dedicated provider arrangements scoped to the organizations they cover." },
            ].map((x) => (
              <div key={x.t} className="rounded-xl border border-border bg-surface p-5">
                <div className="flex items-center gap-2 text-[14px] font-medium text-fg">
                  <Network className="size-4 text-accent" />
                  {x.t}
                </div>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── GPU Cloud teaser ─────────────────────────────────────────────── */}
      <section className="container-page py-24">
        <div className="panel relative grid gap-10 overflow-hidden rounded-3xl p-8 sm:p-12 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,rgb(245_180_85/0.16),transparent)]" aria-hidden />
          <div className="relative flex flex-col gap-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-[rgb(245_180_85/0.35)] bg-amber-soft px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber">GPU Cloud · coming soon</div>
            <h2 className="text-display text-4xl text-fg sm:text-5xl">
              <span className="text-gradient-amber">Compute is coming.</span>
            </h2>
            <p className="max-w-lg text-[15px] leading-relaxed text-fg-muted">Rent GPUs, deploy models and scale AI workloads from the same platform — with the same keys, billing and observability. Not live yet; join the waitlist to be first.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/gpu#waitlist">Join GPU Cloud waitlist</Link>
              </Button>
              <Button asChild variant="ghost">
                <Link href="/roadmap">See the roadmap</Link>
              </Button>
            </div>
          </div>
          <GpuGrid className="relative" />
        </div>
      </section>

      {/* ── Roadmap ──────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-bg-elevated/40">
        <div className="container-page py-24">
          <SectionHeading eyebrow="Roadmap" title="AI APIs today. AI compute next." description="We are building INRENT in phases, shipping each layer properly before the next. Here is where we are." />
          <div className="mt-12">
            <RoadmapTimeline compact />
          </div>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-border">
        <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
        <div className="container-page relative flex flex-col items-center gap-6 py-24 text-center">
          <Bot className="size-8 text-accent" aria-hidden />
          <h2 className="text-display max-w-2xl text-4xl text-fg sm:text-5xl">AI infrastructure, without the infrastructure.</h2>
          <p className="max-w-lg text-fg-muted">Create an account, generate a key and make your first request in under five minutes.</p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start building <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="secondary">
              <Link href="/pricing">See pricing</Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
