"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { COMMAND_EVENT } from "@/lib/command-events";

// cmdk and the dialog load only when the palette is first opened.
const CommandPaletteDialog = dynamic(() => import("./command-palette").then((m) => m.CommandPaletteDialog), { ssr: false });

/** Global command palette: ⌘K / Ctrl+K anywhere, "/" for docs search. */
export function CommandPalette({ docs }: { docs: Array<{ title: string; href: string; section: string }> }) {
  const [state, setState] = useState<{ open: boolean; mode: "all" | "docs"; used: boolean }>({ open: false, mode: "all", used: false });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setState((s) => ({ open: !s.open, mode: "all", used: true }));
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !window.location.pathname.startsWith("/docs")) {
        e.preventDefault();
        setState({ open: true, mode: "docs", used: true });
      }
    };
    const onOpen = (e: Event) => setState({ open: true, mode: ((e as CustomEvent<string>).detail as "all" | "docs") ?? "all", used: true });
    window.addEventListener("keydown", onKey);
    window.addEventListener(COMMAND_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(COMMAND_EVENT, onOpen);
    };
  }, []);

  if (!state.used) return null;
  return <CommandPaletteDialog docs={docs} open={state.open} mode={state.mode} setOpen={(open) => setState((s) => ({ ...s, open }))} />;
}
