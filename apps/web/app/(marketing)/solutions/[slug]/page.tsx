import { ArrowRight, Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "@/components/ui/link";
import { notFound } from "next/navigation";
import { PageHero } from "@/components/marketing/page-hero";
import { Button } from "@/components/ui/button";
import { CodeTabs } from "@/components/ui/code-block";
import { SectionHeading } from "@/components/ui/misc";
import { chatSnippets } from "@/lib/snippets";
import { getSolution, SOLUTIONS } from "@/lib/solutions";

export function generateStaticParams() {
  return SOLUTIONS.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const s = getSolution((await params).slug);
  if (!s) return {};
  return { title: s.title, description: s.description, alternates: { canonical: `/solutions/${s.slug}` } };
}

export default async function SolutionPage({ params }: { params: Promise<{ slug: string }> }) {
  const s = getSolution((await params).slug);
  if (!s) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: s.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <>
      <PageHero eyebrow={s.title} title={s.headline} description={s.description}>
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/sign-up">
              Start building <ArrowRight />
            </Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/docs/quickstart">Quickstart</Link>
          </Button>
        </div>
      </PageHero>
      <section className="container-page grid gap-12 py-20 lg:grid-cols-2 lg:items-start">
        <ul className="grid gap-4 sm:grid-cols-2">
          {s.points.map((p) => (
            <li key={p.title} className="panel rounded-xl p-5">
              <Check className="size-4 text-accent" />
              <h2 className="mt-3 text-[15px] font-semibold text-fg">{p.title}</h2>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-fg-muted">{p.body}</p>
            </li>
          ))}
        </ul>
        <CodeTabs tabs={chatSnippets("inrent/auto").slice(0, 4)} title="chat.completions" />
      </section>
      <section className="border-t border-border bg-bg-elevated/40">
        <div className="container-page grid gap-10 py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="FAQ" title="Common questions" />
          <dl className="divide-y divide-border rounded-xl border border-border">
            {s.faq.map((f) => (
              <div key={f.q} className="p-5">
                <dt className="font-medium text-fg">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
