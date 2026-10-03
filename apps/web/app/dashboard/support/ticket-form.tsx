"use client";

import * as React from "react";
import { useAction } from "@/components/dashboard/client-kit";
import { Button } from "@/components/ui/button";
import { FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { createTicketAction } from "../actions";

export function TicketForm({ defaultSubject, defaultBody }: { defaultSubject: string; defaultBody: string }) {
  const [v, setV] = React.useState({ subject: defaultSubject, body: defaultBody, category: "technical" });
  const { pending, run } = useAction();
  return (
    <form
      className="grid gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run(() => createTicketAction(v), { success: "Ticket submitted — we'll reply by email" });
        if (r) setV({ subject: "", body: "", category: "technical" });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="grid gap-1.5">
          <Label htmlFor="t-subject">Subject</Label>
          <Input id="t-subject" value={v.subject} onChange={(e) => setV({ ...v, subject: e.target.value })} required minLength={3} maxLength={160} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="t-cat">Category</Label>
          <NativeSelect id="t-cat" value={v.category} onChange={(e) => setV({ ...v, category: e.target.value })} className="sm:w-40">
            <option value="technical">Technical</option>
            <option value="billing">Billing</option>
            <option value="security">Security</option>
            <option value="abuse">Abuse report</option>
            <option value="sales">Sales</option>
            <option value="general">Other</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="t-body">Details</Label>
        <Textarea id="t-body" value={v.body} onChange={(e) => setV({ ...v, body: e.target.value })} required minLength={10} maxLength={10000} className="min-h-40" />
        <FieldHint>Never paste API keys or other secrets — we will never ask for them.</FieldHint>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          Submit ticket
        </Button>
      </div>
    </form>
  );
}
