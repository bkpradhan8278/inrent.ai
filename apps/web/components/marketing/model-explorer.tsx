"use client";

import { ArrowUpDown, Check, LayoutGrid, List, Search, SlidersHorizontal, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import type { PublicModel } from "@inrent/services";
import { VendorMark } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatContext, formatMs, formatPerMillion } from "@/lib/format";
import { cn } from "@/lib/utils";
import { vendorName } from "@/lib/vendors";
import { AvailabilityBadge, ModelCard, PriceLine } from "./model-card";

const CAP_FILTERS: Array<{ id: string; label: string; test: (m: PublicModel) => boolean }> = [
  { id: "text", label: "Text", test: (m) => m.modalitiesOut.includes("text") },
  { id: "vision", label: "Vision", test: (m) => m.capabilities.includes("vision") || m.modalitiesIn.includes("image") },
  { id: "audio", label: "Audio", test: (m) => m.modalitiesIn.includes("audio") || m.capabilities.includes("audio") },
  { id: "image", label: "Image generation", test: (m) => m.capabilities.includes("image_generation") || m.modalitiesOut.includes("image") },
  { id: "video", label: "Video", test: (m) => m.modalitiesIn.includes("video") || m.modalitiesOut.includes("video") },
  { id: "reasoning", label: "Reasoning", test: (m) => m.capabilities.includes("reasoning") },
  { id: "coding", label: "Coding", test: (m) => m.capabilities.includes("coding") },
  { id: "embedding", label: "Embeddings", test: (m) => m.capabilities.includes("embedding") },
  { id: "tools", label: "Tool calling", test: (m) => m.capabilities.includes("tools") },
  { id: "structured", label: "Structured output", test: (m) => m.capabilities.includes("structured_output") || m.capabilities.includes("json_mode") },
  { id: "open", label: "Open weights", test: (m) => m.openWeights },
];

const CONTEXT_OPTIONS = [
  { v: 0, label: "Any context" },
  { v: 32_000, label: "≥ 32K" },
  { v: 128_000, label: "≥ 128K" },
  { v: 200_000, label: "≥ 200K" },
  { v: 1_000_000, label: "≥ 1M" },
];

type Sort = "featured" | "name" | "context" | "price" | "latency";

function inputPrice(m: PublicModel): number | null {
  return m.pricing?.input ? Number(m.pricing.input) : null;
}

function bestLatency(m: PublicModel): number | null {
  const l = m.providers.map((p) => p.ttftP50Ms ?? p.latencyP50Ms).filter((x): x is number => x !== null);
  return l.length ? Math.min(...l) : null;
}

type Params = Pick<URLSearchParams, "get" | "toString">;
const NO_PARAMS: Params = new URLSearchParams();

/**
 * Model catalog with search, filters and comparison. The Suspense fallback renders the same
 * grid without URL state, so the server HTML matches the hydrated layout (no layout shift).
 */
export function ModelExplorer({ models }: { models: PublicModel[] }) {
  return (
    <Suspense fallback={<ExplorerView models={models} params={NO_PARAMS} />}>
      <ExplorerWithParams models={models} />
    </Suspense>
  );
}

function ExplorerWithParams({ models }: { models: PublicModel[] }) {
  const params = useSearchParams();
  return <ExplorerView models={models} params={params} />;
}

