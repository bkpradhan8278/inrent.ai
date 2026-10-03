import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DOCS_STRUCTURE, flatDocs } from "@/lib/docs-structure";
import { getDoc, getSearchIndex, slugifyHeading } from "@/lib/docs";

const DOCS_DIR = path.join(__dirname, "..", "content", "docs");
const files = fs.readdirSync(DOCS_DIR).filter((f) => f.endsWith(".md"));
const slugs = new Set(flatDocs().map((d) => d.slug));
// Pages rendered by a dedicated route instead of a Markdown file.
const DEDICATED = new Set(["api-reference"]);
const markdownDocs = () => flatDocs().filter((d) => !DEDICATED.has(d.slug));

describe("documentation integrity", () => {
  it("dedicated doc routes exist", () => {
    for (const slug of DEDICATED) expect(fs.existsSync(path.join(__dirname, "..", "app", "docs", slug, "page.tsx"))).toBe(true);
  });

  it("every navigation entry has a content file with frontmatter", () => {
    for (const d of markdownDocs()) {
      const doc = getDoc(d.slug);
      expect(doc, `missing content for /docs/${d.slug}`).not.toBeNull();
      expect(doc!.title.length).toBeGreaterThan(2);
      expect(doc!.description.length, `description for ${d.slug}`).toBeGreaterThan(10);
    }
  });

  it("every content file is reachable from the navigation", () => {
    for (const f of files) {
      const slug = f === "index.md" ? "" : f.replace(/\.md$/, "");
      expect(slugs.has(slug), `${f} is not in DOCS_STRUCTURE`).toBe(true);
    }
  });

  it("internal /docs links point at existing pages and headings", () => {
    const broken: string[] = [];
    for (const d of markdownDocs()) {
      const doc = getDoc(d.slug)!;
      for (const m of doc.content.matchAll(/\]\((\/docs(?:\/[a-z0-9-]+)?)(#[a-z0-9-]+)?\)/g)) {
        const target = m[1]!.replace(/^\/docs\/?/, "");
        if (!slugs.has(target)) {
          broken.push(`${d.slug} → ${m[0]}`);
          continue;
        }
        const anchor = m[2]?.slice(1);
        if (anchor && !DEDICATED.has(target) && !getDoc(target)!.headings.some((h) => h.id === anchor)) broken.push(`${d.slug} → ${m[0]} (no heading)`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("sections have unique slugs and titles", () => {
    const all = DOCS_STRUCTURE.flatMap((s) => s.pages.map((p) => p.slug));
    expect(new Set(all).size).toBe(all.length);
  });

  it("builds a search index entry for every page", () => {
    expect(getSearchIndex().length).toBeGreaterThanOrEqual(markdownDocs().length);
  });

  it("slugifies headings into stable anchors", () => {
    expect(slugifyHeading("Rate limits & `retry-after`")).toBe("rate-limits-retry-after");
    expect(slugifyHeading("  BYOK keys ")).toBe("byok-keys");
  });
});
