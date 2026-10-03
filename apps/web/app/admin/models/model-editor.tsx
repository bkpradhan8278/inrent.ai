"use client";

import { ChevronDown } from "lucide-react";
import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatDate, formatPerMillion } from "@/lib/format";
import { cn } from "@/lib/utils";
import { setEndpointPriceAction, updateEndpointAction, updateModelAction } from "../actions";

type Tri = boolean | null;
interface Price {
  id: string;
  active: boolean;
  input: string;
  output: string;
  cached: string;
  perImage: string;
  perRequest: string;
  markup: string;
  source: string;
  effectiveFrom: string;
}
interface Endpoint {
  id: string;
  provider: string;
  providerSlug: string;
  providerEnabled: boolean;
  integrationMode: string;
  resaleVerified: boolean;
  providerModelId: string;
  enabled: boolean;
  priority: number;
  prices: Price[];
}
export interface ModelRow {
  id: string;
  slug: string;
  displayName: string;
  vendor: string;
  status: "ACTIVE" | "BETA" | "PREVIEW" | "DEPRECATED" | "DISABLED";
  verificationStatus: "VERIFIED" | "NEEDS_REVIEW" | "RESTRICTED" | "DISABLED";
  verificationNotes: string;
  license: string;
  licenseUrl: string;
  commercialUse: Tri;
  resaleAllowed: Tri;
  featured: boolean;
  isPublic: boolean;
  isDevOnly: boolean;
  qualityTier: number;
  lastVerifiedAt: string | null;
  endpoints: Endpoint[];
}

const VERIF_VARIANT = { VERIFIED: "success", NEEDS_REVIEW: "amber", RESTRICTED: "danger", DISABLED: "neutral" } as const;

function TriSelect({ id, value, onChange }: { id: string; value: Tri; onChange: (v: Tri) => void }) {
  return (
    <NativeSelect id={id} value={value === null ? "" : String(value)} onChange={(e) => onChange(e.target.value === "" ? null : e.target.value === "true")}>
      <option value="">Unknown (treated as no)</option>
      <option value="true">Yes — verified</option>
      <option value="false">No</option>
    </NativeSelect>
  );
}

