import type { Metadata } from "next";
import { DocsMobileNav, DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsSearch } from "@/components/docs/docs-search";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { getDocsNav, getSearchIndex } from "@/lib/docs";

export const metadata: Metadata = {
  title: { default: "Documentation", template: "%s · INRENT Docs" },
  description: "Guides and API reference for the INRENT unified AI API.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const nav = getDocsNav();
  const index = getSearchIndex();
  const search = <DocsSearch index={index} />;
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader section="docs" />
      <div className="container-page grid flex-1 gap-10 py-8 lg:grid-cols-[230px_minmax(0,1fr)]">
        <DocsSidebar nav={nav} search={search} />
        <div className="min-w-0">
          <div className="mb-6 lg:hidden">
            <DocsMobileNav nav={nav} search={search} />
          </div>
          <main id="main">{children}</main>
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}
