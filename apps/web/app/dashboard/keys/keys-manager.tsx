"use client";

import { KeyRound, MoreHorizontal, Pencil, Plus, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { API_KEY_PERMISSIONS, type ApiKeyPermission } from "@inrent/core/rbac";
import { ConfirmDialog, PlainCode, SecretDialog, useAction } from "@/components/dashboard/client-kit";
import { EmptyState } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatRelative } from "@/lib/format";
import { createApiKeyAction, deleteApiKeyAction, revokeApiKeyAction, rotateApiKeyAction, updateApiKeyAction, type KeyFormInput } from "../actions";
import { navigate } from "@/lib/navigate";

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  lastFour: string;
  environment: "DEVELOPMENT" | "STAGING" | "PRODUCTION";
  projectId: string;
  projectName: string;
  permissions: string[];
  allowedModels: string[];
  spendLimitUsd: string;
  rpmLimit: number | null;
  tpmLimit: number | null;
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

const PERMISSION_LABELS: Record<ApiKeyPermission, string> = {
  inference: "Inference — call models",
  "keys:read": "Keys: read",
  "keys:write": "Keys: create & revoke",
  "usage:read": "Usage: read",
  "logs:read": "Logs: read",
};

const ENV_VARIANT = { PRODUCTION: "accent", STAGING: "iris", DEVELOPMENT: "neutral" } as const;

function status(k: KeyRow) {
  if (k.revokedAt) return <Badge variant="danger">Revoked</Badge>;
  if (k.expiresAt && new Date(k.expiresAt) < new Date()) return <Badge variant="amber">Expired</Badge>;
  return <Badge variant="success">Active</Badge>;
}

