"use client";

import { useState } from "react";
import { useStoredValue } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

const STORAGE_KEY = "inrent:code-lang";

export function CodeTabsClient({ tabs, className, title }: { tabs: Array<{ label: string; code: string; html: string }>; className?: string; title?: string }) {
  // The reader's preferred language is shared across every code sample on the page.
  const preferred = useStoredValue("local", STORAGE_KEY, "inrent:code-lang");
  // Fallback when storage is unavailable (private mode, blocked site data).
  const [local, setLocal] = useState<string | null>(null);
  const active = Math.max(0, tabs.findIndex((t) => t.label === (local ?? preferred)));

  const select = (i: number) => {
    const label = tabs[i]?.label;
    if (!label) return;
    try {
      localStorage.setItem(STORAGE_KEY, label);
      setLocal(null);
    } catch {
      setLocal(label);
    }
    window.dispatchEvent(new Event("inrent:code-lang"));
  };

  const current = tabs[active] ?? tabs[0];
  if (!current) return null;
  return (
    <div className={cn("overflow-hidden rounded-lg border border-border bg-[#080a0e]", className)}>
      <div className="flex h-10 items-center justify-between gap-2 border-b border-border pl-1.5 pr-2">
        <div role="tablist" aria-label={title ?? "Code language"} className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
          {tabs.map((t, i) => (
            <button
              key={t.label}
              role="tab"
              type="button"
              aria-selected={i === active}
              onClick={() => select(i)}
              className={cn(
                "relative h-7 shrink-0 rounded-md px-2.5 font-mono text-[11.5px] transition-colors",
                i === active ? "bg-surface-2 text-fg" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {title ? <span className="hidden font-mono text-[11px] text-fg-subtle sm:inline">{title}</span> : null}
          <CopyButton value={current.code} />
        </div>
      </div>
      <div role="tabpanel" className="overflow-x-auto px-4 py-3.5" dangerouslySetInnerHTML={{ __html: current.html }} />
    </div>
  );
}
