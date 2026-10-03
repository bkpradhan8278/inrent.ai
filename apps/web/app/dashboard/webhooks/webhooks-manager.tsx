"use client";

import { ChevronDown, Plus, RefreshCw, Send, Trash2, Webhook } from "lucide-react";
import * as React from "react";
import { ConfirmDialog, SecretDialog, useAction } from "@/components/dashboard/client-kit";
import { EmptyState, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatMs, formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createWebhookAction, deleteWebhookAction, rotateWebhookSecretAction, testWebhookAction, updateWebhookAction } from "../actions";

interface Hook {
  id: string;
  url: string;
  description: string;
  events: string[];
  enabled: boolean;
  secretHint: string;
  failureCount: number;
  disabledReason: string | null;
  createdAt: string;
}

interface Delivery {
  id: string;
  webhookId: string;
  eventType: string;
  status: string;
  attempts: number;
  responseStatus: number | null;
  durationMs: number | null;
  lastError: string | null;
  createdAt: string;
}

export function WebhooksManager({ canWrite, events, hooks, deliveries }: { canWrite: boolean; events: Array<{ type: string; description: string }>; hooks: Hook[]; deliveries: Delivery[] }) {
  const { pending, run } = useAction();
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState({ url: "", description: "", events: ["request.failed", "credit.low", "payment.success"] as string[] });
  const [secret, setSecret] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<Hook | null>(null);
  const [rotating, setRotating] = React.useState<Hook | null>(null);
  const [open, setOpen] = React.useState<string | null>(null);

  return (
    <>
      <div className="mb-4 flex justify-end">
        {canWrite ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> Add endpoint
          </Button>
        ) : null}
      </div>
      {hooks.length === 0 ? (
        <EmptyState icon={Webhook} title="No webhook endpoints" description="Add an HTTPS endpoint to get notified about failed requests, low balance, payments and provider incidents." />
      ) : (
        <ul className="grid gap-3">
          {hooks.map((h) => {
            const recent = deliveries.filter((d) => d.webhookId === h.id);
            const isOpen = open === h.id;
            return (
              <li key={h.id} className="panel overflow-hidden rounded-xl">
                <div className="flex flex-wrap items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 truncate font-mono text-[13px] text-fg">{h.url}</span>
                      {!h.enabled ? <Badge variant={h.disabledReason ? "danger" : "neutral"}>{h.disabledReason ? "Auto-disabled" : "Disabled"}</Badge> : null}
                      {h.failureCount > 0 && h.enabled ? <Badge variant="amber">{h.failureCount} recent failures</Badge> : null}
                    </div>
                    {h.description ? <p className="mt-1 text-[12.5px] text-fg-muted">{h.description}</p> : null}
                    <div className="mt-2 flex flex-wrap gap-1">
                      {h.events.map((e) => (
                        <Badge key={e} variant="outline" className="font-mono">
                          {e}
                        </Badge>
                      ))}
                    </div>
                    {h.disabledReason ? <p className="mt-2 text-[12px] text-danger">{h.disabledReason}</p> : null}
                  </div>
                  {canWrite ? <Switch aria-label={h.enabled ? "Disable endpoint" : "Enable endpoint"} checked={h.enabled} disabled={pending} onCheckedChange={(v) => run(() => updateWebhookAction(h.id, { enabled: v }), { success: v ? "Endpoint enabled" : "Endpoint disabled" })} /> : null}
                </div>
                <div className="flex flex-wrap items-center gap-1 border-t border-border px-2 py-1.5">
                  <Button size="sm" variant="ghost" onClick={() => setOpen(isOpen ? null : h.id)} aria-expanded={isOpen}>
                    <ChevronDown className={cn("transition-transform", isOpen && "rotate-180")} /> Deliveries ({recent.length})
                  </Button>
                  {canWrite ? (
                    <>
                      <Button size="sm" variant="ghost" disabled={pending || !h.enabled} onClick={() => run(() => testWebhookAction(h.id), { success: "Test event queued" })}>
                        <Send /> Send test
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setRotating(h)}>
                        <RefreshCw /> Rotate secret
                      </Button>
                      <Button size="sm" variant="ghost" className="ml-auto text-fg-subtle" onClick={() => setDeleting(h)}>
                        <Trash2 /> Delete
                      </Button>
                    </>
                  ) : null}
                  <span className="px-2 font-mono text-[11px] text-fg-subtle">secret {h.secretHint}</span>
                </div>
                {isOpen ? (
                  <div className="border-t border-border bg-bg-elevated">
                    {recent.length ? (
                      <ul className="divide-y divide-border">
                        {recent.slice(0, 20).map((d) => (
                          <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[12.5px]">
                            <StatusPill status={d.status} />
                            <span className="font-mono text-fg">{d.eventType}</span>
                            <span className="text-fg-subtle">{d.responseStatus ? `HTTP ${d.responseStatus}` : "no response"}</span>
                            <span className="text-fg-subtle">{formatMs(d.durationMs)}</span>
                            <span className="text-fg-subtle">attempt {d.attempts}</span>
                            {d.lastError ? <span className="max-w-full truncate text-danger">{d.lastError}</span> : null}
                            <span className="ml-auto text-fg-subtle">{formatRelative(d.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-4 py-4 text-[13px] text-fg-subtle">No deliveries yet. Send a test event to check your endpoint.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Add webhook endpoint</DialogTitle>
            <DialogDescription>Public HTTPS URLs only. Private and internal network addresses are rejected.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = await run(() => createWebhookAction(form));
              if (data) {
                setCreating(false);
                setSecret(data.secret);
                setForm({ url: "", description: "", events: ["request.failed", "credit.low", "payment.success"] });
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input id="wh-url" type="url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://example.com/webhooks/inrent" required autoFocus />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wh-desc">Description</Label>
              <Input id="wh-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={200} placeholder="Optional" />
            </div>
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-[13px] font-medium text-fg">Events</legend>
              <div className="grid gap-1.5">
                {events.map((ev) => (
                  <label key={ev.type} className="flex items-start gap-2 text-[13px]">
                    <input type="checkbox" className="mt-0.5 size-3.5 accent-[#5cebc0]" checked={form.events.includes(ev.type)} onChange={(e) => setForm({ ...form, events: e.target.checked ? [...form.events, ev.type] : form.events.filter((x) => x !== ev.type) })} />
                    <span>
                      <span className="font-mono text-fg">{ev.type}</span> <span className="text-fg-subtle">— {ev.description}</span>
                    </span>
                  </label>
                ))}
              </div>
              <FieldHint>request.completed fires on every successful request — use it only if you need per-request callbacks.</FieldHint>
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={pending || form.events.length === 0}>
                Add endpoint
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <SecretDialog open={Boolean(secret)} onOpenChange={(o) => !o && setSecret(null)} title="Signing secret" description="Use this secret to verify the Inrent-Signature header on each delivery." secret={secret} />

      <ConfirmDialog
        open={Boolean(rotating)}
        onOpenChange={(o) => !o && setRotating(null)}
        title="Rotate signing secret?"
        description="Deliveries are signed with the new secret immediately. Update your endpoint's verification secret right away."
        confirmLabel="Rotate"
        pending={pending}
        onConfirm={async () => {
          const data = await run(() => rotateWebhookSecretAction(rotating!.id));
          setRotating(null);
          if (data) setSecret(data.secret);
        }}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this endpoint?"
        description={<span className="break-all">{deleting?.url}</span>}
        confirmLabel="Delete endpoint"
        pending={pending}
        onConfirm={async () => {
          await run(() => deleteWebhookAction(deleting!.id), { success: "Endpoint deleted" });
          setDeleting(null);
        }}
      />
    </>
  );
}
