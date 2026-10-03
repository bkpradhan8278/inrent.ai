"use client";

import { AlertTriangle, FolderOpen, Plus, ShieldCheck, Trash2, Wrench } from "lucide-react";
import * as React from "react";
import { BrandLogo } from "@/components/brand/icons";
import { ConfirmDialog, useAction } from "@/components/dashboard/client-kit";
import { EmptyState } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { approveMcpToolAction, createMcpServerAction, deleteMcpServerAction, registerMcpToolAction, toggleMcpServerAction } from "../actions";

type Level = "READ" | "WRITE" | "ADMIN";
type Kind = "GITHUB" | "SLACK" | "NOTION" | "GOOGLE_DRIVE" | "POSTGRES" | "FILESYSTEM" | "CUSTOM";
type Transport = "STDIO" | "SSE" | "STREAMABLE_HTTP";

interface Tool {
  id: string;
  name: string;
  description: string | null;
  permission: Level;
  destructive: boolean;
  enabled: boolean;
  approvedAt: string | null;
}
interface Server {
  id: string;
  name: string;
  kind: Kind;
  transport: Transport;
  url: string | null;
  maxPermission: Level;
  enabled: boolean;
  createdAt: string;
  tools: Tool[];
}

const LEVEL_VARIANT = { READ: "neutral", WRITE: "amber", ADMIN: "danger" } as const;

const KIND_BRAND: Record<Kind, { brand?: string; tint: string }> = {
  GITHUB: { brand: "github", tint: "236 238 243" },
  SLACK: { brand: "slack", tint: "224 30 90" },
  NOTION: { brand: "notion", tint: "236 238 243" },
  GOOGLE_DRIVE: { brand: "google-drive", tint: "66 133 244" },
  POSTGRES: { brand: "postgres", tint: "51 103 145" },
  FILESYSTEM: { tint: "169 151 255" },
  CUSTOM: { brand: "mcp", tint: "142 150 255" },
};

function ServerKindMark({ kind, className }: { kind: Kind; className?: string }) {
  const k = KIND_BRAND[kind];
  return (
    <span
      className={`ico inline-flex size-10 shrink-0 items-center justify-center rounded-[11px] border ${className ?? ""}`}
      style={{ borderColor: `rgb(${k.tint} / .3)`, background: `radial-gradient(circle at 30% 20%, rgb(${k.tint} / .22), #0c0f15 72%)` }}
      aria-hidden
    >
      {k.brand ? <BrandLogo brand={k.brand} size={20} /> : <FolderOpen className="size-5 text-[#c4b8ff]" strokeWidth={1.8} />}
    </span>
  );
}