function KeyForm({ initial, projects, mode, pending, onSubmit }: { initial: KeyFormInput; projects: Array<{ id: string; name: string }>; mode: "create" | "edit"; pending: boolean; onSubmit: (v: KeyFormInput) => void }) {
  const [v, setV] = React.useState(initial);
  const set = <K extends keyof KeyFormInput>(k: K, val: KeyFormInput[K]) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(v);
      }}
      className="grid gap-4"
    >
      <div className="grid gap-1.5">
        <Label htmlFor="key-name">Name</Label>
        <Input id="key-name" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. production-backend" required maxLength={64} autoFocus />
      </div>
      {mode === "create" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="key-project">Project</Label>
            <NativeSelect id="key-project" value={v.projectId} onChange={(e) => set("projectId", e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="key-env">Environment</Label>
            <NativeSelect id="key-env" value={v.environment} onChange={(e) => set("environment", e.target.value as KeyFormInput["environment"])}>
              <option value="DEVELOPMENT">Development</option>
              <option value="STAGING">Staging</option>
              <option value="PRODUCTION">Production</option>
            </NativeSelect>
          </div>
        </div>
      ) : null}
      {mode === "create" ? (
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13px] font-medium text-fg">Permissions</legend>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {API_KEY_PERMISSIONS.map((p) => (
              <label key={p} className="flex items-center gap-2 text-[13px] text-fg-muted">
                <input
                  type="checkbox"
                  className="size-3.5 accent-accent"
                  checked={v.permissions.includes(p)}
                  onChange={(e) => set("permissions", e.target.checked ? [...v.permissions, p] : v.permissions.filter((x) => x !== p))}
                />
                {PERMISSION_LABELS[p]}
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="key-models">Allowed models</Label>
        <Input id="key-models" value={v.allowedModels} onChange={(e) => set("allowedModels", e.target.value)} placeholder="Any model (leave empty) — or e.g. openai/gpt-4.1-mini, anthropic/*" />
        <FieldHint>Comma-separated slugs. Leave empty to allow every model the project allows.</FieldHint>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="key-limit">Spend limit (USD)</Label>
          <Input id="key-limit" inputMode="decimal" pattern="^\d+(\.\d{1,6})?$" value={v.spendLimitUsd} onChange={(e) => set("spendLimitUsd", e.target.value)} placeholder="No limit" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="key-rpm">Requests / min</Label>
          <Input id="key-rpm" type="number" min={1} max={100000} value={v.rpmLimit} onChange={(e) => set("rpmLimit", e.target.value)} placeholder="Plan default" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="key-tpm">Tokens / min</Label>
          <Input id="key-tpm" type="number" min={1} max={100000000} value={v.tpmLimit} onChange={(e) => set("tpmLimit", e.target.value)} placeholder="Plan default" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="key-exp">Expires</Label>
        <Input id="key-exp" type="date" value={v.expiresAt} onChange={(e) => set("expiresAt", e.target.value)} />
        <FieldHint>Optional. Expired keys are rejected with 401 expired_api_key.</FieldHint>
      </div>
      <DialogFooter>
        <Button type="submit" disabled={pending || !v.name.trim() || (mode === "create" && v.permissions.length === 0)}>
          {mode === "create" ? "Create key" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export function KeysManager({ rows, projects, activeProjectId, canWrite, openCreate, apiBase }: { rows: KeyRow[]; projects: Array<{ id: string; name: string }>; activeProjectId: string; canWrite: boolean; openCreate: boolean; apiBase: string }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [creating, setCreating] = React.useState(openCreate && canWrite);
  const [editing, setEditing] = React.useState<KeyRow | null>(null);
  const [secret, setSecret] = React.useState<{ value: string; name: string } | null>(null);
  const [confirm, setConfirm] = React.useState<{ kind: "revoke" | "rotate" | "delete"; key: KeyRow } | null>(null);
  const [showRevoked, setShowRevoked] = React.useState(false);

  React.useEffect(() => {
    if (openCreate) navigate(router, "/dashboard/keys", { replace: true });
  }, [openCreate, router]);

  const visible = rows.filter((r) => showRevoked || !r.revokedAt);
  const revokedCount = rows.filter((r) => r.revokedAt).length;
  const blank: KeyFormInput = { name: "", projectId: activeProjectId, environment: "DEVELOPMENT", permissions: ["inference"], allowedModels: "", spendLimitUsd: "", rpmLimit: "", tpmLimit: "", expiresAt: "" };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-fg-muted">
          {rows.length - revokedCount} active key{rows.length - revokedCount === 1 ? "" : "s"}
          {revokedCount ? (
            <button type="button" onClick={() => setShowRevoked((s) => !s)} className="ml-3 text-[13px] text-fg-subtle underline-offset-4 hover:text-fg-muted hover:underline">
              {showRevoked ? "Hide" : "Show"} {revokedCount} revoked
            </button>
          ) : null}
        </div>
        {canWrite ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Create key
          </Button>
        ) : null}
      </div>

      {visible.length === 0 ? (
        <EmptyState icon={KeyRound} title="No API keys yet" description="Create a key to authenticate requests from your app, SDK or CLI." action={canWrite ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> Create key</Button> : null} />
      ) : (
        <div className="panel overflow-hidden rounded-xl">
          {/* Desktop table */}
          <div className="hidden md:block">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Key</TH>
                  <TH>Project</TH>
                  <TH>Environment</TH>
                  <TH>Limits</TH>
                  <TH>Last used</TH>
                  <TH>Status</TH>
                  <TH className="w-10">
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {visible.map((k) => (
                  <TR key={k.id} className={k.revokedAt ? "opacity-55" : undefined}>
                    <TD className="font-medium text-fg">{k.name}</TD>
                    <TD className="font-mono text-[12.5px]">
                      {k.prefix}…{k.lastFour}
                    </TD>
                    <TD>{k.projectName}</TD>
                    <TD>
                      <Badge variant={ENV_VARIANT[k.environment]}>{k.environment.toLowerCase()}</Badge>
                    </TD>
                    <TD className="text-[12.5px]">
                      {[k.spendLimitUsd ? `$${k.spendLimitUsd}` : null, k.rpmLimit ? `${k.rpmLimit} rpm` : null, k.allowedModels.length ? `${k.allowedModels.length} models` : null].filter(Boolean).join(" · ") || <span className="text-fg-subtle">Defaults</span>}
                    </TD>
                    <TD className="whitespace-nowrap text-[12.5px]">{k.lastUsedAt ? formatRelative(k.lastUsedAt) : <span className="text-fg-subtle">Never</span>}</TD>
                    <TD>{status(k)}</TD>
                    <TD>{canWrite ? <RowMenu k={k} onEdit={() => setEditing(k)} onConfirm={(kind) => setConfirm({ kind, key: k })} /> : null}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
          {/* Mobile cards */}
          <ul className="divide-y divide-border md:hidden">
            {visible.map((k) => (
              <li key={k.id} className={k.revokedAt ? "p-4 opacity-55" : "p-4"}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium text-fg">{k.name}</div>
                    <div className="mt-0.5 font-mono text-[12px] text-fg-muted">
                      {k.prefix}…{k.lastFour}
                    </div>
                  </div>
                  {canWrite ? <RowMenu k={k} onEdit={() => setEditing(k)} onConfirm={(kind) => setConfirm({ kind, key: k })} /> : null}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[12px] text-fg-subtle">
                  {status(k)}
                  <Badge variant={ENV_VARIANT[k.environment]}>{k.environment.toLowerCase()}</Badge>
                  <span>{k.projectName}</span>
                  <span>· {k.lastUsedAt ? `used ${formatRelative(k.lastUsedAt)}` : "never used"}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Create API key</DialogTitle>
            <DialogDescription>Give the key only the permissions and models it needs. You can revoke it at any time.</DialogDescription>
          </DialogHeader>
          <KeyForm
            initial={blank}
            projects={projects}
            mode="create"
            pending={pending}
            onSubmit={async (v) => {
              const data = await run(() => createApiKeyAction(v));
              if (data) {
                setCreating(false);
                setSecret({ value: data.secret, name: data.name });
              }
            }}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit key</DialogTitle>
            <DialogDescription>Limits apply immediately. Permissions and environment are fixed — rotate or create a new key to change them.</DialogDescription>
          </DialogHeader>
          {editing ? (
            <KeyForm
              key={editing.id}
              initial={{ ...blank, name: editing.name, allowedModels: editing.allowedModels.join(", "), spendLimitUsd: editing.spendLimitUsd, rpmLimit: editing.rpmLimit ? String(editing.rpmLimit) : "", tpmLimit: editing.tpmLimit ? String(editing.tpmLimit) : "", expiresAt: editing.expiresAt?.slice(0, 10) ?? "" }}
              projects={projects}
              mode="edit"
              pending={pending}
              onSubmit={async (v) => {
                const ok = await run(() => updateApiKeyAction(editing.id, v), { success: "Key updated" });
                if (ok !== undefined) setEditing(null);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <SecretDialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)} title={`“${secret?.name ?? ""}” is ready`} description="Store this key in a secret manager or environment variable." secret={secret?.value ?? null}>
        {secret ? (
          <div className="mt-4">
            <PlainCode code={`export INRENT_API_KEY="${secret.value}"\ncurl ${apiBase}/key -H "Authorization: Bearer $INRENT_API_KEY"`} />
          </div>
        ) : null}
      </SecretDialog>

      <ConfirmDialog
        open={confirm?.kind === "revoke"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Revoke “${confirm?.key.name}”?`}
        description="Requests using this key will fail with 401 immediately. This cannot be undone."
        confirmLabel="Revoke key"
        pending={pending}
        onConfirm={async () => {
          await run(() => revokeApiKeyAction(confirm!.key.id), { success: "Key revoked" });
          setConfirm(null);
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "rotate"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Rotate “${confirm?.key.name}”?`}
        description="A new secret with the same settings is issued and the current secret stops working immediately. Update your deployments right away."
        confirmLabel="Rotate key"
        pending={pending}
        onConfirm={async () => {
          const data = await run(() => rotateApiKeyAction(confirm!.key.id));
          setConfirm(null);
          if (data) setSecret({ value: data.secret, name: data.name });
        }}
      />
      <ConfirmDialog
        open={confirm?.kind === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Delete “${confirm?.key.name}”?`}
        description="The key is revoked and removed from this list. Historical usage and logs are kept."
        confirmLabel="Delete key"
        phrase={confirm?.key.name}
        pending={pending}
        onConfirm={async () => {
          await run(() => deleteApiKeyAction(confirm!.key.id), { success: "Key deleted" });
          setConfirm(null);
        }}
      />
    </>
  );
}

function RowMenu({ k, onEdit, onConfirm }: { k: KeyRow; onEdit: () => void; onConfirm: (kind: "revoke" | "rotate" | "delete") => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex size-8 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Actions for ${k.name}`}>
        <MoreHorizontal className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!k.revokedAt ? (
          <>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil /> Edit limits
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onConfirm("rotate")}>
              <RefreshCw /> Rotate secret
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onConfirm("revoke")}>
              <ShieldOff /> Revoke
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem onSelect={() => onConfirm("delete")} className="text-danger data-[highlighted]:text-danger">
          <Trash2 /> Delete
        </DropdownMenuItem>
        <div className="px-2 pb-1 pt-1.5 text-[11px] text-fg-subtle">Created {formatDate(k.createdAt)}</div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
