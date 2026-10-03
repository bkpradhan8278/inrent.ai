import { TriangleAlert } from "lucide-react";
import { formatDate } from "@/lib/format";

export interface LegalSection {
  title: string;
  body: string[];
}

/** Renders legal templates. Every page is visibly marked as a draft pending legal review. */
export function LegalPage({ title, updated, intro, sections }: { title: string; updated: string; intro: string; sections: LegalSection[] }) {
  return (
    <div className="container-page py-14">
      <div className="mx-auto max-w-3xl">
        <div role="note" className="mb-10 flex gap-3 rounded-lg border border-[rgb(245_180_85/0.35)] bg-amber-soft px-4 py-3 text-sm text-amber">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong className="font-semibold">Template — requires legal review.</strong> This document is a draft prepared for INRENT and has not yet been reviewed by counsel. It is not legal advice and may change before launch.
          </p>
        </div>
        <h1 className="text-display text-4xl text-fg">{title}</h1>
        <p className="mt-2 font-mono text-xs text-fg-subtle">Last updated {formatDate(updated)}</p>
        <p className="mt-6 text-[15px] leading-relaxed text-fg-muted">{intro}</p>
        <nav aria-label="Contents" className="mt-8 rounded-lg border border-border bg-surface p-4">
          <ol className="grid gap-1 text-sm sm:grid-cols-2">
            {sections.map((s, i) => (
              <li key={s.title}>
                <a href={`#s${i + 1}`} className="text-fg-muted hover:text-fg">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="prose-docs mt-8">
          {sections.map((s, i) => (
            <section key={s.title} id={`s${i + 1}`} className="scroll-mt-24">
              <h2>
                {i + 1}. {s.title}
              </h2>
              {s.body.map((p, j) => (
                <p key={j}>{p}</p>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
