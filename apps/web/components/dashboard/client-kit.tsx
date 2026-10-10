"use client";

import { AlertTriangle, Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import { useResetOnChange } from "@/lib/hooks";

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

/**
 * Runs a server action inside a transition, toasts the outcome and refreshes server data.
 * Returns the action's data on success, or undefined on failure.
 */
export function useAction() {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const run = React.useCallback(
    <T,>(fn: () => Promise<Result<T>>, opts: { success?: string; refresh?: boolean } = {}) =>
      new Promise<T | undefined>((resolve) => {
        start(async () => {
          const r = await fn();
          if (!r.ok) {
            toast.error(r.error);
            resolve(undefined);
            return;
          }
          if (opts.success) toast.success(opts.success);
          if (opts.refresh !== false) router.refresh();
          resolve(r.data);
        });
      }),
    [router],
  );
  return { pending, run };
}

/** Displays a secret exactly once with copy + reveal controls. */
export function SecretReveal({ secret, label = "Secret", hashedOnly = true }: { secret: string; label?: string; hashedOnly?: boolean }) {
  const [visible, setVisible] = React.useState(false);
  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-2 rounded-md border border-accent/35 bg-accent-soft px-3 py-2">
        <code aria-label={label} className="min-w-0 flex-1 truncate font-mono text-[13px] text-fg">
          {visible ? secret : `${secret.slice(0, 14)}${"•".repeat(24)}`}
        </code>
        <button type="button" onClick={() => setVisible((v) => !v)} aria-label={visible ? "Hide secret" : "Show secret"} className="inline-flex size-7 items-center justify-center rounded-md text-fg-subtle hover:bg-surface-2 hover:text-fg">
          {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
        </button>
        <CopyButton value={secret} label={`Copy ${label.toLowerCase()}`} />
      </div>
      <p className="flex items-start gap-1.5 text-xs text-amber">
        <AlertTriangle className="mt-px size-3.5 shrink-0" />
        Copy it now — it won&apos;t be shown again.{hashedOnly ? " INRENT stores only a hash." : null}
      </p>
    </div>
  );
}

export function SecretDialog({ open, onOpenChange, title, description, secret, hashedOnly, children }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; secret: string | null; hashedOnly?: boolean; children?: React.ReactNode }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {secret ? <SecretReveal secret={secret} hashedOnly={hashedOnly} /> : null}
        {children}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>I&apos;ve saved it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Confirmation for destructive actions; optional typed confirmation phrase. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  phrase,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  phrase?: string;
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [typed, setTyped] = React.useState("");
  useResetOnChange(open, () => setTyped(""));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div>{description}</div>
          </DialogDescription>
        </DialogHeader>
        {phrase ? (
          <div className="grid gap-1.5">
            <Label htmlFor="confirm-phrase">
              Type <code className="font-mono text-danger">{phrase}</code> to confirm
            </Label>
            <Input id="confirm-phrase" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="danger" disabled={pending || (phrase ? typed !== phrase : false)} onClick={() => void onConfirm()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Unhighlighted code block for client-rendered snippets that include runtime values (e.g. a fresh key). */
export function PlainCode({ code, className }: { code: string; className?: string }) {
  return (
    <div data-theme="dark" className={`relative overflow-hidden rounded-lg border border-border bg-bg-elevated ${className ?? ""}`}>
      <CopyButton value={code} className="absolute right-2 top-2" />
      <pre className="overflow-x-auto p-3.5 pr-11 font-mono text-[12.5px] leading-relaxed text-fg-muted">
        <code>{code}</code>
      </pre>
    </div>
  );
}
