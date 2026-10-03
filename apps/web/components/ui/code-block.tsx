import { highlight } from "@/lib/highlight";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";
import { CodeTabsClient } from "./code-tabs-client";

/** Server-highlighted code block with a copy button. Zero client JS beyond the button. */
export async function CodeBlock({ code, lang = "text", title, className }: { code: string; lang?: string; title?: string; className?: string }) {
  const html = await highlight(code, lang);
  return (
    <div className={cn("group relative overflow-hidden rounded-lg border border-border bg-[#080a0e]", className)}>
      {title ? (
        <div className="flex h-9 items-center justify-between border-b border-border px-3">
          <span className="font-mono text-[11px] text-fg-subtle">{title}</span>
          <CopyButton value={code} />
        </div>
      ) : (
        <CopyButton value={code} className="absolute right-2 top-2 z-10 bg-[#080a0e] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" />
      )}
      <div className="overflow-x-auto px-4 py-3.5" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

export interface CodeTab {
  label: string;
  lang: string;
  code: string;
}

/** Language tabs (cURL / Python / JavaScript / TypeScript …), highlighted on the server. */
export async function CodeTabs({ tabs, className, title }: { tabs: CodeTab[]; className?: string; title?: string }) {
  const rendered = await Promise.all(tabs.map(async (t) => ({ label: t.label, code: t.code, html: await highlight(t.code, t.lang) })));
  return <CodeTabsClient tabs={rendered} className={className} title={title} />;
}
