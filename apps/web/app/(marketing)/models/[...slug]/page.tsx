import { ArrowLeft, BookOpen, Check, ExternalLink, MessagesSquare, Minus, X } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CAPABILITIES, INTEGRATION_MODE_INFO, MODALITIES } from "@inrent/core";
import { VendorMark } from "@/components/brand/icons";
import { AvailabilityBadge } from "@/components/marketing/model-card";
import { MiniPlayground } from "@/components/playground/mini-playground";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CodeTabs } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { safePublicModel, safePublicModels } from "@/lib/catalog";
import { formatContext, formatDate, formatMs, formatPerMillion } from "@/lib/format";
import { site } from "@/lib/site";
import { chatSnippets } from "@/lib/snippets";

export const revalidate = 300;

export async function generateStaticParams() {
  const models = await safePublicModels();
  return models.filter((m) => !m.isDevOnly).map((m) => ({ slug: m.slug.split("/") }));
}

async function load(params: Promise<{ slug: string[] }>) {
  const { slug } = await params;
  return safePublicModel(slug.map(decodeURIComponent).join("/"));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const model = await load(params);
  if (!model) return { title: "Model not found" };
  return {
    title: `${model.displayName} API`,
    description: `${model.displayName} (${model.slug}) through the INRENT API: ${model.description}`,
    alternates: { canonical: `/models/${model.slug}` },
  };
}

function Yes({ on }: { on: boolean | null }) {
  if (on === null) return <Minus className="size-4 text-fg-subtle" aria-label="Unknown" />;
  return on ? <Check className="size-4 text-accent" aria-label="Yes" /> : <X className="size-4 text-fg-subtle" aria-label="No" />;
}

