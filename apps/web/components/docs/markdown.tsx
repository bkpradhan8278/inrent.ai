import Link from "@/components/ui/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { CodeBlock, CodeTabs, type CodeTab } from "@/components/ui/code-block";
import { slugifyHeading } from "@/lib/docs";
import { site } from "@/lib/site";
import { Callout } from "./callout";

type Segment =
  | { type: "md"; text: string }
  | { type: "tabs"; tabs: CodeTab[] }
  | { type: "callout"; kind: string; text: string };

/** Placeholders replaced at render time so docs always show the configured API endpoint. */
function interpolate(text: string): string {
  return text.replaceAll("{{API_BASE_URL}}", site.apiBaseUrl).replaceAll("{{APP_URL}}", site.url);
}

/**
 * Splits markdown into plain segments, tabbed code groups (consecutive fences carrying
 * `tab="Label"`) and GitHub-style callouts (`> [!NOTE]`).
 */
export function splitSegments(source: string): Segment[] {
  const lines = interpolate(source).split("\n");
  const segments: Segment[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.join("").trim()) segments.push({ type: "md", text: buffer.join("\n") });
    buffer = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const tabFence = /^```(\w+)?\s+tab="([^"]+)"\s*$/.exec(line);
    if (tabFence) {
      flush();
      const tabs: CodeTab[] = [];
      while (i < lines.length) {
        const open = /^```(\w+)?\s+tab="([^"]+)"\s*$/.exec(lines[i]!);
        if (!open) break;
        const code: string[] = [];
        i++;
        while (i < lines.length && !lines[i]!.startsWith("```")) code.push(lines[i++]!);
        i++; // closing fence
        tabs.push({ label: open[2]!, lang: open[1] ?? "text", code: code.join("\n") });
        let j = i;
        while (j < lines.length && lines[j]!.trim() === "") j++;
        if (j < lines.length && /^```\w*\s+tab="/.test(lines[j]!)) i = j;
        else break;
      }
      segments.push({ type: "tabs", tabs });
      continue;
    }
    const callout = /^>\s*\[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*$/.exec(line);
    if (callout) {
      flush();
      const body: string[] = [];
      i++;
      while (i < lines.length && lines[i]!.startsWith(">")) body.push(lines[i++]!.replace(/^>\s?/, ""));
      segments.push({ type: "callout", kind: callout[1]!.toLowerCase(), text: body.join("\n") });
      continue;
    }
    if (line.startsWith("```")) {
      // Keep ordinary fences intact inside the markdown buffer.
      buffer.push(line);
      i++;
      while (i < lines.length && !lines[i]!.startsWith("```")) buffer.push(lines[i++]!);
      if (i < lines.length) buffer.push(lines[i++]!);
      continue;
    }
    buffer.push(line);
    i++;
  }
  flush();
  return segments;
}

function textOf(children: React.ReactNode): string {
  if (typeof children === "string" || typeof children === "number") return String(children);
  if (Array.isArray(children)) return children.map(textOf).join("");
  if (children && typeof children === "object" && "props" in children) return textOf((children as { props: { children?: React.ReactNode } }).props.children);
  return "";
}

const components: Components = {
  h2: ({ children }) => {
    const id = slugifyHeading(textOf(children));
    return (
      <h2 id={id} className="group scroll-mt-24">
        <a href={`#${id}`} className="!text-fg !no-underline">
          {children}
          <span className="ml-2 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden>
            #
          </span>
        </a>
      </h2>
    );
  },
  h3: ({ children }) => {
    const id = slugifyHeading(textOf(children));
    return (
      <h3 id={id} className="scroll-mt-24">
        {children}
      </h3>
    );
  },
  a: ({ href = "", children }) =>
    href.startsWith("/") ? <Link href={href}>{children}</Link> : <a href={href} target="_blank" rel="noreferrer noopener">{children}</a>,
  pre: ({ children }) => <>{children}</>,
  code: ({ className, children }) => {
    const lang = /language-(\w+)/.exec(className ?? "")?.[1];
    const code = textOf(children);
    if (!lang && !code.includes("\n")) return <code>{children}</code>;
    return <CodeBlock code={code} lang={lang ?? "text"} className="my-5" />;
  },
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-lg border border-border">
      <table className="!my-0">{children}</table>
    </div>
  ),
};

export function Markdown({ source }: { source: string }) {
  return (
    <>
      {splitSegments(source).map((seg, i) => {
        if (seg.type === "tabs") return <CodeTabs key={i} tabs={seg.tabs} className="my-5" />;
        if (seg.type === "callout")
          return (
            <Callout key={i} kind={seg.kind}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
                {seg.text}
              </ReactMarkdown>
            </Callout>
          );
        return (
          <ReactMarkdown key={i} remarkPlugins={[remarkGfm]} components={components}>
            {seg.text}
          </ReactMarkdown>
        );
      })}
    </>
  );
}
