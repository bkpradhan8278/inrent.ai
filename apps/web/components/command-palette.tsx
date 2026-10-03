"use client";

import { Command } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowRight, BarChart3, BookOpen, Boxes, CreditCard, KeyRound, LayoutDashboard, MessagesSquare, ScrollText, Search, Settings, Cpu, Activity } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { Kbd } from "@/components/ui/misc";

interface DocEntry {
  title: string;
  href: string;
  section: string;
}

const ACTIONS = [
  { label: "Search models", href: "/models", icon: Boxes, keywords: "catalog explore" },
  { label: "Open docs", href: "/docs", icon: BookOpen, keywords: "documentation guide" },
  { label: "Open playground", href: "/dashboard/playground", icon: MessagesSquare, keywords: "chat try test" },
  { label: "Create API key", href: "/dashboard/keys?create=1", icon: KeyRound, keywords: "new key token secret" },
  { label: "View usage", href: "/dashboard/usage", icon: BarChart3, keywords: "analytics tokens spend" },
  { label: "Open billing", href: "/dashboard/billing", icon: CreditCard, keywords: "credits payment invoice" },
  { label: "Open logs", href: "/dashboard/logs", icon: ScrollText, keywords: "requests errors" },
  { label: "Open settings", href: "/dashboard/settings", icon: Settings, keywords: "privacy retention account" },
  { label: "Dashboard overview", href: "/dashboard", icon: LayoutDashboard, keywords: "home" },
  { label: "GPU Cloud (coming soon)", href: "/gpu", icon: Cpu, keywords: "compute rent gpu waitlist" },
  { label: "System status", href: "/status", icon: Activity, keywords: "uptime incidents" },
];

export interface DocEntryProps {
  docs: DocEntry[];
  open: boolean;
  mode: "all" | "docs";
  setOpen: (open: boolean) => void;
}

/** The palette UI (cmdk). Loaded on first use by CommandPalette in command-palette-host.tsx. */
export function CommandPaletteDialog({ docs, open, mode, setOpen }: DocEntryProps) {
  const router = useRouter();

  const go = useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router, setOpen],
  );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
        <DialogPrimitive.Content className="panel fixed left-1/2 top-[14vh] z-[60] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl shadow-2xl focus:outline-none" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">{mode === "docs" ? "Search documentation" : "Command palette"}</DialogPrimitive.Title>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-fg-subtle" />
              <Command.Input
                autoFocus
                placeholder={mode === "docs" ? "Search documentation…" : "Search commands, docs and pages…"}
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
              />
              <Kbd>esc</Kbd>
            </div>
            <Command.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-8 text-center text-sm text-fg-subtle">No results.</Command.Empty>
              {mode === "all" ? (
                <Command.Group heading="Actions" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
                  {ACTIONS.map((a) => (
                    <Command.Item key={a.href} value={`${a.label} ${a.keywords}`} onSelect={() => go(a.href)} className="flex cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm text-fg-muted data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg">
                      <a.icon className="size-4 text-fg-subtle" />
                      {a.label}
                      <ArrowRight className="ml-auto size-3.5 opacity-0 [[data-selected=true]_&]:opacity-60" />
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}
              <Command.Group heading="Documentation" className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-fg-subtle">
                {docs.map((d) => (
                  <Command.Item key={d.href} value={`${d.title} ${d.section} docs`} onSelect={() => go(d.href)} className="flex cursor-default items-center gap-3 rounded-md px-2 py-2 text-sm text-fg-muted data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg">
                    <BookOpen className="size-4 text-fg-subtle" />
                    <span>{d.title}</span>
                    <span className="ml-auto text-xs text-fg-subtle">{d.section}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-3 border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> open
              </span>
              <span className="ml-auto flex items-center gap-1">
                <Kbd>⌘K</Kbd> commands · <Kbd>/</Kbd> docs
              </span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

