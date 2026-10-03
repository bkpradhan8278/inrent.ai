"use client";

import { Dialog as DialogPrimitive } from "radix-ui";
import { FileText, Hash, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Kbd } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

interface Entry {
  title: string;
  href: string;
  section: string;
  description: string;
  headings: string[];
  text: string;
}

function score(entry: Entry, terms: string[]): { score: number; heading?: string } {
  let total = 0;
  let heading: string | undefined;
  for (const t of terms) {
    const title = entry.title.toLowerCase();
    if (title === t) total += 50;
    else if (title.includes(t)) total += 20;
    const h = entry.headings.find((x) => x.toLowerCase().includes(t));
    if (h) {
      total += 10;
      heading ??= h;
    }
    if (entry.description.toLowerCase().includes(t)) total += 6;
    const body = entry.text.toLowerCase();
    if (body.includes(t)) total += 2 + Math.min(4, body.split(t).length - 1);
    else if (!title.includes(t) && !h) return { score: 0 };
  }
  return { score: total, heading };
}

function slugify(text: string) {
  return text.toLowerCase().replace(/`/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

/** Full-text docs search (client-side index). Opens with "/" or the search button. */
export function DocsSearch({ index }: { index: Entry[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === "/" && !(t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable))) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("inrent:docs-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("inrent:docs-search", onOpen);
    };
  }, []);

  const results = useMemo(() => {
    const terms = q.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
    if (!terms.length) return index.slice(0, 8).map((e) => ({ e, heading: undefined as string | undefined }));
    return index
      .map((e) => ({ e, ...score(e, terms) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }, [q, index]);

  const go = (r: (typeof results)[number]) => {
    setOpen(false);
    setQ("");
    router.push(r.heading ? `${r.e.href}#${slugify(r.heading)}` : r.e.href);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-3 text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted">
        <Search className="size-3.5" /> Search docs
        <Kbd className="ml-auto">/</Kbd>
      </button>
      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" />
          <DialogPrimitive.Content className="panel fixed left-1/2 top-[12vh] z-[60] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 overflow-hidden rounded-xl shadow-2xl focus:outline-none" aria-describedby={undefined}>
            <DialogPrimitive.Title className="sr-only">Search documentation</DialogPrimitive.Title>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <Search className="size-4 text-fg-subtle" />
              <input
                autoFocus
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter" && results[active]) {
                    e.preventDefault();
                    go(results[active]);
                  }
                }}
                placeholder="Search guides, endpoints, errors…"
                className="h-12 flex-1 bg-transparent text-sm text-fg outline-none placeholder:text-fg-subtle"
                aria-label="Search documentation"
              />
              <Kbd>esc</Kbd>
            </div>
            <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox">
              {results.length === 0 ? <li className="px-3 py-8 text-center text-sm text-fg-subtle">No results for “{q}”.</li> : null}
              {results.map((r, i) => (
                <li key={r.e.href + (r.heading ?? "")} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn("flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left", i === active ? "bg-surface-2" : "")}
                  >
                    {r.heading ? <Hash className="mt-0.5 size-4 shrink-0 text-fg-subtle" /> : <FileText className="mt-0.5 size-4 shrink-0 text-fg-subtle" />}
                    <span className="min-w-0">
                      <span className="block text-sm text-fg">
                        {r.e.title}
                        {r.heading ? <span className="text-fg-subtle"> › {r.heading}</span> : null}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">{r.e.description || r.e.section}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
