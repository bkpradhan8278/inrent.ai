"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({ value, className, label = "Copy" }: { value: string; className?: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        } catch {
          /* clipboard unavailable */
        }
      }}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md border border-transparent text-fg-subtle transition-colors hover:border-border-strong hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {copied ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5" />}
    </button>
  );
}
