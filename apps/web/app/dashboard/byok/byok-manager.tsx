"use client";

import { CheckCircle2, KeyRound, Plug, Plus, RefreshCw, ShieldCheck, Trash2, XCircle } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog, useAction } from "@/components/dashboard/client-kit";
import { EmptyState } from "@/components/dashboard/ui";
import { VendorMark } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatRelative } from "@/lib/format";
import { addByokAction, deleteByokAction, rotateByokAction, testByokAction, toggleByokAction } from "../actions";

interface Cred {
  id: string;
  label: string;
  hint: string;
  enabled: boolean;
  provider: string;
  providerSlug: string;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  createdAt: string;
}

export function ByokManager({ enabled, canWrite, preferByok, providers, creds }: { enabled: boolean; canWrite: boolean; preferByok: boolean; providers: Array<{ id: string; name: string; slug: string; termsUrl: string | null }>; creds: Cred[] }) {
  const { pending, run } = useAction();
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ providerId: providers[0]?.id ?? "", label: "", apiKey: "" });
  const [rotating, setRotating] = React.useState<Cred | null>(null);
  const [newKey, setNewKey] = React.useState("");
  const [deleting, setDeleting] = React.useState<Cred | null>(null);
  const [testing, setTesting] = React.useState<string | null>(null);

  if (!enabled) {
    return <EmptyState icon={Plug} title="BYOK isn't enabled for this organization" description="Bring-your-own-key is rolling out gradually. Contact support to request access." action={<Button asChild size="sm" variant="secondary"><Link href="/dashboard/support">Contact support</Link></Button>} />;
  }

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, title: "Encrypted at rest", body: "Envelope-encrypted with per-org context; decrypted only inside the gateway at request time." },
          { icon: KeyRound, title: "Never exposed", body: "Only the last characters are shown. Keys are never returned by the API or dashboard." },
          { icon: Plug, title: preferByok ? "Preferred in routing" : "Used as fallback", body: preferByok ? "Your keys are tried before platform credit. Change this in Settings → Routing." : "Platform credit is tried first. Change this in Settings → Routing." },
        ].map((c) => (
          <div key={c.title} className="panel rounded-xl p-4">
            <c.icon className="size-4 text-accent" />
            <div className="mt-2 text-sm font-medium text-fg">{c.title}</div>
            <p className="mt-1 text-[12.5px] text-fg-muted">{c.body}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold text-fg">Connected keys</h2>
        {canWrite ? (
          <Button size="sm" onClick={() => setAdding(true)} disabled={!providers.length}>
            <Plus /> Add key
          </Button>
        ) : null}
      </div>

      {creds.length === 0 ? (
        <EmptyState icon={KeyRound} title="No provider keys yet" description="Add an API key from a supported provider to route requests through your own account." />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {creds.map((c) => (
            <li key={c.id} className="panel rounded-xl p-4">
              <div className="flex items-start gap-3">
                <VendorMark vendor={c.providerSlug} className="size-9" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium text-fg">{c.label}</span>
                    {!c.enabled ? <Badge>Disabled</Badge> : null}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-fg-subtle">
                    {c.provider} · <span className="font-mono">{c.hint}</span>
                  </div>
                </div>
                {canWrite ? <Switch aria-label={`${c.enabled ? "Disable" : "Enable"} ${c.label}`} checked={c.enabled} disabled={pending} onCheckedChange={(v) => run(() => toggleByokAction(c.id, v), { success: v ? "Key enabled" : "Key disabled" })} /> : null}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                {c.lastTestedAt ? (
                  c.lastTestOk ? (
                    <span className="inline-flex items-center gap-1 text-success">
                      <CheckCircle2 className="size-3.5" /> Verified {formatRelative(c.lastTestedAt)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-danger" title={c.lastTestError ?? undefined}>
                      <XCircle className="size-3.5" /> {c.lastTestError ?? "Test failed"}
                    </span>
                  )
                ) : (
                  <span className="text-fg-subtle">Not tested yet</span>
                )}
              </div>
              {canWrite ? (
                <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={testing === c.id}
                    onClick={async () => {
                      setTesting(c.id);
                      const r = await testByokAction(c.id);
                      setTesting(null);
                      if (!r.ok) toast.error(r.error);
                      else if (r.data.ok) toast.success(`Key works · ${r.data.latencyMs}ms`);
                      else toast.error(r.data.error ?? "Test failed");
                    }}
                  >
                    <CheckCircle2 /> {testing === c.id ? "Testing…" : "Test"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRotating(c)}>
                    <RefreshCw /> Replace
                  </Button>
                  <Button size="sm" variant="ghost" className="ml-auto text-fg-subtle" onClick={() => setDeleting(c)}>
                    <Trash2 /> Delete
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a provider key</DialogTitle>
            <DialogDescription>Usage through this key is billed by the provider under your account and their terms.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => addByokAction(form), { success: "Key added — run a test to verify it" });
              if (ok !== undefined) {
                setAdding(false);
                setForm({ providerId: providers[0]?.id ?? "", label: "", apiKey: "" });
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="byok-provider">Provider</Label>
              <NativeSelect id="byok-provider" value={form.providerId} onChange={(e) => setForm({ ...form, providerId: e.target.value })}>
                {providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </NativeSelect>
              {providers.find((p) => p.id === form.providerId)?.termsUrl ? (
                <FieldHint>
                  <a href={providers.find((p) => p.id === form.providerId)!.termsUrl!} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                    Provider terms
                  </a>
                </FieldHint>
              ) : null}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="byok-label">Label</Label>
              <Input id="byok-label" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="e.g. Production account" maxLength={64} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="byok-key">API key</Label>
              <Input id="byok-key" type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })} required minLength={8} maxLength={512} spellCheck={false} />
              <FieldHint>Use a key scoped to inference only where your provider supports it.</FieldHint>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Add key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(rotating)}
        onOpenChange={(o) => {
          if (!o) {
            setRotating(null);
            setNewKey("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace key</DialogTitle>
            <DialogDescription>The old key is overwritten immediately.</DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-4"
            autoComplete="off"
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await run(() => rotateByokAction(rotating!.id, newKey), { success: "Key replaced" });
              if (ok !== undefined) {
                setRotating(null);
                setNewKey("");
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="byok-new">New API key</Label>
              <Input id="byok-new" type="password" value={newKey} onChange={(e) => setNewKey(e.target.value)} required minLength={8} spellCheck={false} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Replace key
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.label}”?`}
        description="The encrypted key is destroyed. Requests that relied on it will route to platform credit if available, or fail."
        confirmLabel="Delete key"
        pending={pending}
        onConfirm={async () => {
          await run(() => deleteByokAction(deleting!.id), { success: "Key deleted" });
          setDeleting(null);
        }}
      />
    </div>
  );
}
