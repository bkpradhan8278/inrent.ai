"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { createIncidentAction, updateIncidentAction } from "../actions";

const COMPONENTS = ["api", "gateway", "models", "billing", "dashboard", "docs"];
type Impact = "NONE" | "MINOR" | "MAJOR" | "CRITICAL";
type Status = "INVESTIGATING" | "IDENTIFIED" | "MONITORING" | "RESOLVED";

export function IncidentForm() {
  const [open, setOpen] = React.useState(false);
  const [v, setV] = React.useState({ title: "", body: "", impact: "MINOR" as Impact, components: ["api"] as string[] });
  const { pending, run } = useAction();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Plus /> Declare incident
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Declare an incident</DialogTitle>
          <DialogDescription>Appears on the public status page immediately. Write for customers: what is affected and what they should do.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            const ok = await run(() => createIncidentAction(v), { success: "Incident published" });
            if (ok !== undefined) {
              setOpen(false);
              setV({ title: "", body: "", impact: "MINOR", components: ["api"] });
            }
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="inc-title">Title</Label>
            <Input id="inc-title" value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} required minLength={4} maxLength={160} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inc-body">Details</Label>
            <Textarea id="inc-body" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} required minLength={4} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="inc-impact">Impact</Label>
            <NativeSelect id="inc-impact" value={v.impact} onChange={(e) => setV({ ...v, impact: e.target.value as Impact })}>
              <option value="NONE">None (informational)</option>
              <option value="MINOR">Minor — degraded performance</option>
              <option value="MAJOR">Major — partial outage</option>
              <option value="CRITICAL">Critical — full outage</option>
            </NativeSelect>
          </div>
          <fieldset className="flex flex-wrap gap-3">
            <legend className="mb-1.5 text-[13px] font-medium text-fg">Affected components</legend>
            {COMPONENTS.map((c) => (
              <label key={c} className="flex items-center gap-1.5 text-[13px] text-fg-muted">
                <input type="checkbox" className="size-3.5 accent-[#5cebc0]" checked={v.components.includes(c)} onChange={(e) => setV({ ...v, components: e.target.checked ? [...v.components, c] : v.components.filter((x) => x !== c) })} />
                {c}
              </label>
            ))}
          </fieldset>
          <DialogFooter>
            <Button type="submit" disabled={pending || !v.components.length}>
              Publish
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function IncidentUpdate({ id, status }: { id: string; status: Status }) {
  const [v, setV] = React.useState({ status, body: "" });
  const { pending, run } = useAction();
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row"
      onSubmit={async (e) => {
        e.preventDefault();
        const ok = await run(() => updateIncidentAction(id, v), { success: "Incident updated" });
        if (ok !== undefined) setV({ ...v, body: "" });
      }}
    >
      <NativeSelect aria-label="Incident status" value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as Status })} className="sm:w-44">
        <option value="INVESTIGATING">Investigating</option>
        <option value="IDENTIFIED">Identified</option>
        <option value="MONITORING">Monitoring</option>
        <option value="RESOLVED">Resolved</option>
      </NativeSelect>
      <Input aria-label="Update message" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} placeholder="Update for customers (optional)" />
      <Button type="submit" size="md" variant="secondary" disabled={pending}>
        Post update
      </Button>
    </form>
  );
}
