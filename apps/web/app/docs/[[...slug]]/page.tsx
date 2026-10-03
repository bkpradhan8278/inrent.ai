import { ArrowLeft, ArrowRight, Pencil } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/docs/markdown";
import { TableOfContents } from "@/components/docs/toc";
import { getAdjacentDocs, getAllDocSlugs, getDoc } from "@/lib/docs";
import { site } from "@/lib/site";

export function generateStaticParams() {
  return getAllDocSlugs().map((slug) => ({ slug: slug ? [slug] : [] }));
}

export const dynamicParams = false;

async function load(params: Promise<{ slug?: string[] }>) {
  const { slug } = await params;
  return getDoc((slug ?? []).join("/"));
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }): Promise<Metadata> {
  const doc = await load(params);
  if (!doc) return {};
  return { title: doc.slug ? doc.title : "Introduction", description: doc.description, alternates: { canonical: doc.slug ? `/docs/${doc.slug}` : "/docs" } };
}

export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const doc = await load(params);
  if (!doc) notFound();
  const { prev, next } = getAdjacentDocs(doc.slug);
  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_200px]">
      <article className="min-w-0 max-w-3xl">
        <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">{doc.section}</div>
        <div className="prose-docs">
          <h1>{doc.title}</h1>
          {doc.description ? <p className="!mt-0 text-[17px] !text-fg-muted">{doc.description}</p> : null}
          <Markdown source={doc.content} />
        </div>
        <div className="mt-14 grid gap-3 border-t border-border pt-6 sm:grid-cols-2">
          {prev ? (
            <Link href={prev.href} className="group rounded-lg border border-border p-4 transition-colors hover:border-border-strong">
              <div className="flex items-center gap-1 text-xs text-fg-subtle">
                <ArrowLeft className="size-3" /> Previous
              </div>
              <div className="mt-1 text-sm text-fg">{prev.title}</div>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link href={next.href} className="group rounded-lg border border-border p-4 text-right transition-colors hover:border-border-strong">
              <div className="flex items-center justify-end gap-1 text-xs text-fg-subtle">
                Next <ArrowRight className="size-3" />
              </div>
              <div className="mt-1 text-sm text-fg">{next.title}</div>
            </Link>
          ) : null}
        </div>
        <a href={`${site.github}/blob/main/apps/web/content/docs/${doc.slug || "index"}.md`} className="mt-6 inline-flex items-center gap-1.5 text-xs text-fg-subtle hover:text-fg-muted">
          <Pencil className="size-3" /> Edit this page
        </a>
      </article>
      <aside className="hidden xl:block">
        <TableOfContents headings={doc.headings} />
      </aside>
    </div>
  );
}
