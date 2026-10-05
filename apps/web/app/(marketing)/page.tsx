import { ArrowRight, Building2, Check, KeyRound, Server, ShieldCheck } from "lucide-react";
import Link from "@/components/ui/link";
import { CodeTabs } from "@/components/ui/code-block";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Eyebrow, SectionHeading } from "@/components/ui/misc";
import { GpuGrid } from "@/components/marketing/gpu-grid";
import { ModelCard } from "@/components/marketing/model-card";
import { ObservabilityPreview } from "@/components/marketing/observability-preview";
import { RoadmapTimeline } from "@/components/marketing/roadmap";
import { RoutingDemo } from "@/components/marketing/routing-demo";
import { HeroRouting } from "@/components/marketing/hero-routing";
import { LogoMarquee } from "@/components/marketing/logo-marquee";
import { McpHub, McpToolApprovals } from "@/components/marketing/mcp-showcase";
import { PlatformBento } from "@/components/marketing/platform-bento";
import { LogoMark } from "@/components/brand/logo";
import { Terminal } from "@/components/marketing/terminal";
import { Reveal } from "@/components/motion";
import { safePublicModels } from "@/lib/catalog";
import { site } from "@/lib/site";
import { chatSnippets } from "@/lib/snippets";

export const revalidate = 300;


