"use client";

import { ChevronDown, ExternalLink, KeyRound, ShieldAlert, ShieldCheck } from "lucide-react";
import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatMs, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { updateProviderAction } from "../actions";

type Mode = "DIRECT_RESALE" | "AUTHORIZED_RESELLER" | "BYOK" | "CUSTOM_ENTERPRISE" | "SELF_HOSTED" | "OPEN_WEIGHT";

export interface ProviderRow {
  id: string;
  slug: string;
  name: string;
  adapter: string;
  baseUrl: string;
  credentialRef: string;
  credentialResolved: boolean;
  integrationMode: Mode;
  resaleVerified: boolean;
  termsUrl: string;
  termsNotes: string;
  termsReviewedAt: string | null;
  byokSupported: boolean;
  enabled: boolean;
  priority: number;
  costMultiplier: string;
  healthStatus: string;
  lastHealthCheckAt: string | null;
  latencyP50Ms: number | null;
  endpoints: number;
}

function servingSummary(p: ProviderRow) {
  if (!p.enabled) return { ok: false, text: "Disabled — not used for routing." };
  if (p.integrationMode === "BYOK") return { ok: false, text: "BYOK only — customers use their own keys." };
  if ((p.integrationMode === "DIRECT_RESALE" || p.integrationMode === "AUTHORIZED_RESELLER") && !p.resaleVerified) return { ok: false, text: "Platform serving blocked until resale terms are verified." };
  if (!p.credentialResolved && p.adapter !== "MOCK") return { ok: false, text: "No platform credential resolves — set a credential reference." };
  return { ok: true, text: "Platform-funded serving allowed for models whose license and price are verified." };
}

function Editor({ p, canWrite, modes }: { p: ProviderRow; canWrite: boolean; modes: Record<Mode, { label: string; description: string; platformFunded: boolean }> }) {
  const [v, setV] = React.useState(p);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(p);
  const needsTerms = (v.integrationMode === "DIRECT_RESALE" || v.integrationMode === "AUTHORIZED_RESELLER") && v.resaleVerified && !v.termsUrl.trim();
  return (
    <form
      className="grid gap-5 border-t border-border bg-bg-elevated p-5"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            updateProviderAction(p.id, {
              enabled: v.enabled,
              priority: v.priority,
              integrationMode: v.integrationMode,
              resaleVerified: v.resaleVerified,
              termsUrl: v.termsUrl.trim() || null,
              termsNotes: v.termsNotes.trim() || null,
              baseUrl: v.baseUrl,
              credentialRef: v.credentialRef.trim() || null,
              costMultiplier: v.costMultiplier,
              byokSupported: v.byokSupported,
            }),
          { success: `${p.name} updated` },
        );
      }}
    >
      <fieldset disabled={!canWrite} className="grid gap-5">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`mode-${p.id}`}>Integration mode</Label>
            <NativeSelect id={`mode-${p.id}`} value={v.integrationMode} onChange={(e) => setV({ ...v, integrationMode: e.target.value as Mode, resaleVerified: false })}>
              {(Object.keys(modes) as Mode[]).map((m) => (
                <option key={m} value={m}>
                  {modes[m].label}
                </option>
              ))}
            </NativeSelect>
            <FieldHint>{modes[v.integrationMode].description}</FieldHint>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`cred-${p.id}`}>Platform credential reference</Label>
            <Input id={`cred-${p.id}`} value={v.credentialRef} onChange={(e) => setV({ ...v, credentialRef: e.target.value })} placeholder="env:OPENAI_API_KEY · vault:path · aws-sm:name" className="font-mono text-[12.5px]" spellCheck={false} autoComplete="off" />
            <FieldHint>A pointer to your secret manager. Never paste an API key here.</FieldHint>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`terms-${p.id}`}>Terms / agreement reference</Label>
            <Input id={`terms-${p.id}`} type="url" value={v.termsUrl} onChange={(e) => setV({ ...v, termsUrl: e.target.value })} placeholder="https://… (provider terms or contract record)" />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`base-${p.id}`}>Base URL</Label>
            <Input id={`base-${p.id}`} value={v.baseUrl} onChange={(e) => setV({ ...v, baseUrl: e.target.value })} className="font-mono text-[12.5px]" />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`notes-${p.id}`}>Legal review notes</Label>
          <Textarea id={`notes-${p.id}`} value={v.termsNotes} onChange={(e) => setV({ ...v, termsNotes: e.target.value })} className="min-h-16" placeholder="Who reviewed, which clause permits resale, restrictions (regions, use cases, attribution)…" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-fg">
            Enabled
            <Switch checked={v.enabled} onCheckedChange={(c) => setV({ ...v, enabled: c })} />
          </label>
          <label className={cn("flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-[13px] text-fg", v.resaleVerified ? "border-[rgb(74_222_156/0.35)] bg-success-soft" : "border-border bg-surface")}>
            Resale verified
            <Switch checked={v.resaleVerified} disabled={!modes[v.integrationMode].platformFunded || v.integrationMode === "SELF_HOSTED" || v.integrationMode === "OPEN_WEIGHT"} onCheckedChange={(c) => setV({ ...v, resaleVerified: c })} />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 text-[13px] text-fg">
            BYOK supported
            <Switch checked={v.byokSupported} onCheckedChange={(c) => setV({ ...v, byokSupported: c })} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1">
              <Label htmlFor={`prio-${p.id}`} className="text-[12px]">
                Priority
              </Label>
              <Input id={`prio-${p.id}`} type="number" min={0} max={1000} value={v.priority} onChange={(e) => setV({ ...v, priority: Number(e.target.value) })} className="h-8" />
            </div>
            <div className="grid gap-1">
              <Label htmlFor={`mult-${p.id}`} className="text-[12px]">
                Cost ×
              </Label>
              <Input id={`mult-${p.id}`} value={v.costMultiplier} onChange={(e) => setV({ ...v, costMultiplier: e.target.value })} className="h-8 font-mono" />
            </div>
          </div>
        </div>
        {needsTerms ? <p className="text-[12.5px] text-danger">Record the terms or agreement reference before marking resale as verified.</p> : null}
      </fieldset>
      {canWrite ? (
        <div className="flex items-center justify-end gap-2">
          {dirty ? (
            <Button type="button" variant="ghost" onClick={() => setV(p)}>
              Reset
            </Button>
          ) : null}
          <Button type="submit" disabled={pending || !dirty || needsTerms}>
            Save changes
          </Button>
        </div>
      ) : null}
    </form>
  );
}

