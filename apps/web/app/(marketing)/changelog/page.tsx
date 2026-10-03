import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { CHANGELOG } from "@/lib/changelog";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Changelog", description: "New models, providers, features and SDK updates on INRENT.", alternates: { canonical: "/changelog" } };

export default function ChangelogPage() {
  return (
    <>
      <PageHero eyebrow="Changelog" title="What's new" description="New models, providers, features, performance work and SDK updates — in order." />
      <section className="container-page py-16">
        <ol className="relative ml-2 border-l border-border">
          {CHANGELOG.map((e) => (
            <li key={e.date + e.title} className="relative pb-14 pl-8 last:pb-0">
              <span className="absolute -left-[5px] top-2 size-2.5 rounded-full bg-accent shadow-[0_0_0_4px_rgb(92_235_192/0.15)]" aria-hidden />
              <time className="font-mono text-xs text-fg-subtle" dateTime={e.date}>
                {formatDate(e.date)}
              </time>
              <h2 className="mt-1 text-xl font-semibold text-fg">{e.title}</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {e.tags.map((t) => (
                  <Badge key={t}>{t}</Badge>
                ))}
              </div>
              <ul className="mt-4 flex max-w-3xl flex-col gap-2.5 text-[14px] leading-relaxed text-fg-muted">
                {e.items.map((i) => (
                  <li key={i} className="flex gap-3">
                    <span className="mt-2 size-1 shrink-0 rounded-full bg-fg-subtle" />
                    {i}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
