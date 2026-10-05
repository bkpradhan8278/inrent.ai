"use client";

import { Archive, Bot, GitCommitVertical, Plus } from "lucide-react";
import * as React from "react";
import { ConfirmDialog, useAction } from "@/components/dashboard/client-kit";
import { EmptyState } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { formatRelative } from "@/lib/format";
import { archiveAgentAction, createAgentAction, createAgentVersionAction } from "../actions";

interface Version {
  version: number;
  modelSlug: string;
  systemPrompt: string;
  temperature: number;
  maxSteps: number;
  budgetUsd: string;
  mcpServerIds: string[];
}
interface AgentRow {
  id: string;
  name: string;
  description: string;
  status: string;
  updatedAt: string;
  version: Version | null;
}
interface FormV {
  name: string;
  description: string;
  modelSlug: string;
  systemPrompt: string;
  temperature: number;
  maxSteps: number;
  budgetUsd: string;
  mcpServerIds: string[];
}

function AgentForm({ initial, models, servers, isNew, pending, onSubmit }: { initial: FormV; models: Array<{ slug: string; name: string }>; servers: Array<{ id: string; name: string }>; isNew: boolean; pending: boolean; onSubmit: (v: FormV) => void }) {
  const [v, setV] = React.useState(initial);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      {isNew ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ag-name">Name</Label>
            <Input id="ag-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={64} autoFocus />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ag-desc">Description</Label>
            <Input id="ag-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={500} />
          </div>
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="ag-model">Model</Label>
        <NativeSelect id="ag-model" value={v.modelSlug} onChange={(e) => setV({ ...v, modelSlug: e.target.value })} required>
          <option value="">Choose a model…</option>
          {models.map((m) => (
            <option key={m.slug} value={m.slug}>
              {m.name} ({m.slug})
            </option>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ag-prompt">Instructions</Label>
        <Textarea id="ag-prompt" value={v.systemPrompt} onChange={(e) => setV({ ...v, systemPrompt: e.target.value })} required maxLength={32000} className="min-h-32 font-mono text-[12.5px]" placeholder="You are a support agent for…" />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ag-temp">Temperature</Label>
          <Input id="ag-temp" type="number" min={0} max={2} step={0.1} value={v.temperature} onChange={(e) => setV({ ...v, temperature: Number(e.target.value) })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ag-steps">Max steps</Label>
          <Input id="ag-steps" type="number" min={1} max={50} value={v.maxSteps} onChange={(e) => setV({ ...v, maxSteps: Number(e.target.value) })} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ag-budget">Budget per run (USD)</Label>
          <Input id="ag-budget" inputMode="decimal" pattern="^\d+(\.\d{1,6})?$" value={v.budgetUsd} onChange={(e) => setV({ ...v, budgetUsd: e.target.value })} placeholder="No limit" />
        </div>
      </div>
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-[13px] font-medium text-fg">MCP servers</legend>
        {servers.length ? (
          <div className="flex flex-wrap gap-3">
            {servers.map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-[13px] text-fg-muted">
                <input type="checkbox" className="size-3.5 accent-accent" checked={v.mcpServerIds.includes(s.id)} onChange={(e) => setV({ ...v, mcpServerIds: e.target.checked ? [...v.mcpServerIds, s.id] : v.mcpServerIds.filter((x) => x !== s.id) })} />
                {s.name}
              </label>
            ))}
          </div>
        ) : (
          <FieldHint>No enabled MCP servers. Register one under MCP to give agents tools.</FieldHint>
        )}
        <FieldHint>Agents can only call tools you&apos;ve approved on each server.</FieldHint>
      </fieldset>
      <DialogFooter>
        <Button type="submit" disabled={pending || !v.modelSlug}>
          {isNew ? "Create agent" : "Publish new version"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function AgentsManager({ canWrite, models, servers, agents }: { canWrite: boolean; models: Array<{ slug: string; name: string }>; servers: Array<{ id: string; name: string }>; agents: AgentRow[] }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<AgentRow | null>(null);
  const [archiving, setArchiving] = React.useState<AgentRow | null>(null);
  const blank: FormV = { name: "", description: "", modelSlug: models[0]?.slug ?? "", systemPrompt: "", temperature: 0.7, maxSteps: 8, budgetUsd: "1.00", mcpServerIds: [] };

  return (
    <>
      {canWrite ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New agent
          </Button>
        </div>
      ) : null}
      {agents.length === 0 ? (
        <EmptyState icon={Bot} title="No agents yet" description="Create an agent definition: pick a model, write instructions, attach approved MCP tools and set a budget." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <li key={a.id} className="panel flex flex-col rounded-xl p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-fg">{a.name}</div>
                  {a.description ? <p className="mt-0.5 line-clamp-2 text-[12.5px] text-fg-muted">{a.description}</p> : null}
                </div>
                <Badge variant={a.status === "ACTIVE" ? "accent" : "neutral"}>{a.status.toLowerCase()}</Badge>
              </div>
              {a.version ? (
                <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
                  <dt className="text-fg-subtle">Version</dt>
                  <dd className="flex items-center gap-1 text-fg">
                    <GitCommitVertical className="size-3.5 text-fg-subtle" /> v{a.version.version}
                  </dd>
                  <dt className="text-fg-subtle">Model</dt>
                  <dd className="truncate font-mono text-fg">{a.version.modelSlug}</dd>
                  <dt className="text-fg-subtle">Budget / run</dt>
                  <dd className="font-mono text-fg">{a.version.budgetUsd ? `$${a.version.budgetUsd}` : "none"}</dd>
                  <dt className="text-fg-subtle">Tools</dt>
                  <dd className="text-fg">{a.version.mcpServerIds.length} MCP server(s)</dd>
                </dl>
              ) : null}
              <div className="mt-4 flex items-center gap-1 border-t border-border pt-3">
                {canWrite && a.version ? (
                  <Button size="sm" variant="ghost" onClick={() => setEditing(a)}>
                    New version
                  </Button>
                ) : null}
                <Button size="sm" variant="ghost" disabled title="The hosted runtime is coming soon">
                  Run (soon)
                </Button>
                <span className="ml-auto text-[11.5px] text-fg-subtle">{formatRelative(a.updatedAt)}</span>
                {canWrite ? (
                  <Button size="icon-sm" variant="ghost" aria-label={`Archive ${a.name}`} onClick={() => setArchiving(a)}>
                    <Archive />
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New agent</DialogTitle>
            <DialogDescription>Version 1 is created now. Every later edit creates a new immutable version.</DialogDescription>
          </DialogHeader>
          <AgentForm
            initial={blank}
            models={models}
            servers={servers}
            isNew
            pending={pending}
            onSubmit={async (v) => {
              const ok = await run(() => createAgentAction(v), { success: "Agent created" });
              if (ok !== undefined) setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New version of {editing?.name}</DialogTitle>
          </DialogHeader>
          {editing?.version ? (
            <AgentForm
              key={editing.id}
              initial={{ ...blank, name: editing.name, ...editing.version }}
              models={models}
              servers={servers}
              isNew={false}
              pending={pending}
              onSubmit={async (v) => {
                const ok = await run(() => createAgentVersionAction(editing.id, v), { success: "Version published" });
                if (ok !== undefined) setEditing(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive ${archiving?.name}?`}
        description="The agent and its version history are hidden from this list."
        confirmLabel="Archive"
        pending={pending}
        onConfirm={async () => {
          await run(() => archiveAgentAction(archiving!.id), { success: "Agent archived" });
          setArchiving(null);
        }}
      />
    </>
  );
}