export function ProviderEditor({ rows, canWrite, modes }: { rows: ProviderRow[]; canWrite: boolean; modes: Record<Mode, { label: string; description: string; platformFunded: boolean }> }) {
  const [open, setOpen] = React.useState<string | null>(null);
  return (
    <ul className="grid gap-3">
      {rows.map((p) => {
        const s = servingSummary(p);
        const isOpen = open === p.id;
        return (
          <li key={p.id} className="panel overflow-hidden rounded-xl">
            <button type="button" onClick={() => setOpen(isOpen ? null : p.id)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-2 p-4 text-left">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{p.name}</span>
                  <span className="font-mono text-[11.5px] text-fg-subtle">{p.slug}</span>
                  {p.enabled ? <Badge variant="accent">enabled</Badge> : <Badge>disabled</Badge>}
                  <Badge variant="outline">{modes[p.integrationMode].label}</Badge>
                  {p.adapter === "MOCK" ? <Badge variant="amber">dev mock</Badge> : null}
                </div>
                <div className={cn("mt-1 flex items-center gap-1.5 text-[12.5px]", s.ok ? "text-success" : "text-fg-subtle")}>
                  {s.ok ? <ShieldCheck className="size-3.5" /> : <ShieldAlert className="size-3.5" />}
                  {s.text}
                </div>
              </div>
              <div className="flex items-center gap-3 text-[12px] text-fg-subtle">
                <span className="inline-flex items-center gap-1">
                  <KeyRound className="size-3.5" /> {p.credentialResolved ? "credential ok" : "no credential"}
                </span>
                <span>{p.endpoints} endpoints</span>
                <span>p50 {formatMs(p.latencyP50Ms)}</span>
                <StatusPill status={p.healthStatus} />
                {p.lastHealthCheckAt ? <span className="hidden md:inline">checked {formatRelative(p.lastHealthCheckAt)}</span> : null}
                <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
              </div>
            </button>
            {isOpen ? (
              <>
                {p.termsReviewedAt ? (
                  <div className="flex items-center gap-2 border-t border-border px-5 py-2 text-[12px] text-fg-subtle">
                    Terms reviewed {formatRelative(p.termsReviewedAt)}
                    {p.termsUrl ? (
                      <a href={p.termsUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                        reference <ExternalLink className="size-3" />
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <Editor p={p} canWrite={canWrite} modes={modes} />
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
