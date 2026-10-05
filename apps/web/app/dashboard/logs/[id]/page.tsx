import { ArrowLeft, Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { notFound } from "next/navigation";
import { getRequestDetail } from "@inrent/services";
import { PageHeader, Section, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { CodeBlock } from "@/components/ui/code-block";
import { CopyButton } from "@/components/ui/copy-button";
import { usd } from "@/lib/dashboard";
import { formatDateTime, formatMs, formatNumber } from "@/lib/format";
import { requireOrgPermission } from "@/lib/session";
import { vendorName } from "@/lib/vendors";

export const metadata: Metadata = { title: "Request" };

interface Attempt {
  provider: string;
  model: string;
  billingMode: string;
  outcome: "success" | "error" | "skipped";
  code?: string;
  status?: number;
  latencyMs?: number;
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <dt className="shrink-0 text-[13px] text-fg-subtle">{label}</dt>
      <dd className={`min-w-0 break-all text-right text-[13px] text-fg ${mono ? "font-mono text-[12.5px]" : ""}`}>{children}</dd>
    </div>
  );
}

export default async function RequestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ws = await requireOrgPermission("logs:read");
  const r = await getRequestDetail(ws.org.id, decodeURIComponent(id), { includePayloads: ws.can("logs:read_payloads") });
  if (!r) notFound();
  const routing = (r.routing ?? {}) as { policy?: string | null; attempts?: Attempt[]; rejected?: Array<{ providerSlug: string; modelSlug: string; reason: string }> };
  const attempts = routing.attempts ?? [];

  return (
    <>
      <Link href="/dashboard/logs" className="mb-4 inline-flex items-center gap-1.5 text-[13px] text-fg-subtle hover:text-fg">
        <ArrowLeft className="size-3.5" /> Logs
      </Link>
      <PageHeader
        title={r.modelSlug ?? r.modelRequested}
        description={
          <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[12.5px]">
            {r.requestId} <CopyButton value={r.requestId} label="Copy request ID" />
          </span>
        }
        badge={
          <>
            <StatusPill status={r.status} />
            {r.isDemo ? <Badge variant="amber">Demo data</Badge> : null}
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="grid gap-6 xl:col-span-2">
          {r.status === "ERROR" ? (
            <div role="alert" className="rounded-xl border border-danger/30 bg-danger-soft p-4">
              <div className="font-mono text-[13px] text-danger">
                {r.httpStatus} · {r.errorType ?? "error"} · {r.errorCode ?? "unknown"}
              </div>
              {r.errorMessage ? <p className="mt-1 text-sm text-fg">{r.errorMessage}</p> : null}
              {r.errorCode ? (
                <Link href={`/docs/errors#${r.errorCode}`} className="mt-2 inline-block text-[13px] text-accent hover:underline">
                  What does this error mean? →
                </Link>
              ) : null}
            </div>
          ) : null}

          <Section title="Routing" description={routing.policy ? `Policy: ${routing.policy.toLowerCase()}` : undefined} contentClassName="p-0">
            {attempts.length ? (
              <ol className="divide-y divide-border">
                {attempts.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-3 px-5 py-3 text-[13px]">
                    <span className="flex size-6 items-center justify-center rounded-full border border-border-strong font-mono text-[11px] text-fg-muted">{i + 1}</span>
                    <span className="font-medium text-fg">{vendorName(a.provider)}</span>
                    <span className="font-mono text-[12px] text-fg-muted">{a.model}</span>
                    <Badge variant={a.billingMode === "BYOK" ? "iris" : "outline"}>{a.billingMode.toLowerCase()}</Badge>
                    <span className="ml-auto flex items-center gap-2">
                      {a.code ? <span className="font-mono text-[11.5px] text-fg-subtle">{a.status ? `${a.status} ` : ""}{a.code}</span> : null}
                      {a.latencyMs !== undefined ? <span className="text-[12px] text-fg-subtle">{formatMs(a.latencyMs)}</span> : null}
                      <StatusPill status={a.outcome === "success" ? "SUCCESS" : a.outcome === "skipped" ? "SKIPPED" : "ERROR"} />
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="px-5 py-6 text-sm text-fg-subtle">No provider was attempted for this request.</p>
            )}
            {routing.rejected?.length ? (
              <details className="border-t border-border px-5 py-3 text-[13px]">
                <summary className="cursor-pointer text-fg-muted">{routing.rejected.length} candidate(s) excluded</summary>
                <ul className="mt-2 grid gap-1">
                  {routing.rejected.map((x, i) => (
                    <li key={i} className="flex flex-wrap gap-2 text-fg-subtle">
                      <span className="text-fg-muted">{vendorName(x.providerSlug)}</span>
                      <span className="font-mono text-[12px]">{x.modelSlug}</span>
                      <span>— {x.reason.replace(/_/g, " ")}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </Section>

          <Section title="Payloads">
            {r.promptPayload || r.responsePayload ? (
              <div className="grid gap-4">
                {r.promptPayload ? <CodeBlock lang="json" title="Request" code={JSON.stringify(r.promptPayload, null, 2)} /> : null}
                {r.responsePayload ? <CodeBlock lang="json" title="Response" code={JSON.stringify(r.responsePayload, null, 2)} /> : null}
              </div>
            ) : (
              <div className="flex items-start gap-3 text-sm text-fg-muted">
                <Lock className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
                <p>
                  {r.payloadsHidden
                    ? "Your role can't view prompt and response payloads."
                    : ws.org.zeroRetention
                      ? "Zero-retention is on: payloads are never stored."
                      : "Prompt and response logging are off for this organization, so only metadata is kept."}{" "}
                  {!r.payloadsHidden && ws.can("settings:write") ? (
                    <Link href="/dashboard/settings" className="text-accent hover:underline">
                      Privacy settings
                    </Link>
                  ) : null}
                </p>
              </div>
            )}
          </Section>
        </div>

        <div className="grid content-start gap-6">
          <Section title="Details" contentClassName="py-2">
            <dl className="divide-y divide-border">
              <Field label="Time">{formatDateTime(r.createdAt)}</Field>
              <Field label="Endpoint" mono>
                {r.endpoint}
              </Field>
              <Field label="Requested model" mono>
                {r.modelRequested}
              </Field>
              <Field label="Provider">{r.providerSlug ? vendorName(r.providerSlug) : "—"}</Field>
              <Field label="Provider model" mono>
                {r.providerModelId ?? "—"}
              </Field>
              <Field label="Billing">{r.billingMode.toLowerCase()}</Field>
              <Field label="Stream">{r.stream ? "yes" : "no"}</Field>
              <Field label="Finish reason">{r.finishReason ?? "—"}</Field>
              <Field label="Source">{r.source}</Field>
              <Field label="Project">{r.project.name}</Field>
              <Field label="API key">{r.apiKey ? `${r.apiKey.name} (${r.apiKey.displayPrefix}…${r.apiKey.lastFour})` : "—"}</Field>
              {r.traceId ? (
                <Field label="Trace" mono>
                  {r.traceId}
                </Field>
              ) : null}
            </dl>
          </Section>
          <Section title="Tokens & cost" contentClassName="py-2">
            <dl className="divide-y divide-border">
              <Field label="Input tokens">{formatNumber(r.inputTokens)}</Field>
              <Field label="Output tokens">{formatNumber(r.outputTokens)}</Field>
              {r.cachedTokens ? <Field label="Cached tokens">{formatNumber(r.cachedTokens)}</Field> : null}
              {r.reasoningTokens ? <Field label="Reasoning tokens">{formatNumber(r.reasoningTokens)}</Field> : null}
              <Field label="Charged" mono>
                ${usd(r.userChargeNano, 9)}
              </Field>
              {r.usageEstimated ? <Field label="Usage">estimated (provider returned no usage)</Field> : null}
            </dl>
          </Section>
          <Section title="Latency" contentClassName="py-2">
            <dl className="divide-y divide-border">
              <Field label="Total">{formatMs(r.latencyMs)}</Field>
              <Field label="Time to first token">{formatMs(r.ttftMs)}</Field>
              <Field label="Provider">{formatMs(r.providerLatencyMs)}</Field>
              <Field label="Fallbacks">{r.fallbackCount}</Field>
            </dl>
          </Section>
        </div>
      </div>
    </>
  );
}