export default async function ModelPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const model = await load(params);
  if (!model) notFound();
  const enabled = model.providers.filter((p) => p.enabled);
  const any = (k: "supportsTools" | "supportsJsonMode" | "supportsStructuredOutput" | "supportsStreaming" | "supportsVision") => (model.providers.length ? model.providers.some((p) => p[k]) : null);
  const isEmbedding = model.capabilities.includes("embedding") && !model.capabilities.includes("chat");

  const embeddingSnippets = [
    {
      label: "cURL",
      lang: "bash",
      code: `curl ${site.apiBaseUrl}/embeddings \\\n  -H "Authorization: Bearer $INRENT_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '{ "model": "${model.slug}", "input": ["The quick brown fox"] }'`,
    },
    {
      label: "Python",
      lang: "python",
      code: `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${site.apiBaseUrl}", api_key=os.environ["INRENT_API_KEY"])\nres = client.embeddings.create(model="${model.slug}", input=["The quick brown fox"])\nprint(len(res.data[0].embedding))`,
    },
    {
      label: "TypeScript",
      lang: "typescript",
      code: `import { Inrent } from "@inrent/sdk";\n\nconst client = new Inrent({ apiKey: process.env.INRENT_API_KEY! });\nconst res = await client.embeddings.create({ model: "${model.slug}", input: ["The quick brown fox"] });\nconsole.log(res.data[0]?.embedding.length);`,
    },
  ];

  const stats = [
    { label: "Context", value: formatContext(model.contextLength) ?? "Not verified" },
    { label: "Input price", value: model.pricing?.input ? `${formatPerMillion(model.pricing.input)} /1M` : "Not published" },
    { label: "Output price", value: model.pricing?.output ? `${formatPerMillion(model.pricing.output)} /1M` : isEmbedding ? "—" : "Not published" },
    { label: "Providers", value: enabled.length ? `${enabled.length} enabled` : `${model.providers.length} configured` },
  ];

  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[420px]" aria-hidden />
      <div className="container-page relative py-12">
        <Link href="/models" className="inline-flex items-center gap-1.5 text-sm text-fg-subtle hover:text-fg">
          <ArrowLeft className="size-3.5" /> All models
        </Link>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex max-w-3xl gap-4">
            <VendorMark vendor={model.vendor} className="size-12 text-lg" />
            <div className="flex flex-col gap-3">
              <h1 className="text-display text-4xl text-fg">{model.displayName}</h1>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-bg-elevated py-0.5 pl-2 pr-0.5 font-mono text-[12.5px] text-fg-muted">
                  {model.slug}
                  <CopyButton value={model.slug} label="Copy model id" className="size-6" />
                </span>
                <AvailabilityBadge availability={model.availability} devOnly={model.isDevOnly} />
                <Badge variant={model.verificationStatus === "VERIFIED" ? "success" : "outline"}>{model.verificationStatus === "VERIFIED" ? "Verified" : "Verification pending"}</Badge>
                {model.openWeights ? <Badge variant="iris">Open weights</Badge> : null}
                {model.status !== "ACTIVE" ? <Badge variant="neutral">{model.status.toLowerCase()}</Badge> : null}
              </div>
              <p className="text-[15px] leading-relaxed text-fg-muted">{model.description}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/dashboard/playground?model=${encodeURIComponent(model.slug)}`}>
                <MessagesSquare /> Try model
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <a href="#api">View API</a>
            </Button>
            <Button asChild variant="ghost">
              <Link href={`/models?compare=${encodeURIComponent(model.slug)}`}>Compare</Link>
            </Button>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="bg-surface px-5 py-4">
              <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{s.label}</div>
              <div className="mt-1 font-display text-lg font-semibold text-fg">{s.value}</div>
            </div>
          ))}
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <section className="flex flex-col gap-8">
            <div>
              <h2 className="text-lg font-semibold text-fg">Capabilities</h2>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {[
                  ["Tool calling", any("supportsTools")],
                  ["JSON mode", any("supportsJsonMode")],
                  ["Structured outputs", any("supportsStructuredOutput")],
                  ["Streaming", any("supportsStreaming")],
                  ["Vision input", any("supportsVision")],
                  ["Reasoning", model.capabilities.includes("reasoning")],
                ].map(([label, on]) => (
                  <div key={String(label)} className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated px-3.5 py-2.5 text-sm text-fg-muted">
                    {label}
                    <Yes on={on as boolean | null} />
                  </div>
                ))}
              </div>
              <div className="mt-4 flex flex-wrap gap-4 text-sm">
                <div>
                  <span className="text-fg-subtle">Input: </span>
                  <span className="text-fg-muted">{model.modalitiesIn.map((x) => MODALITIES[x as keyof typeof MODALITIES] ?? x).join(", ")}</span>
                </div>
                <div>
                  <span className="text-fg-subtle">Output: </span>
                  <span className="text-fg-muted">{model.modalitiesOut.map((x) => MODALITIES[x as keyof typeof MODALITIES] ?? x).join(", ")}</span>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {model.capabilities.map((c) => (
                  <Badge key={c}>{CAPABILITIES[c as keyof typeof CAPABILITIES] ?? c}</Badge>
                ))}
              </div>
            </div>

            <div>
              <h2 className="text-lg font-semibold text-fg">Providers</h2>
              <p className="mt-1 text-sm text-fg-subtle">Requests route to eligible providers by your routing policy, with automatic fallback.</p>
              <div className="panel mt-4 overflow-hidden rounded-xl">
                <Table>
                  <THead>
                    <TR>
                      <TH>Provider</TH>
                      <TH>Mode</TH>
                      <TH>Status</TH>
                      <TH>Context</TH>
                      <TH>Price /1M</TH>
                      <TH>Latency</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {model.providers.map((p) => (
                      <TR key={`${p.slug}-${p.providerModelId}`}>
                        <TD>
                          <div className="font-medium text-fg">{p.name}</div>
                          <div className="font-mono text-[11px] text-fg-subtle">{p.providerModelId}</div>
                        </TD>
                        <TD className="text-xs">{INTEGRATION_MODE_INFO[p.integrationMode]?.label ?? p.integrationMode}</TD>
                        <TD>
                          <AvailabilityBadge availability={p.availability} />
                        </TD>
                        <TD className="font-mono text-xs">{formatContext(p.contextLength) ?? "—"}</TD>
                        <TD className="font-mono text-xs">{p.pricing?.input ? `${formatPerMillion(p.pricing.input)} / ${formatPerMillion(p.pricing.output) ?? "—"}` : "—"}</TD>
                        <TD className="font-mono text-xs">{p.latencyP50Ms ? formatMs(p.latencyP50Ms) : "—"}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            </div>

            <div id="api" className="scroll-mt-24">
              <h2 className="text-lg font-semibold text-fg">API</h2>
              <p className="mt-1 text-sm text-fg-subtle">
                OpenAI-compatible. Use model <code className="font-mono text-fg-muted">{model.slug}</code> with base URL <code className="font-mono text-fg-muted">{site.apiBaseUrl}</code>.
              </p>
              <div className="mt-4">
                <CodeTabs tabs={isEmbedding ? embeddingSnippets : chatSnippets(model.slug)} title={isEmbedding ? "embeddings" : "chat.completions"} />
              </div>
            </div>
          </section>

          <aside className="flex flex-col gap-6">
            <div className="panel rounded-xl p-5">
              <h2 className="text-sm font-semibold text-fg">Pricing</h2>
              {model.pricing && (model.pricing.input || model.pricing.output) ? (
                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-fg-subtle">Input</dt>
                    <dd className="font-mono text-fg">{formatPerMillion(model.pricing.input) ?? "—"} /1M</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-fg-subtle">Output</dt>
                    <dd className="font-mono text-fg">{formatPerMillion(model.pricing.output) ?? "—"} /1M</dd>
                  </div>
                  {model.pricing.cachedInput ? (
                    <div className="flex justify-between">
                      <dt className="text-fg-subtle">Cached input</dt>
                      <dd className="font-mono text-fg">{formatPerMillion(model.pricing.cachedInput)} /1M</dd>
                    </div>
                  ) : null}
                  <p className="pt-2 text-xs leading-relaxed text-fg-subtle">
                    Includes the INRENT platform fee. {model.pricing.lastVerifiedAt ? `Verified ${formatDate(model.pricing.lastVerifiedAt)}.` : ""} BYOK requests are billed by the provider directly.
                  </p>
                </dl>
              ) : (
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">
                  Pricing is published once verified against the provider&apos;s current price list. {model.providers.some((p) => p.availability === "byok") ? "You can use this model now with your own provider key." : ""}
                </p>
              )}
            </div>
            <div className="panel rounded-xl p-5">
              <h2 className="text-sm font-semibold text-fg">License & usage</h2>
              <dl className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">License</dt>
                  <dd className="text-right text-fg-muted">{model.license ? (model.licenseUrl ? <a className="text-accent hover:underline" href={model.licenseUrl}>{model.license}</a> : model.license) : "Not yet verified"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">Commercial use</dt>
                  <dd className="text-fg-muted">{model.commercialUse === null ? "Not yet verified" : model.commercialUse ? "Permitted" : "Not permitted"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-fg-subtle">Rate limits</dt>
                  <dd className="text-right text-fg-muted">
                    <Link href="/docs/rate-limits" className="text-accent hover:underline">
                      Per plan &amp; key
                    </Link>
                  </dd>
                </div>
              </dl>
              {model.documentationUrl ? (
                <a href={model.documentationUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm text-fg-muted hover:text-fg">
                  <BookOpen className="size-3.5" /> Provider documentation <ExternalLink className="size-3" />
                </a>
              ) : null}
            </div>
          </aside>
        </div>

        {!isEmbedding ? (
          <section className="mt-14">
            <h2 className="text-lg font-semibold text-fg">Try it</h2>
            <p className="mt-1 text-sm text-fg-subtle">Runs against the live API with your active project. Usage is billed like API requests.</p>
            <div className="mt-4">
              <MiniPlayground model={model} />
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
