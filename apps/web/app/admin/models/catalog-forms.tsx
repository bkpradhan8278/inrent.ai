"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { addEndpointAction, createModelAction } from "../actions";

export interface ProviderOption {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
}

// Mirrors MODEL_CAPABILITIES in @inrent/services (kept literal: this file ships to the browser).
const CAPABILITIES = ["chat", "streaming", "tools", "vision", "reasoning", "coding", "json_mode", "structured_output", "embedding"] as const;
type Capability = (typeof CAPABILITIES)[number];

const optionalInt = (s: string) => (s.trim() === "" ? null : Number(s));

export function NewModelForm() {
  const [open, setOpen] = React.useState(false);
  const blank = { slug: "", displayName: "", vendor: "", description: "", contextLength: "", maxOutputTokens: "", openWeights: false, capabilities: ["chat", "streaming"] as Capability[] };
  const [v, setV] = React.useState(blank);
  const { pending, run } = useAction();
  if (!open) {
    return (
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Add model
        </Button>
      </div>
    );
  }
  const toggle = (c: Capability) => setV({ ...v, capabilities: v.capabilities.includes(c) ? v.capabilities.filter((x) => x !== c) : [...v.capabilities, c] });
  return (
    <form
      className="panel grid gap-4 rounded-xl p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const created = await run(
          () =>
            createModelAction({
              slug: v.slug,
              displayName: v.displayName,
              vendor: v.vendor,
              description: v.description,
              capabilities: v.capabilities,
              contextLength: optionalInt(v.contextLength),
              maxOutputTokens: optionalInt(v.maxOutputTokens),
              openWeights: v.openWeights,
            }),
          { success: "Model added. Next: add a provider endpoint, publish a price, then verify." },
        );
        if (created) {
          setV(blank);
          setOpen(false);
        }
      }}
    >
      <div>
        <h2 className="text-sm font-medium text-fg">Add model</h2>
        <FieldHint>New models start as preview and need review, so nothing is served until you verify the license, map a provider and publish a price.</FieldHint>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nm-slug">Slug</Label>
          <Input id="nm-slug" value={v.slug} onChange={(e) => setV({ ...v, slug: e.target.value })} placeholder="google/gemma-4-e4b-it" required pattern="[a-z0-9][a-z0-9._\-]*/[a-z0-9][a-z0-9._:\-]*" className="font-mono" />
          <FieldHint>What customers send as &quot;model&quot;: vendor/name, lowercase.</FieldHint>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nm-name">Display name</Label>
          <Input id="nm-name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} placeholder="Gemma 4 E4B" required minLength={2} maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nm-vendor">Vendor</Label>
          <Input id="nm-vendor" value={v.vendor} onChange={(e) => setV({ ...v, vendor: e.target.value })} placeholder="google, openai, anthropic, zhipu, qwen" required className="font-mono" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2 xl:col-span-3">
          <Label htmlFor="nm-desc">Description</Label>
          <Input id="nm-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} placeholder="One line shown in the catalog" maxLength={500} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nm-ctx">Context length (tokens)</Label>
          <Input id="nm-ctx" type="number" min={1} value={v.contextLength} onChange={(e) => setV({ ...v, contextLength: e.target.value })} placeholder="128000" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nm-max">Max output tokens</Label>
          <Input id="nm-max" type="number" min={1} value={v.maxOutputTokens} onChange={(e) => setV({ ...v, maxOutputTokens: e.target.value })} placeholder="8192" />
        </div>
        <label className="flex items-center justify-between gap-3 self-end rounded-lg border border-border bg-surface px-3 py-2 text-[13px] text-fg">
          Open weights
          <Switch checked={v.openWeights} onCheckedChange={(c) => setV({ ...v, openWeights: c })} />
        </label>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-medium text-fg">Capabilities</legend>
        <div className="flex flex-wrap gap-2">
          {CAPABILITIES.map((c) => (
            <label key={c} className="flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[12.5px] text-fg">
              <input type="checkbox" checked={v.capabilities.includes(c)} onChange={() => toggle(c)} className="accent-[var(--color-accent)]" />
              {c.replace(/_/g, " ")}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !v.capabilities.length}>
          Create model
        </Button>
      </div>
    </form>
  );
}

