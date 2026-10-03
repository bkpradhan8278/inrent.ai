"use client";

import { Archive, FolderKanban, Pencil, Plus } from "lucide-react";
import * as React from "react";
import { ConfirmDialog, useAction } from "@/components/dashboard/client-kit";
import { EmptyState } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label, Textarea } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { archiveProjectAction, createProjectAction, switchProjectAction, updateProjectAction } from "../actions";

export interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  isDefault: boolean;
  budgetUsd: string;
  allowedModels: string[];
  keys: number;
  monthSpendUsd: string;
  createdAt: string;
}

interface FormValue {
  name: string;
  description: string;
  budgetUsd: string;
  allowedModels: string;
}

function ProjectForm({ initial, showModels, pending, submitLabel, onSubmit }: { initial: FormValue; showModels: boolean; pending: boolean; submitLabel: string; onSubmit: (v: FormValue) => void }) {
  const [v, setV] = React.useState(initial);
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
    >
      <div className="grid gap-1.5">
        <Label htmlFor="p-name">Name</Label>
        <Input id="p-name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required minLength={2} maxLength={64} autoFocus />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-desc">Description</Label>
        <Textarea id="p-desc" value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} maxLength={280} className="min-h-16" />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="p-budget">Monthly budget (USD)</Label>
        <Input id="p-budget" inputMode="decimal" pattern="^\d+(\.\d{1,6})?$" value={v.budgetUsd} onChange={(e) => setV({ ...v, budgetUsd: e.target.value })} placeholder="No budget" />
        <FieldHint>Requests are rejected with 402 project_budget_exceeded once the project spends this much in a calendar month (UTC).</FieldHint>
      </div>
      {showModels ? (
        <div className="grid gap-1.5">
          <Label htmlFor="p-models">Allowed models</Label>
          <Input id="p-models" value={v.allowedModels} onChange={(e) => setV({ ...v, allowedModels: e.target.value })} placeholder="All models" />
          <FieldHint>Comma-separated slugs or vendor wildcards like anthropic/*. Empty allows all.</FieldHint>
        </div>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={pending}>
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ProjectsManager({ rows, canManage, activeProjectId }: { rows: ProjectRow[]; canManage: boolean; activeProjectId: string }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<ProjectRow | null>(null);
  const [archiving, setArchiving] = React.useState<ProjectRow | null>(null);

  return (
    <>
      {canManage ? (
        <div className="mb-4 flex justify-end">
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> New project
          </Button>
        </div>
      ) : null}
      {rows.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((p) => {
            const budget = Number(p.budgetUsd);
            const used = Number(p.monthSpendUsd);
            const share = budget > 0 ? Math.min(used / budget, 1) : 0;
            return (
              <article key={p.id} className="panel flex flex-col rounded-xl p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-[15px] font-semibold text-fg">{p.name}</h2>
                    <div className="mt-0.5 font-mono text-[11.5px] text-fg-subtle">{p.slug}</div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {p.isDefault ? <Badge variant="outline">Default</Badge> : null}
                    {p.id === activeProjectId ? <Badge variant="accent">Active</Badge> : null}
                  </div>
                </div>
                <p className="mt-3 line-clamp-2 min-h-10 text-[13px] text-fg-muted">{p.description || "No description."}</p>
                <dl className="mt-4 grid grid-cols-3 gap-3 text-[12px]">
                  <div>
                    <dt className="text-fg-subtle">Keys</dt>
                    <dd className="mt-0.5 font-mono text-fg">{p.keys}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">This month</dt>
                    <dd className="mt-0.5 font-mono text-fg">${p.monthSpendUsd}</dd>
                  </div>
                  <div>
                    <dt className="text-fg-subtle">Models</dt>
                    <dd className="mt-0.5 text-fg">{p.allowedModels.length ? p.allowedModels.length : "All"}</dd>
                  </div>
                </dl>
                {budget > 0 ? (
                  <div className="mt-4">
                    <div className="flex justify-between text-[11.5px] text-fg-subtle">
                      <span>Budget</span>
                      <span>
                        ${p.monthSpendUsd} / ${p.budgetUsd}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className={share > 0.9 ? "h-full bg-danger" : share > 0.75 ? "h-full bg-amber" : "h-full bg-accent"} style={{ width: `${Math.max(share * 100, 1)}%` }} />
                    </div>
                  </div>
                ) : null}
                <div className="mt-5 flex items-center gap-2 border-t border-border pt-4">
                  {p.id !== activeProjectId ? (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => switchProjectAction(p.id), { success: `Switched to ${p.name}` })}>
                      Switch to
                    </Button>
                  ) : null}
                  {canManage ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(p)}>
                        <Pencil /> Edit
                      </Button>
                      {!p.isDefault ? (
                        <Button size="sm" variant="ghost" className="ml-auto text-fg-subtle" onClick={() => setArchiving(p)}>
                          <Archive /> Archive
                        </Button>
                      ) : null}
                    </>
                  ) : null}
                </div>
                <div className="mt-2 text-[11px] text-fg-subtle">Created {formatDate(p.createdAt)}</div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New project</DialogTitle>
            <DialogDescription>Use projects to separate apps, teams or environments.</DialogDescription>
          </DialogHeader>
          <ProjectForm
            initial={{ name: "", description: "", budgetUsd: "", allowedModels: "" }}
            showModels={false}
            pending={pending}
            submitLabel="Create project"
            onSubmit={async (v) => {
              const ok = await run(() => createProjectAction(v), { success: "Project created" });
              if (ok !== undefined) setCreating(false);
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit project</DialogTitle>
          </DialogHeader>
          {editing ? (
            <ProjectForm
              key={editing.id}
              initial={{ name: editing.name, description: editing.description, budgetUsd: editing.budgetUsd, allowedModels: editing.allowedModels.join(", ") }}
              showModels
              pending={pending}
              submitLabel="Save"
              onSubmit={async (v) => {
                const ok = await run(() => updateProjectAction(editing.id, v), { success: "Project updated" });
                if (ok !== undefined) setEditing(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(archiving)}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={`Archive “${archiving?.name}”?`}
        description="All of the project's API keys are revoked. Usage history is retained."
        confirmLabel="Archive project"
        phrase={archiving?.slug}
        pending={pending}
        onConfirm={async () => {
          await run(() => archiveProjectAction(archiving!.id), { success: "Project archived" });
          setArchiving(null);
        }}
      />
    </>
  );
}
