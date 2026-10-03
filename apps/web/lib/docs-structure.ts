/** Docs navigation. Pure data (no fs) so it can be used anywhere, including the command palette. */
export interface DocPageRef {
  slug: string; // "" = introduction
  title: string;
}

export interface DocSection {
  title: string;
  pages: DocPageRef[];
}

export const DOCS_STRUCTURE: DocSection[] = [
  {
    title: "Getting started",
    pages: [
      { slug: "", title: "Introduction" },
      { slug: "quickstart", title: "Quickstart" },
      { slug: "authentication", title: "Authentication" },
    ],
  },
  {
    title: "API",
    pages: [
      { slug: "api", title: "API overview" },
      { slug: "models", title: "Models" },
      { slug: "streaming", title: "Streaming" },
      { slug: "function-calling", title: "Function calling" },
      { slug: "structured-output", title: "Structured output" },
      { slug: "embeddings", title: "Embeddings" },
      { slug: "vision", title: "Vision" },
      { slug: "images", title: "Images" },
      { slug: "audio", title: "Audio" },
    ],
  },
  {
    title: "Platform",
    pages: [
      { slug: "routing", title: "Routing & fallback" },
      { slug: "rate-limits", title: "Rate limits" },
      { slug: "errors", title: "Errors" },
      { slug: "billing", title: "Billing & credits" },
      { slug: "api-keys", title: "API keys" },
      { slug: "byok", title: "Bring your own key" },
      { slug: "webhooks", title: "Webhooks" },
      { slug: "mcp", title: "MCP" },
      { slug: "agents", title: "Agents" },
    ],
  },
  {
    title: "Tools",
    pages: [
      { slug: "sdks", title: "SDKs" },
      { slug: "cli", title: "CLI" },
      { slug: "api-reference", title: "API reference" },
    ],
  },
  {
    title: "Trust",
    pages: [
      { slug: "security", title: "Security" },
      { slug: "data-privacy", title: "Data & privacy" },
      { slug: "enterprise", title: "Enterprise" },
    ],
  },
];

export function docHref(slug: string): string {
  return slug ? `/docs/${slug}` : "/docs";
}

export function getDocsNav() {
  return DOCS_STRUCTURE.map((s) => ({ title: s.title, pages: s.pages.map((p) => ({ ...p, href: docHref(p.slug) })) }));
}

export function flatDocs(): Array<DocPageRef & { section: string }> {
  return DOCS_STRUCTURE.flatMap((s) => s.pages.map((p) => ({ ...p, section: s.title })));
}