export function McpManager({ canWrite, isAdmin, templates, servers }: { canWrite: boolean; isAdmin: boolean; templates: Array<{ kind: Kind; name: string; description: string; transport: Transport; defaultPermission: Level }>; servers: Server[] }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = React.useState<(typeof templates)[number] | null>(null);
  const [form, setForm] = React.useState({ name: "", url: "", authToken: "", maxPermission: "READ" as Level });
  const [toolFor, setToolFor] = React.useState<Server | null>(null);
  const [tool, setTool] = React.useState({ name: "", description: "", permission: "READ" as Level, destructive: false });
  const [deleting, setDeleting] = React.useState<Server | null>(null);
  const [approving, setApproving] = React.useState<Tool | null>(null);

  return (
    <div className="grid gap-6">
      {canWrite ? (
        <section>
          <h2 className="mb-3 text-[15px] font-semibold text-fg">Add a server</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {templates.map((t) => (
              <button
                key={t.kind}
                type="button"
                onClick={() => {
                  setCreating(t);
                  setForm({ name: t.name, url: "", authToken: "", maxPermission: t.defaultPermission });
                }}
                className="lift group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/[.08] bg-[linear-gradient(180deg,#10141b,#0b0d12)] p-4 text-left"
              >
                <div className="flex items-center justify-between">
                  <ServerKindMark kind={t.kind} />
                  <span className="inline-flex size-7 items-center justify-center rounded-lg border border-white/[.08] text-fg-subtle transition-colors group-hover:border-[rgb(92_235_192/.4)] group-hover:text-accent">
                    <Plus className="size-4" />
                  </span>
                </div>
                <div>
                  <span className="text-sm font-medium text-fg">{t.name}</span>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-fg-muted">{t.description}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-[15px] font-semibold text-fg">Registered servers</h2>
        {servers.length === 0 ? (
          <EmptyState icon={Wrench} title="No MCP servers yet" description="Register a server, then add and approve the tools agents may use." />
        ) : (
          <ul className="grid gap-4">
            {servers.map((s) => (
              <li key={s.id} className="panel rounded-xl">
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <ServerKindMark kind={s.kind} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-fg">{s.name}</span>
                      <Badge variant="outline">{s.kind.toLowerCase().replace("_", " ")}</Badge>
                      <Badge variant="outline">{s.transport.toLowerCase().replace("_", " ")}</Badge>
                      <Badge variant={LEVEL_VARIANT[s.maxPermission]}>max {s.maxPermission.toLowerCase()}</Badge>
                    </div>
                    {s.url ? <div className="mt-1 truncate font-mono text-[12px] text-fg-subtle">{s.url}</div> : null}
                  </div>
                  {canWrite ? <Switch aria-label={`${s.enabled ? "Disable" : "Enable"} ${s.name}`} checked={s.enabled} disabled={pending} onCheckedChange={(v) => run(() => toggleMcpServerAction(s.id, v))} /> : null}
                </div>
                <div className="border-t border-border">
                  {s.tools.length ? (
                    <ul className="divide-y divide-border">
                      {s.tools.map((t) => (
                        <li key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                          <span className="font-mono text-[12.5px] text-fg">{t.name}</span>
                          <Badge variant={LEVEL_VARIANT[t.permission]}>{t.permission.toLowerCase()}</Badge>
                          {t.destructive ? (
                            <Badge variant="danger">
                              <AlertTriangle /> destructive
                            </Badge>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate text-[12.5px] text-fg-subtle">{t.description}</span>
                          {canWrite ? (
                            <Switch
                              aria-label={`${t.enabled ? "Revoke" : "Approve"} ${t.name}`}
                              checked={t.enabled}
                              disabled={pending || (!isAdmin && !t.enabled && (t.permission !== "READ" || t.destructive))}
                              onCheckedChange={(v) => (v && (t.permission !== "READ" || t.destructive) ? setApproving(t) : run(() => approveMcpToolAction(t.id, v), { success: v ? "Tool approved" : "Tool disabled" }))}
                            />
                          ) : (
                            <Badge>{t.enabled ? "approved" : "off"}</Badge>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-[13px] text-fg-subtle">No tools registered.</p>
                  )}
                </div>
                {canWrite ? (
                  <div className="flex gap-1 border-t border-border px-2 py-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setToolFor(s);
                        setTool({ name: "", description: "", permission: "READ", destructive: false });
                      }}
                    >
                      <Plus /> Add tool
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto text-fg-subtle" onClick={() => setDeleting(s)}>
                      <Trash2 /> Remove server
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Dialog open={Boolean(creating)} onOpenChange={(o) => !o && setCreating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add {creating?.name}</DialogTitle>
            <DialogDescription>Server URLs must be public HTTPS endpoints. Auth tokens are encrypted and never shown again.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => createMcpServerAction({ ...form, kind: creating!.kind, transport: creating!.transport }), { success: "Server registered" });
              if (ok !== undefined) setCreating(null);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-name">Name</Label>
              <Input id="mcp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={64} />
            </div>
            {creating?.transport !== "STDIO" ? (
              <div className="grid gap-1.5">
                <Label htmlFor="mcp-url">Server URL</Label>
                <Input id="mcp-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://mcp.example.com/mcp" required />
              </div>
            ) : (
              <p className="rounded-md border border-border bg-surface p-3 text-[12.5px] text-fg-muted">STDIO servers run on infrastructure you operate and connect through the INRENT CLI connector (coming soon).</p>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-token">Auth token</Label>
              <Input id="mcp-token" type="password" value={form.authToken} onChange={(e) => setForm({ ...form, authToken: e.target.value })} placeholder="Optional" spellCheck={false} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="mcp-max">Maximum tool permission</Label>
              <NativeSelect id="mcp-max" value={form.maxPermission} onChange={(e) => setForm({ ...form, maxPermission: e.target.value as Level })}>
                <option value="READ">Read only (recommended)</option>
                <option value="WRITE" disabled={!isAdmin}>
                  Read & write{!isAdmin ? " — admins only" : ""}
                </option>
                <option value="ADMIN" disabled={!isAdmin}>
                  Admin{!isAdmin ? " — admins only" : ""}
                </option>
              </NativeSelect>
              <FieldHint>No tool on this server can exceed this level.</FieldHint>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Register server
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(toolFor)} onOpenChange={(o) => !o && setToolFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add tool to {toolFor?.name}</DialogTitle>
            <DialogDescription>Tools are registered disabled and must be approved before use.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => registerMcpToolAction(toolFor!.id, tool), { success: "Tool registered (disabled)" });
              if (ok !== undefined) setToolFor(null);
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="tool-name">Tool name</Label>
              <Input id="tool-name" value={tool.name} onChange={(e) => setTool({ ...tool, name: e.target.value })} pattern="^[a-zA-Z0-9_.\-]{1,64}$" placeholder="search_issues" required className="font-mono" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tool-desc">Description</Label>
              <Input id="tool-desc" value={tool.description} onChange={(e) => setTool({ ...tool, description: e.target.value })} maxLength={500} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="tool-perm">Permission</Label>
              <NativeSelect id="tool-perm" value={tool.permission} onChange={(e) => setTool({ ...tool, permission: e.target.value as Level, destructive: e.target.value !== "READ" || tool.destructive })}>
                <option value="READ">Read</option>
                <option value="WRITE">Write</option>
                <option value="ADMIN">Admin</option>
              </NativeSelect>
            </div>
            <label className="flex items-center gap-2 text-[13px] text-fg-muted">
              <input type="checkbox" className="size-3.5 accent-[#5cebc0]" checked={tool.destructive} disabled={tool.permission !== "READ"} onChange={(e) => setTool({ ...tool, destructive: e.target.checked })} />
              Destructive (deletes or modifies data) — always requires explicit approval
            </label>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Add tool
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(approving)}
        onOpenChange={(o) => !o && setApproving(null)}
        title={`Approve “${approving?.name}”?`}
        description={
          <span className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-amber" />
            This tool can {approving?.destructive ? "modify or delete data" : "write data"} in the connected system. Approval is recorded in the audit log and can be revoked at any time.
          </span>
        }
        confirmLabel="Approve tool"
        phrase={approving?.name}
        pending={pending}
        onConfirm={async () => {
          await run(() => approveMcpToolAction(approving!.id, true), { success: "Tool approved" });
          setApproving(null);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Remove ${deleting?.name}?`}
        description="The server and its tools are removed and its stored credentials destroyed. Agents using it lose access."
        confirmLabel="Remove server"
        pending={pending}
        onConfirm={async () => {
          await run(() => deleteMcpServerAction(deleting!.id), { success: "Server removed" });
          setDeleting(null);
        }}
      />
    </div>
  );
}
