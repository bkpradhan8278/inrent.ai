"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { ConfirmDialog, useAction } from "@/components/dashboard/client-kit";
import { Section } from "@/components/dashboard/ui";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, NativeSelect } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { signOut } from "@/lib/auth-client";
import { deleteAccountAction, updateOrgSettingsAction, updateProfileAction } from "../actions";

type Policy = "BALANCED" | "LOWEST_COST" | "LOWEST_LATENCY" | "BEST_QUALITY";

interface OrgSettings {
  name: string;
  promptLogging: boolean;
  responseLogging: boolean;
  logRetentionDays: number;
  zeroRetention: boolean;
  routingPolicy: Policy;
  preferByok: boolean;
}

const POLICIES: Array<{ value: Policy; label: string; hint: string }> = [
  { value: "BALANCED", label: "Balanced", hint: "Weighs price, latency, health and quality." },
  { value: "LOWEST_COST", label: "Lowest cost", hint: "Cheapest healthy provider first." },
  { value: "LOWEST_LATENCY", label: "Lowest latency", hint: "Fastest recent p50 first." },
  { value: "BEST_QUALITY", label: "Best quality", hint: "Highest quality tier first." },
];

function Row({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        {hint ? <p className="mt-0.5 max-w-xl text-[12.5px] text-fg-muted">{hint}</p> : null}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function OrgSettingsForm({ initial, canWrite, maxRetention }: { initial: OrgSettings; canWrite: boolean; maxRetention: number }) {
  const [v, setV] = React.useState(initial);
  const { pending, run } = useAction();
  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void run(() => updateOrgSettingsAction(v), { success: "Settings saved" });
      }}
      className="grid gap-6"
    >
      <fieldset disabled={!canWrite} className="grid gap-6">
        <Section title="Organization">
          <div className="grid max-w-md gap-1.5">
            <Label htmlFor="org-name-s">Name</Label>
            <Input id="org-name-s" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} maxLength={64} required />
          </div>
        </Section>

        <Section title="Privacy & retention" description="Controls what INRENT stores about your requests. Metadata (model, tokens, cost, latency) is always kept for billing." contentClassName="divide-y divide-border py-0">
          <Row label="Zero data retention" hint="Never store prompts or responses, regardless of the settings below. Some providers may still apply their own retention — see each provider's policy.">
            <Switch checked={v.zeroRetention} onCheckedChange={(c) => setV({ ...v, zeroRetention: c, promptLogging: c ? false : v.promptLogging, responseLogging: c ? false : v.responseLogging })} aria-label="Zero data retention" />
          </Row>
          <Row label="Log prompts" hint="Store request messages so you can inspect them in Logs. Off by default.">
            <Switch checked={v.promptLogging} disabled={v.zeroRetention} onCheckedChange={(c) => setV({ ...v, promptLogging: c })} aria-label="Log prompts" />
          </Row>
          <Row label="Log responses" hint="Store model outputs alongside prompts.">
            <Switch checked={v.responseLogging} disabled={v.zeroRetention} onCheckedChange={(c) => setV({ ...v, responseLogging: c })} aria-label="Log responses" />
          </Row>
          <Row label="Log retention" hint={`Request logs are deleted after this many days (max ${maxRetention} on your plan).`}>
            <div className="flex items-center gap-2">
              <Input type="number" min={0} max={maxRetention} value={v.logRetentionDays} onChange={(e) => setV({ ...v, logRetentionDays: Number(e.target.value) })} className="w-24" aria-label="Retention days" />
              <span className="text-sm text-fg-muted">days</span>
            </div>
          </Row>
        </Section>

        <Section title="Routing" description="Defaults for requests that don't set an explicit inrent.routing policy." contentClassName="divide-y divide-border py-0">
          <Row label="Routing policy" hint={POLICIES.find((p) => p.value === v.routingPolicy)?.hint}>
            <NativeSelect value={v.routingPolicy} onChange={(e) => setV({ ...v, routingPolicy: e.target.value as Policy })} className="w-48" aria-label="Routing policy">
              {POLICIES.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </NativeSelect>
          </Row>
          <Row label="Prefer my provider keys (BYOK)" hint="Try your own provider keys before platform credit when both can serve a model.">
            <Switch checked={v.preferByok} onCheckedChange={(c) => setV({ ...v, preferByok: c })} aria-label="Prefer BYOK" />
          </Row>
        </Section>
      </fieldset>
      {canWrite ? (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button type="submit" disabled={pending || !dirty} className="shadow-2xl">
            Save settings
          </Button>
        </div>
      ) : (
        <p className="text-[13px] text-fg-subtle">Only owners and admins can change organization settings.</p>
      )}
    </form>
  );
}

export function AccountForms({ name: initialName, email }: { name: string; email: string }) {
  const [name, setName] = React.useState(initialName);
  const [deleting, setDeleting] = React.useState(false);
  const { pending, run } = useAction();
  const router = useRouter();
  return (
    <>
      <Section title="Your profile">
        <form
          className="flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(() => updateProfileAction(name), { success: "Profile updated" });
          }}
        >
          <div className="grid flex-1 gap-1.5">
            <Label htmlFor="profile-name">Name</Label>
            <Input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
            <FieldHint>Signed in as {email}</FieldHint>
          </div>
          <Button type="submit" variant="secondary" disabled={pending || name === initialName} className="sm:mb-5">
            Save
          </Button>
        </form>
      </Section>

      <Section title="Your data" description="Download your organization's data. Exports are recorded in the audit log.">
        <div className="flex flex-wrap gap-2">
          {[
            ["usage", "Daily usage"],
            ["requests", "Request log"],
            ["billing", "Credit ledger"],
            ["invoices", "Invoices"],
          ].map(([kind, label]) => (
            <Button key={kind} asChild variant="secondary" size="sm">
              <a href={`/api/export?kind=${kind}&format=csv`} download>
                <Download /> {label} (CSV)
              </a>
            </Button>
          ))}
        </div>
      </Section>

      <Section title="Delete account" className="border-[rgb(255_107_107/0.25)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xl text-[13px] text-fg-muted">
            Permanently deletes your user account. Organizations where you are the only member are closed: keys are revoked and stored secrets destroyed. Financial records are retained as required by law. You must transfer ownership of shared organizations first.
          </p>
          <Button variant="danger" size="sm" onClick={() => setDeleting(true)}>
            Delete account
          </Button>
        </div>
      </Section>

      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete your account?"
        description="This cannot be undone. Remaining credits in closed organizations are not refunded automatically — contact support first if you want a refund."
        confirmLabel="Delete my account"
        phrase={email}
        pending={pending}
        onConfirm={async () => {
          const r = await deleteAccountAction(email);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          await signOut().catch(() => undefined);
          router.push("/?deleted=1");
          router.refresh();
        }}
      />
    </>
  );
}
