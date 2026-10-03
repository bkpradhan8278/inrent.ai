import "server-only";
import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { DOCS_STRUCTURE, docHref, flatDocs } from "./docs-structure";

export { getDocsNav, docHref, DOCS_STRUCTURE } from "./docs-structure";

const DOCS_DIR = path.join(process.cwd(), "content", "docs");

export interface Heading {
  depth: 2 | 3;
  text: string;
  id: string;
}

export interface Doc {
  slug: string;
  title: string;
  description: string;
  content: string;
  headings: Heading[];
  section: string;
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractHeadings(content: string): Heading[] {
  const headings: Heading[] = [];
  let inFence = false;
  for (const line of content.split("\n")) {
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (m) headings.push({ depth: m[1]!.length as 2 | 3, text: m[2]!.replace(/`/g, ""), id: slugifyHeading(m[2]!) });
  }
  return headings;
}

const cache = new Map<string, Doc>();

export function getDoc(slug: string): Doc | null {
  if (cache.has(slug)) return cache.get(slug)!;
  const ref = flatDocs().find((d) => d.slug === slug);
  if (!ref) return null;
  const file = path.join(DOCS_DIR, `${slug || "index"}.md`);
  if (!fs.existsSync(file)) return null;
  const { data, content } = matter(fs.readFileSync(file, "utf8"));
  const doc: Doc = {
    slug,
    title: String(data.title ?? ref.title),
    description: String(data.description ?? ""),
    content,
    headings: extractHeadings(content),
    section: ref.section,
  };
  cache.set(slug, doc);
  return doc;
}

export function getAllDocSlugs(): string[] {
  return flatDocs()
    .map((d) => d.slug)
    .filter((s) => s !== "api-reference");
}

export function getAdjacentDocs(slug: string) {
  const all = flatDocs();
  const i = all.findIndex((d) => d.slug === slug);
  const prev = i > 0 ? all[i - 1] : null;
  const next = i >= 0 && i < all.length - 1 ? all[i + 1] : null;
  return {
    prev: prev ? { title: prev.title, href: docHref(prev.slug) } : null,
    next: next ? { title: next.title, href: docHref(next.slug) } : null,
  };
}

export interface SearchEntry {
  title: string;
  href: string;
  section: string;
  description: string;
  headings: string[];
  text: string;
}

/** Full-text index (built at render time, shipped to the client search dialog). */
export function getSearchIndex(): SearchEntry[] {
  const entries: SearchEntry[] = [];
  for (const section of DOCS_STRUCTURE) {
    for (const p of section.pages) {
      if (p.slug === "api-reference") {
        entries.push({ title: p.title, href: docHref(p.slug), section: section.title, description: "Every endpoint, parameter and error with interactive examples.", headings: [], text: "" });
        continue;
      }
      const doc = getDoc(p.slug);
      if (!doc) continue;
      const text = doc.content
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/[#>*_`|\[\]()-]/g, " ")
        .replace(/\s+/g, " ")
        .slice(0, 4000);
      entries.push({ title: doc.title, href: docHref(p.slug), section: section.title, description: doc.description, headings: doc.headings.map((h) => h.text), text });
    }
  }
  return entries;
}
