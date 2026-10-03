"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import { useActionState } from "react";
import { contactAction, joinWaitlistAction, type FormState } from "@/app/(marketing)/actions";
import { Button } from "@/components/ui/button";
import { Input, Label, NativeSelect, Textarea } from "@/components/ui/input";

const initial: FormState = { ok: false, message: "" };

function Honeypot() {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Company website
        <input name="company_website" tabIndex={-1} autoComplete="off" />
      </label>
    </div>
  );
}

function Result({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p role="status" className={state.ok ? "flex items-center gap-2 text-sm text-accent" : "text-sm text-danger"}>
      {state.ok ? <CheckCircle2 className="size-4" /> : null}
      {state.message}
    </p>
  );
}

export function WaitlistForm() {
  const [state, action, pending] = useActionState(joinWaitlistAction, initial);
  if (state.ok) return <Result state={state} />;
  return (
    <form action={action} className="relative grid gap-4">
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="wl-email">Work email</Label>
          <Input id="wl-email" name="email" type="email" required autoComplete="email" placeholder="you@company.com" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wl-company">Company (optional)</Label>
          <Input id="wl-company" name="company" autoComplete="organization" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wl-gpu">GPU you need</Label>
          <NativeSelect id="wl-gpu" name="gpuType" defaultValue="">
            <option value="">Not sure yet</option>
            {["RTX 4090", "RTX 5090", "L40S", "A100", "H100", "H200", "B200", "B300", "Other"].map((g) => (
              <option key={g}>{g}</option>
            ))}
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="wl-hours">Expected GPU hours / month</Label>
          <Input id="wl-hours" name="expectedHours" type="number" min={0} step={1} placeholder="e.g. 200" />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="wl-usecase">What will you run?</Label>
        <Textarea id="wl-usecase" name="useCase" placeholder="Fine-tuning, batch inference, serving an open-weight model…" />
      </div>
      <Result state={state} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        Join GPU Cloud waitlist
      </Button>
      <p className="text-xs text-fg-subtle">We only use this to contact you about GPU Cloud. See our privacy policy.</p>
    </form>
  );
}

export function ContactForm({ defaultCategory = "general", defaultEmail = "" }: { defaultCategory?: string; defaultEmail?: string }) {
  const [state, action, pending] = useActionState(contactAction, initial);
  if (state.ok) return <Result state={state} />;
  return (
    <form action={action} className="relative grid gap-4">
      <Honeypot />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="ct-email">Email</Label>
          <Input id="ct-email" name="email" type="email" required autoComplete="email" defaultValue={defaultEmail} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ct-category">Topic</Label>
          <NativeSelect id="ct-category" name="category" defaultValue={defaultCategory}>
            <option value="general">General</option>
            <option value="technical">Technical support</option>
            <option value="billing">Billing</option>
            <option value="sales">Sales / Enterprise</option>
            <option value="security">Security</option>
            <option value="abuse">Report abuse</option>
          </NativeSelect>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ct-subject">Subject</Label>
        <Input id="ct-subject" name="subject" required minLength={3} maxLength={160} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ct-body">Message</Label>
        <Textarea id="ct-body" name="body" required minLength={10} className="min-h-32" placeholder="Include request IDs (req_…) for API issues." />
      </div>
      <Result state={state} />
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? <Loader2 className="animate-spin" /> : null}
        Send message
      </Button>
    </form>
  );
}