function ModelForm({ m, canWrite }: { m: ModelRow; canWrite: boolean }) {
  const [v, setV] = React.useState(m);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(m);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        void run(
          () =>
            updateModelAction(m.id, {
              status: v.status,
              verificationStatus: v.verificationStatus,
              verificationNotes: v.verificationNotes || null,
              license: v.license || null,
              licenseUrl: v.licenseUrl || null,
              commercialUse: v.commercialUse,
              resaleAllowed: v.resaleAllowed,
              featured: v.featured,
              isPublic: v.isPublic,
              qualityTier: v.qualityTier,
            }),
          { success: "Model updated" },
        );
      }}
    >
      <fieldset disabled={!canWrite} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor={`st-${m.id}`}>Status</Label>
          <NativeSelect id={`st-${m.id}`} value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as ModelRow["status"] })}>
            {["ACTIVE", "BETA", "PREVIEW", "DEPRECATED", "DISABLED"].map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`vs-${m.id}`}>Verification</Label>
          <NativeSelect id={`vs-${m.id}`} value={v.verificationStatus} onChange={(e) => setV({ ...v, verificationStatus: e.target.value as ModelRow["verificationStatus"] })}>
            {["VERIFIED", "NEEDS_REVIEW", "RESTRICTED", "DISABLED"].map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase().replace("_", " ")}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`cu-${m.id}`}>Commercial use</Label>
          <TriSelect id={`cu-${m.id}`} value={v.commercialUse} onChange={(c) => setV({ ...v, commercialUse: c })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ra-${m.id}`}>Resale allowed</Label>
          <TriSelect id={`ra-${m.id}`} value={v.resaleAllowed} onChange={(c) => setV({ ...v, resaleAllowed: c })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`lic-${m.id}`}>License</Label>
          <Input id={`lic-${m.id}`} value={v.license} onChange={(e) => setV({ ...v, license: e.target.value })} placeholder="e.g. Apache-2.0, provider ToS" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`licu-${m.id}`}>License URL</Label>
          <Input id={`licu-${m.id}`} type="url" value={v.licenseUrl} onChange={(e) => setV({ ...v, licenseUrl: e.target.value })} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`vn-${m.id}`}>Verification notes</Label>
          <Input id={`vn-${m.id}`} value={v.verificationNotes} onChange={(e) => setV({ ...v, verificationNotes: e.target.value })} placeholder="Who verified what, and when" />
        </div>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-fg">
          Public in catalog
          <Switch checked={v.isPublic} onCheckedChange={(c) => setV({ ...v, isPublic: c })} />
        </label>
        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-fg">
          Featured
          <Switch checked={v.featured} onCheckedChange={(c) => setV({ ...v, featured: c })} />
        </label>
        <div className="grid gap-1.5">
          <Label htmlFor={`qt-${m.id}`}>Quality tier (1–5)</Label>
          <Input id={`qt-${m.id}`} type="number" min={1} max={5} value={v.qualityTier} onChange={(e) => setV({ ...v, qualityTier: Number(e.target.value) })} />
        </div>
      </fieldset>
      {canWrite ? (
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending || !dirty}>
            Save model
          </Button>
        </div>
      ) : null}
    </form>
  );
}

function PriceForm({ e, defaultMarkup, onDone }: { e: Endpoint; defaultMarkup: string; onDone: () => void }) {
  const active = e.prices.find((p) => p.active);
  const [v, setV] = React.useState({ input: active?.input ?? "", output: active?.output ?? "", cached: active?.cached ?? "", perImage: active?.perImage ?? "", perRequest: active?.perRequest ?? "", markup: active?.markup ?? defaultMarkup, source: "" });
  const { pending, run } = useAction();
  const num = "^\\d+(\\.\\d{1,6})?$";
  return (
    <form
      className="grid gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={async (ev) => {
        ev.preventDefault();
        const ok = await run(
          () =>
            setEndpointPriceAction(e.id, {
              inputPerMTok: v.input || null,
              outputPerMTok: v.output || null,
              cachedInputPerMTok: v.cached || null,
              perImage: v.perImage || null,
              perRequest: v.perRequest || null,
              platformMarkupPct: v.markup,
              pricingSource: v.source,
            }),
          { success: "New price version is active" },
        );
        if (ok !== undefined) onDone();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {(
          [
            ["input", "Input $/1M"],
            ["output", "Output $/1M"],
            ["cached", "Cached in $/1M"],
            ["perImage", "Per image $"],
            ["perRequest", "Per request $"],
            ["markup", "Markup %"],
          ] as const
        ).map(([k, label]) => (
          <div key={k} className="grid gap-1">
            <Label htmlFor={`${k}-${e.id}`} className="text-[12px]">
              {label}
            </Label>
            <Input id={`${k}-${e.id}`} value={v[k]} onChange={(x) => setV({ ...v, [k]: x.target.value })} pattern={num} inputMode="decimal" className="h-8 font-mono text-[12.5px]" required={k === "markup"} />
          </div>
        ))}
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`src-${e.id}`} className="text-[12px]">
          Pricing source (required)
        </Label>
        <Input id={`src-${e.id}`} value={v.source} onChange={(x) => setV({ ...v, source: x.target.value })} placeholder="Provider pricing page URL + date checked, or contract reference" required minLength={4} className="h-8" />
        <FieldHint>Enter the provider&apos;s cost price. Customers pay cost × (1 + markup). Never estimate a price.</FieldHint>
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending}>
          Publish price
        </Button>
      </div>
    </form>
  );
}

function EndpointRow({ e, canWrite, canPrice, defaultMarkup }: { e: Endpoint; canWrite: boolean; canPrice: boolean; defaultMarkup: string }) {
  const { pending, run } = useAction();
  const [pricing, setPricing] = React.useState(false);
  const active = e.prices.find((p) => p.active);
  return (
    <li className="grid gap-3 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm text-fg">{e.provider}</span>
        <span className="font-mono text-[12px] text-fg-subtle">{e.providerModelId}</span>
        <Badge variant="outline">{e.integrationMode.toLowerCase().replace(/_/g, " ")}</Badge>
        {!e.providerEnabled ? <Badge>provider off</Badge> : null}
        <span className="ml-auto flex items-center gap-3 text-[12.5px]">
          {active ? (
            <span className="font-mono text-fg">
              {active.input ? `${formatPerMillion(active.input)} in` : ""} {active.output ? `· ${formatPerMillion(active.output)} out` : ""} {active.perImage ? `${formatPerMillion(active.perImage)}/img` : ""} <span className="text-fg-subtle">+{active.markup}%</span>
            </span>
          ) : (
            <Badge variant="amber">no price</Badge>
          )}
          {canPrice ? (
            <Button size="sm" variant="ghost" onClick={() => setPricing((p) => !p)}>
              {active ? "Update price" : "Set price"}
            </Button>
          ) : null}
          {canWrite ? <Switch aria-label="Endpoint enabled" checked={e.enabled} disabled={pending} onCheckedChange={(c) => run(() => updateEndpointAction(e.id, { enabled: c }), { success: c ? "Endpoint enabled" : "Endpoint disabled" })} /> : null}
        </span>
      </div>
      {pricing ? <PriceForm e={e} defaultMarkup={defaultMarkup} onDone={() => setPricing(false)} /> : null}
      {e.prices.length ? (
        <details className="text-[12px] text-fg-subtle">
          <summary className="cursor-pointer">Price history ({e.prices.length})</summary>
          <ul className="mt-1.5 grid gap-1">
            {e.prices.map((p) => (
              <li key={p.id} className="flex flex-wrap gap-2">
                <span>{formatDate(p.effectiveFrom)}</span>
                <span className="font-mono">
                  in {p.input || "—"} · out {p.output || "—"} · +{p.markup}%
                </span>
                {p.active ? <Badge variant="success">active</Badge> : null}
                <span className="truncate">{p.source}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </li>
  );
}

export function ModelEditor({ rows, canWrite, canPrice, defaultMarkup }: { rows: ModelRow[]; canWrite: boolean; canPrice: boolean; defaultMarkup: string }) {
  const [open, setOpen] = React.useState<string | null>(null);
  if (!rows.length) return <p className="panel rounded-xl px-5 py-8 text-center text-sm text-fg-subtle">No models match.</p>;
  return (
    <ul className="grid gap-3">
      {rows.map((m) => {
        const isOpen = open === m.id;
        const priced = m.endpoints.filter((e) => e.prices.some((p) => p.active)).length;
        return (
          <li key={m.id} className="panel overflow-hidden rounded-xl">
            <button type="button" onClick={() => setOpen(isOpen ? null : m.id)} aria-expanded={isOpen} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 p-4 text-left">
              <span className="font-medium text-fg">{m.displayName}</span>
              <span className="font-mono text-[12px] text-fg-subtle">{m.slug}</span>
              <Badge variant={VERIF_VARIANT[m.verificationStatus]}>{m.verificationStatus.toLowerCase().replace("_", " ")}</Badge>
              <Badge variant="outline">{m.status.toLowerCase()}</Badge>
              {m.isDevOnly ? <Badge variant="amber">dev only</Badge> : null}
              <span className="ml-auto flex items-center gap-3 text-[12px] text-fg-subtle">
                {m.endpoints.length} endpoint(s) · {priced} priced
                <ChevronDown className={cn("size-4 transition-transform", isOpen && "rotate-180")} />
              </span>
            </button>
            {isOpen ? (
              <div className="border-t border-border">
                <div className="bg-bg-elevated p-5">
                  <ModelForm m={m} canWrite={canWrite} />
                </div>
                <div className="border-t border-border">
                  <div className="px-5 pt-3 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Provider endpoints</div>
                  {m.endpoints.length ? (
                    <ul className="divide-y divide-border">
                      {m.endpoints.map((e) => (
                        <EndpointRow key={e.id} e={e} canWrite={canWrite} canPrice={canPrice} defaultMarkup={defaultMarkup} />
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-3 text-[13px] text-fg-subtle">No endpoints. Endpoints are created when a provider mapping is added (seed or migration).</p>
                  )}
                </div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
