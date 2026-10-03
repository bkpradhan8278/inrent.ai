"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function TableOfContents({ headings }: { headings: Array<{ depth: 2 | 3; text: string; id: string }> }) {
  const [active, setActive] = useState<string | null>(headings[0]?.id ?? null);
  useEffect(() => {
    const els = headings.map((h) => document.getElementById(h.id)).filter((e): e is HTMLElement => Boolean(e));
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.id);
      },
      { rootMargin: "-80px 0px -70% 0px" },
    );
    els.forEach((e) => obs.observe(e));
    return () => obs.disconnect();
  }, [headings]);
  if (!headings.length) return null;
  return (
    <nav aria-label="On this page" className="sticky top-20">
      <div className="mb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">On this page</div>
      <ul className="flex flex-col gap-1.5 border-l border-border">
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cn("-ml-px block border-l py-0.5 text-[12.5px] transition-colors", h.depth === 3 ? "pl-6" : "pl-3", active === h.id ? "border-accent text-fg" : "border-transparent text-fg-subtle hover:text-fg-muted")}
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