export function NewEndpointForm({ modelId, providers }: { modelId: string; providers: ProviderOption[] }) {
  const [open, setOpen] = React.useState(false);
  const blank = { providerId: providers[0]?.id ?? "", providerModelId: "", contextLength: "", maxOutputTokens: "", priority: "100", supportsTools: false, supportsVision: false };
  const [v, setV] = React.useState(blank);
  const { pending, run } = useAction();
  if (!open) {
    return (
      <div className="px-5 py-3">
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          <Plus className="size-4" aria-hidden /> Add provider endpoint
        </Button>
      </div>
    );
  }
  return (
    <form
      className="mx-5 my-3 grid gap-3 rounded-lg border border-border bg-surface p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const created = await run(
          () =>
            addEndpointAction(modelId, {
              providerId: v.providerId,
              providerModelId: v.providerModelId,
              contextLength: optionalInt(v.contextLength),
              maxOutputTokens: optionalInt(v.maxOutputTokens),
              priority: Number(v.priority),
              supportsTools: v.supportsTools,
              supportsVision: v.supportsVision,
            }),
          { success: "Endpoint added (disabled). Publish a price, then switch it on." },
        );
        if (created) {
          setV(blank);
          setOpen(false);
        }
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="grid gap-1 lg:col-span-2">
          <Label htmlFor={`ep-prov-${modelId}`} className="text-[12px]">
            Provider
          </Label>
          <NativeSelect id={`ep-prov-${modelId}`} value={v.providerId} onChange={(e) => setV({ ...v, providerId: e.target.value })} required>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.slug}){p.enabled ? "" : " — off"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1 lg:col-span-3">
          <Label htmlFor={`ep-id-${modelId}`} className="text-[12px]">
            Provider model ID
          </Label>
          <Input id={`ep-id-${modelId}`} value={v.providerModelId} onChange={(e) => setV({ ...v, providerModelId: e.target.value })} placeholder="gpt-5, claude-sonnet-5-5, glm-5, qwen3-32b, gemma4:e4b-it-qat" required pattern="\S+" className="h-9 font-mono text-[12.5px]" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`ep-ctx-${modelId}`} className="text-[12px]">
            Context (optional)
          </Label>
          <Input id={`ep-ctx-${modelId}`} type="number" min={1} value={v.contextLength} onChange={(e) => setV({ ...v, contextLength: e.target.value })} className="h-8" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`ep-max-${modelId}`} className="text-[12px]">
            Max output (optional)
          </Label>
          <Input id={`ep-max-${modelId}`} type="number" min={1} value={v.maxOutputTokens} onChange={(e) => setV({ ...v, maxOutputTokens: e.target.value })} className="h-8" />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`ep-pri-${modelId}`} className="text-[12px]">
            Priority (lower first)
          </Label>
          <Input id={`ep-pri-${modelId}`} type="number" min={0} max={10000} value={v.priority} onChange={(e) => setV({ ...v, priority: e.target.value })} className="h-8" required />
        </div>
        <label className="flex items-center justify-between gap-3 self-end rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-[12.5px] text-fg">
          Tools
          <Switch checked={v.supportsTools} onCheckedChange={(c) => setV({ ...v, supportsTools: c })} />
        </label>
        <label className="flex items-center justify-between gap-3 self-end rounded-lg border border-border bg-bg-elevated px-3 py-1.5 text-[12.5px] text-fg">
          Vision
          <Switch checked={v.supportsVision} onCheckedChange={(c) => setV({ ...v, supportsVision: c })} />
        </label>
      </div>
      <FieldHint>The ID is exactly what the provider expects in its API (for Ollama, the model tag). The endpoint starts disabled.</FieldHint>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={pending || !v.providerId}>
          Add endpoint
        </Button>
      </div>
    </form>
  );
}
