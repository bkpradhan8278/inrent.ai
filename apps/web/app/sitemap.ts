import type { MetadataRoute } from "next";
import { flatDocs, docHref } from "@/lib/docs-structure";
import { safePublicModels } from "@/lib/catalog";
import { site } from "@/lib/site";
import { SOLUTIONS } from "@/lib/solutions";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticPaths = ["", "/models", "/pricing", "/docs/api-reference", "/playground", "/gpu", "/enterprise", "/mcp", "/agents", "/changelog", "/roadmap", "/status", "/support", "/about", "/contact", "/security", "/terms", "/privacy", "/acceptable-use", "/cookies", "/dpa"];
  const models = (await safePublicModels()).filter((m) => !m.isDevOnly);
  return [
    ...staticPaths.map((p) => ({ url: `${site.url}${p}`, lastModified: now, changeFrequency: "weekly" as const, priority: p === "" ? 1 : 0.7 })),
    ...flatDocs().filter((d) => d.slug !== "api-reference").map((d) => ({ url: `${site.url}${docHref(d.slug)}`, lastModified: now, changeFrequency: "weekly" as const, priority: 0.6 })),
    ...SOLUTIONS.map((s) => ({ url: `${site.url}/solutions/${s.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.6 })),
    ...models.map((m) => ({ url: `${site.url}/models/${m.slug}`, lastModified: now, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