export default async function HomePage() {
  const models = await safePublicModels();
  const featured = [...models.filter((m) => m.featured && !m.isDevOnly), ...models.filter((m) => !m.featured && !m.isDevOnly)].slice(0, 8);
  const providerCount = new Set(models.flatMap((m) => m.providers.map((p) => p.slug))).size;

  return (
    <>
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="bg-grid pointer-events-none absolute inset-x-0 -top-10 bottom-0" aria-hidden />
        <div className="pointer-events-none absolute -top-64 left-1/2 h-[640px] w-[1100px] -translate-x-1/2 bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-accent)_14%,transparent),transparent)] light:opacity-60" aria-hidden />
        <div className="pointer-events-none absolute -right-52 top-28 size-[640px] bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-iris)_10%,transparent),transparent)] light:opacity-60" aria-hidden />
        <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:pb-24 lg:pt-20">
          <div className="flex min-w-0 flex-col gap-7">
            <div className="rise">
              <Link href="/changelog" className="group inline-flex w-fit max-w-full items-center gap-2.5 rounded-full border border-ink/[.09] bg-surface/70 py-1 pl-1 pr-3.5 text-[13px] text-fg-muted backdrop-blur transition-colors hover:border-border-strong hover:text-fg">
                <span className="rounded-full bg-accent/[.12] px-2.5 py-[3px] font-mono text-[11px] text-accent">New</span>
                <span className="truncate">OpenAI-compatible API · streaming, routing, BYOK</span>
                <ArrowRight className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
            <h1 className="font-display text-[clamp(44px,5.4vw,78px)] font-semibold leading-[0.98] tracking-[-0.045em] text-fg">
              One API.
              <br />
              <span className="bg-[linear-gradient(100deg,var(--color-grad-a)_0%,var(--color-grad-b)_36%,var(--color-accent)_62%,var(--color-iris)_100%)] bg-clip-text text-transparent">Every AI model.</span>
            </h1>
            <p className="max-w-[540px] text-[17px] leading-relaxed text-fg-muted sm:text-[18px]">
              Connect your application to leading AI models through one developer-first API — with unified billing, routing, observability and infrastructure.
            </p>
            <div className="rise flex flex-wrap items-center gap-3" style={{ animationDelay: "150ms" }}>
              <Button asChild size="lg" className="h-[50px] rounded-xl px-[22px] text-[16px] font-semibold shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent),0_18px_44px_-16px_color-mix(in_oklab,var(--color-accent)_75%,transparent)] light:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_35%,transparent),0_14px_32px_-16px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]">
                <Link href="/sign-up">
                  Start building <ArrowRight />
                </Link>
              </Button>
              <Button asChild size="lg" variant="secondary" className="h-[50px] rounded-xl px-[22px] text-[16px]">
                <Link href="/models">Explore models</Link>
              </Button>
              <Link href="/docs" className="inline-flex items-center gap-1.5 px-2 text-[15px] text-fg-muted transition-colors hover:text-fg">
                View documentation <ArrowRight className="size-3.5" />
              </Link>
            </div>
            <div className="rise" style={{ animationDelay: "220ms" }}>
              <div className="flex w-fit max-w-full items-center gap-3 rounded-xl border border-ink/[.08] bg-bg-elevated/85 py-1.5 pl-4 pr-1.5 font-mono text-[13px] backdrop-blur">
                <span className="text-fg-subtle">base_url</span>
                <span className="truncate text-fg">{site.apiBaseUrl}</span>
                <CopyButton value={site.apiBaseUrl} label="Copy base URL" />
              </div>
            </div>
            <ul className="rise flex flex-wrap gap-x-[22px] gap-y-2.5 text-[13px] text-fg-subtle" style={{ animationDelay: "280ms" }}>
              {["Works with OpenAI SDKs", "SSE streaming", "Cost on every response"].map((t) => (
                <li key={t} className="inline-flex items-center gap-2">
                  <Check className="size-[15px] text-accent" strokeWidth={2.4} aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div className="rise mx-auto w-full min-w-0 max-w-[640px]" style={{ animationDelay: "140ms" }}>
            <HeroRouting />
          </div>
        </div>
      </section>

      <LogoMarquee />

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
        <Reveal className="mx-auto mt-12 max-w-[1040px]">
          <RoutingDemo />
        </Reveal>
      </section>

      {/* ── Platform ─────────────────────────────────────────────────────── */}
      <section className="border-t border-border bg-bg-elevated/40">
        <div className="container-page py-24 lg:py-28">
          <SectionHeading eyebrow="Platform" title="Everything between your app and the model." description="The production plumbing you would otherwise build yourself — designed as one coherent platform." />
          <div className="mt-12">
            <PlatformBento />
          </div>
        </div>
      </section>

      {/* ── MCP ──────────────────────────────────────────────────────────── */}
      <section className="container-page grid items-center gap-14 py-24 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:py-28">
        <div className="flex min-w-0 flex-col gap-6">
          <SectionHeading
            eyebrow="MCP · Preview"
            className="[&>div:first-child]:text-[color-mix(in_oklab,var(--color-iris)_77%,var(--color-ink))]"
            title={
              <>
                Connect your tools.
                <br />
                <span className="bg-[linear-gradient(100deg,color-mix(in_oklab,var(--color-iris)_36%,var(--color-grad-a)),var(--color-iris)_60%,var(--color-accent))] bg-clip-text text-transparent">Approve every call.</span>
              </>
            }
            description="Register Model Context Protocol servers and approve each tool individually. Tools start disabled; write and destructive tools need an owner or admin."
          />
          <McpToolApprovals />
        </div>
        <Reveal className="min-w-0">
          <McpHub />
        </Reveal>
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
              { t: "Authorized & direct resale", d: "Platform-funded only where provider terms or a signed agreement permit it.", icon: ShieldCheck },
              { t: "Bring your own key", d: "Your provider account, your terms — routed, logged and billed through INRENT.", icon: KeyRound },
              { t: "Self-hosted open weights", d: "Served on INRENT-operated infrastructure after license verification.", icon: Server },
              { t: "Enterprise agreements", d: "Dedicated provider arrangements scoped to the organizations they cover.", icon: Building2 },
            ].map((x) => (
              <div key={x.t} className="lift rounded-2xl border border-ink/[.08] bg-card-gradient p-5 light:shadow-[var(--shadow-panel)] light:hover:shadow-[var(--shadow-lift)]">
                <div className="flex items-center gap-2.5 text-[14.5px] font-medium text-fg">
                  <span className="ico inline-flex size-8 items-center justify-center rounded-lg border border-accent/30 bg-[radial-gradient(circle_at_30%_20%,color-mix(in_oklab,var(--color-accent)_22%,transparent),var(--color-tile)_70%)] text-accent">
                    <x.icon className="size-4" />
                  </span>
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
          <div className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-amber)_16%,transparent),transparent)]" aria-hidden />
          <div className="relative flex flex-col gap-5">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-amber/35 bg-amber-soft px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-amber">GPU Cloud · coming soon</div>
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
          <LogoMark className="size-12 drop-shadow-[0_18px_40px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] light:drop-shadow-[0_14px_28px_color-mix(in_oklab,var(--color-accent)_30%,transparent)]" title="" />
          <h2 className="text-display max-w-3xl text-4xl tracking-[-0.04em] text-fg sm:text-[clamp(40px,5vw,64px)]">AI infrastructure, <span className="text-gradient">without the infrastructure.</span></h2>
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