function ExplorerView({ models, params }: { models: PublicModel[]; params: Params }) {
  const router = useRouter();
  const [q, setQ] = useState(params.get("q") ?? "");
  const [vendors, setVendors] = useState<string[]>([]);
  const [caps, setCaps] = useState<string[]>([]);
  const [minContext, setMinContext] = useState(0);
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("featured");
  const [view, setView] = useState<"grid" | "table">("grid");
  const [compare, setCompare] = useState<string[]>(() => (params.get("compare") ?? "").split(",").filter(Boolean).slice(0, 3));
  const [compareOpen, setCompareOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const allVendors = useMemo(() => [...new Set(models.map((m) => m.vendor))].sort(), [models]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = models.filter((m) => {
      if (needle && !`${m.displayName} ${m.slug} ${m.vendor} ${m.description} ${m.family ?? ""}`.toLowerCase().includes(needle)) return false;
      if (vendors.length && !vendors.includes(m.vendor)) return false;
      for (const c of caps) if (!CAP_FILTERS.find((f) => f.id === c)?.test(m)) return false;
      if (minContext && (m.contextLength ?? 0) < minContext) return false;
      if (maxPrice) {
        const p = inputPrice(m);
        if (p === null || p > Number(maxPrice)) return false;
      }
      if (availableOnly && m.availability === "unavailable") return false;
      return true;
    });
    const by = {
      featured: (a: PublicModel, b: PublicModel) => Number(b.featured) - Number(a.featured) || Number(a.availability === "unavailable") - Number(b.availability === "unavailable") || a.displayName.localeCompare(b.displayName),
      name: (a: PublicModel, b: PublicModel) => a.displayName.localeCompare(b.displayName),
      context: (a: PublicModel, b: PublicModel) => (b.contextLength ?? 0) - (a.contextLength ?? 0),
      price: (a: PublicModel, b: PublicModel) => (inputPrice(a) ?? Infinity) - (inputPrice(b) ?? Infinity),
      latency: (a: PublicModel, b: PublicModel) => (bestLatency(a) ?? Infinity) - (bestLatency(b) ?? Infinity),
    }[sort];
    return [...list].sort(by);
  }, [models, q, vendors, caps, minContext, maxPrice, availableOnly, sort]);

  const toggle = (list: string[], set: (v: string[]) => void, v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const toggleCompare = (slug: string) => setCompare((c) => (c.includes(slug) ? c.filter((x) => x !== slug) : c.length >= 3 ? c : [...c, slug]));
  const activeFilters = vendors.length + caps.length + (minContext ? 1 : 0) + (maxPrice ? 1 : 0) + (availableOnly ? 1 : 0);
  const comparing = compare.map((s) => models.find((m) => m.slug === s)).filter((m): m is PublicModel => Boolean(m));

  const filtersPanel = (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Provider</div>
        <div className="flex flex-col gap-1">
          {allVendors.map((v) => (
            <label key={v} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-fg-muted hover:bg-surface-2">
              <input type="checkbox" className="accent-[#5cebc0]" checked={vendors.includes(v)} onChange={() => toggle(vendors, setVendors, v)} />
              {vendorName(v)}
            </label>
          ))}
        </div>
      </div>
      <div>
        <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Capabilities</div>
        <div className="flex flex-wrap gap-1.5">
          {CAP_FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={caps.includes(f.id)}
              onClick={() => toggle(caps, setCaps, f.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs transition-colors",
                caps.includes(f.id) ? "border-[rgb(92_235_192/0.45)] bg-accent-soft text-accent" : "border-border-strong text-fg-muted hover:text-fg",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="grid gap-3">
        <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Context length</div>
        <NativeSelect value={minContext} onChange={(e) => setMinContext(Number(e.target.value))} aria-label="Minimum context length">
          {CONTEXT_OPTIONS.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </NativeSelect>
        <div className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">Max input price ($/1M)</div>
        <Input inputMode="decimal" placeholder="e.g. 1.00" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d.]/g, ""))} aria-label="Maximum input price per million tokens" />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" className="accent-[#5cebc0]" checked={availableOnly} onChange={(e) => setAvailableOnly(e.target.checked)} />
          Usable now (platform or BYOK)
        </label>
      </div>
      {activeFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setVendors([]);
            setCaps([]);
            setMinContext(0);
            setMaxPrice("");
            setAvailableOnly(false);
          }}
        >
          Clear {activeFilters} filter{activeFilters > 1 ? "s" : ""}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="grid gap-8 lg:grid-cols-[240px_1fr]">
      <aside className="hidden lg:block">
        <div className="sticky top-24">{filtersPanel}</div>
      </aside>
      <div className="min-w-0">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                const sp = new URLSearchParams(params.toString());
                if (e.target.value) sp.set("q", e.target.value);
                else sp.delete("q");
                router.replace(`/models${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
              }}
              placeholder="Search models, providers, capabilities…"
              className="h-10 pl-9"
              aria-label="Search models"
            />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
              <SlidersHorizontal /> Filters{activeFilters ? ` (${activeFilters})` : ""}
            </Button>
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-fg-subtle" />
              <NativeSelect value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 w-40 pl-8 text-[13px]" aria-label="Sort models">
                <option value="featured">Featured</option>
                <option value="name">Name</option>
                <option value="context">Context length</option>
                <option value="price">Input price</option>
                <option value="latency">Measured latency</option>
              </NativeSelect>
            </div>
            <div className="flex rounded-md border border-border p-0.5">
              <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={cn("rounded p-1.5", view === "grid" ? "bg-surface-3 text-fg" : "text-fg-subtle")}>
                <LayoutGrid className="size-3.5" />
              </button>
              <button type="button" aria-label="Table view" aria-pressed={view === "table"} onClick={() => setView("table")} className={cn("rounded p-1.5", view === "table" ? "bg-surface-3 text-fg" : "text-fg-subtle")}>
                <List className="size-3.5" />
              </button>
            </div>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-fg-subtle">
          <span>
            {filtered.length} of {models.length} models
          </span>
          <span>Prices per 1M tokens, including platform fee</span>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border p-12 text-center">
            <p className="text-sm text-fg-muted">No models match these filters.</p>
          </div>
        ) : view === "grid" ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((m) => (
              <div key={m.slug} className="relative">
                <ModelCard model={m} />
                <button
                  type="button"
                  onClick={() => toggleCompare(m.slug)}
                  aria-pressed={compare.includes(m.slug)}
                  className={cn(
                    "absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] backdrop-blur transition-colors",
                    compare.includes(m.slug) ? "border-[rgb(92_235_192/0.45)] bg-accent-soft text-accent" : "border-border-strong bg-bg/70 text-fg-subtle hover:text-fg",
                  )}
                >
                  {compare.includes(m.slug) ? <Check className="size-3" /> : null}
                  Compare
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="panel mt-4 overflow-hidden rounded-xl">
            <Table>
              <THead>
                <TR>
                  <TH>Model</TH>
                  <TH>Context</TH>
                  <TH>Input /1M</TH>
                  <TH>Output /1M</TH>
                  <TH>Latency</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Compare</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((m) => (
                  <TR key={m.slug}>
                    <TD>
                      <Link href={`/models/${m.slug}`} className="flex items-center gap-3">
                        <VendorMark vendor={m.vendor} className="size-7" />
                        <span>
                          <span className="block font-medium text-fg">{m.displayName}</span>
                          <span className="block font-mono text-[11px] text-fg-subtle">{m.slug}</span>
                        </span>
                      </Link>
                    </TD>
                    <TD className="font-mono">{formatContext(m.contextLength) ?? "—"}</TD>
                    <TD className="font-mono">{formatPerMillion(m.pricing?.input) ?? "—"}</TD>
                    <TD className="font-mono">{formatPerMillion(m.pricing?.output) ?? "—"}</TD>
                    <TD className="font-mono">{formatMs(bestLatency(m))}</TD>
                    <TD>
                      <AvailabilityBadge availability={m.availability} devOnly={m.isDevOnly} />
                    </TD>
                    <TD className="text-right">
                      <input type="checkbox" className="accent-[#5cebc0]" checked={compare.includes(m.slug)} onChange={() => toggleCompare(m.slug)} aria-label={`Compare ${m.displayName}`} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>

      {compare.length ? (
        <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
          <div className="panel flex w-full max-w-xl items-center gap-3 rounded-xl px-4 py-3 shadow-2xl">
            <span className="text-sm text-fg">
              {compare.length} selected <span className="text-fg-subtle">· up to 3</span>
            </span>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setCompare([])}>
                Clear
              </Button>
              <Button size="sm" onClick={() => setCompareOpen(true)} disabled={compare.length < 2}>
                Compare
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Compare models</DialogTitle>
            <DialogDescription>Side-by-side capabilities, context and price from the live catalog.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {[
                  { k: "Model", v: (m: PublicModel) => <span className="font-medium text-fg">{m.displayName}</span> },
                  { k: "Provider", v: (m: PublicModel) => <span>{vendorName(m.vendor)}</span> },
                  { k: "Availability", v: (m: PublicModel) => <AvailabilityBadge availability={m.availability} devOnly={m.isDevOnly} /> },
                  { k: "Context", v: (m: PublicModel) => formatContext(m.contextLength) ?? "—" },
                  { k: "Price", v: (m: PublicModel) => <PriceLine pricing={m.pricing} /> },
                  { k: "Input", v: (m: PublicModel) => m.modalitiesIn.join(", ") },
                  { k: "Output", v: (m: PublicModel) => m.modalitiesOut.join(", ") },
                  ...["tools", "structured_output", "json_mode", "vision", "reasoning", "coding"].map((cap) => ({
                    k: cap.replace("_", " "),
                    v: (m: PublicModel) => (m.capabilities.includes(cap) ? <Check className="size-4 text-accent" /> : <X className="size-4 text-fg-subtle" />),
                  })),
                  { k: "License", v: (m: PublicModel) => m.license ?? "Not yet verified" },
                ].map((row) => (
                  <tr key={row.k} className="border-b border-border">
                    <th className="w-36 py-2.5 pr-4 text-left text-xs font-medium capitalize text-fg-subtle">{row.k}</th>
                    {comparing.map((m) => (
                      <td key={m.slug} className="py-2.5 pr-4 align-middle text-fg-muted">
                        {row.v(m)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Filters</DialogTitle>
          </DialogHeader>
          {filtersPanel}
          <Badge variant="neutral" className="mt-4 w-fit">
            {filtered.length} results
          </Badge>
        </DialogContent>
      </Dialog>
    </div>
  );
}
