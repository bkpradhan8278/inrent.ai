import type { Metadata } from "next";
import { ERROR_CATALOG } from "@inrent/core";
import { OPENAPI_SPEC } from "@inrent/core/openapi";
import { TryIt } from "@/components/docs/try-it";
import { Badge } from "@/components/ui/badge";
import { CodeTabs } from "@/components/ui/code-block";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "API reference", description: "Every INRENT API endpoint, parameter and error, with interactive examples.", alternates: { canonical: "/docs/api-reference" } };

type Operation = {
  tags?: readonly string[];
  operationId: string;
  summary: string;
  description?: string;
  security?: readonly unknown[];
  parameters?: ReadonlyArray<{ name: string; in: string; required?: boolean; schema?: { type?: string } }>;
  requestBody?: { content: Record<string, { schema: Record<string, unknown> }> };
  responses: Record<string, { description: string }>;
};

const EXAMPLES: Record<string, unknown> = {
  createChatCompletion: { model: "inrent/auto", messages: [{ role: "user", content: "Write a haiku about routers." }], max_tokens: 128 },
  createCompletion: { model: "inrent/auto", prompt: "Once upon a time", max_tokens: 64 },
  createResponse: { model: "inrent/auto", input: "Summarize the OpenAI API in one sentence." },
  createEmbedding: { model: "openai/text-embedding-3-small", input: ["hello world"] },
  createImage: { model: "vendor/image-model", prompt: "A minimal isometric data center", n: 1 },
  createKey: { name: "ci-key", environment: "development", permissions: ["inference"] },
};

const METHOD_STYLE: Record<string, string> = {
  get: "border-[rgb(111_168_255/0.35)] bg-[rgb(111_168_255/0.1)] text-info",
  post: "border-[rgb(92_235_192/0.35)] bg-accent-soft text-accent",
  delete: "border-[rgb(255_107_107/0.35)] bg-danger-soft text-danger",
};

function resolveSchema(schema: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!schema) return undefined;
  const ref = schema.$ref as string | undefined;
  if (ref) {
    const name = ref.split("/").pop()!;
    return (OPENAPI_SPEC.components.schemas as Record<string, Record<string, unknown>>)[name];
  }
  return schema;
}

function Fields({ schema }: { schema: Record<string, unknown> | undefined }) {
  const s = resolveSchema(schema);
  const props = (s?.properties ?? {}) as Record<string, { type?: string | string[]; description?: string; enum?: string[]; $ref?: string }>;
  const required = new Set((s?.required as string[] | undefined) ?? []);
  const entries = Object.entries(props);
  if (!entries.length) return null;
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[13px]">
        <tbody>
          {entries.map(([name, p]) => (
            <tr key={name} className="border-b border-border last:border-0">
              <td className="w-48 px-3 py-2 align-top">
                <code className="font-mono text-fg">{name}</code>
                {required.has(name) ? <span className="ml-1.5 text-[10px] uppercase text-amber">required</span> : null}
              </td>
              <td className="px-3 py-2 align-top text-fg-muted">
                <span className="font-mono text-[11.5px] text-fg-subtle">{p.$ref ? p.$ref.split("/").pop() : Array.isArray(p.type) ? p.type.join(" | ") : (p.type ?? "object")}</span>
                {p.enum ? <span className="ml-2 font-mono text-[11px] text-fg-subtle">{p.enum.join(" | ")}</span> : null}
                {p.description ? <div className="mt-0.5">{p.description}</div> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function samples(method: string, path: string, opId: string, needsAuth: boolean) {
  const body = EXAMPLES[opId];
  const url = `${site.apiBaseUrl}${path.replace("{model}", "openai/gpt-4.1").replace("{id}", "KEY_OR_REQUEST_ID")}`;
  const json = body ? JSON.stringify(body, null, 2) : null;
  const auth = needsAuth ? ` \\\n  -H "Authorization: Bearer $INRENT_API_KEY"` : "";
  return [
    { label: "cURL", lang: "bash", code: `curl -X ${method.toUpperCase()} ${url}${auth}${json ? ` \\\n  -H "Content-Type: application/json" \\\n  -d '${json}'` : ""}` },
    {
      label: "Python",
      lang: "python",
      code: `import os, requests\n\nres = requests.${method}(\n    "${url}",\n    headers={${needsAuth ? `"Authorization": f"Bearer {os.environ['INRENT_API_KEY']}"` : ""}},${json ? `\n    json=${json.replace(/true/g, "True").replace(/false/g, "False")},` : ""}\n)\nprint(res.status_code, res.json())`,
    },
    {
      label: "JavaScript",
      lang: "javascript",
      code: `const res = await fetch("${url}", {\n  method: "${method.toUpperCase()}",\n  headers: {${needsAuth ? "\n    Authorization: `Bearer ${process.env.INRENT_API_KEY}`," : ""}${json ? '\n    "Content-Type": "application/json",' : ""}\n  },${json ? `\n  body: JSON.stringify(${json}),` : ""}\n});\nconsole.log(res.status, await res.json());`,
    },
  ];
}

export default function ApiReferencePage() {
  const ops: Array<{ method: string; path: string; op: Operation }> = [];
  for (const [path, item] of Object.entries(OPENAPI_SPEC.paths)) {
    for (const [method, op] of Object.entries(item as Record<string, Operation>)) ops.push({ method, path, op });
  }
  const tags = OPENAPI_SPEC.tags.map((t) => t.name);
  return (
    <div className="max-w-4xl">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.14em] text-accent">Reference</div>
      <h1 className="text-display text-4xl text-fg">API reference</h1>
      <p className="mt-3 text-fg-muted">
        Base URL <code className="rounded border border-border bg-surface-2 px-1.5 py-0.5 font-mono text-[13px] text-fg">{site.apiBaseUrl}</code>. Authenticate with <code className="font-mono text-fg">Authorization: Bearer sk-inrent-…</code>. The machine-readable spec is served at{" "}
        <a className="text-accent hover:underline" href={`${site.apiBaseUrl.replace(/\/v1$/, "")}/openapi.json`}>
          /openapi.json
        </a>
        .
      </p>
      <nav aria-label="Endpoints" className="mt-8 grid gap-1 rounded-xl border border-border bg-surface p-4 sm:grid-cols-2">
        {ops.map(({ method, path, op }) => (
          <a key={op.operationId} href={`#${op.operationId}`} className="flex items-center gap-2 rounded px-2 py-1 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
            <span className={`w-14 rounded border px-1 text-center font-mono text-[10px] uppercase ${METHOD_STYLE[method]}`}>{method}</span>
            <span className="font-mono">{path}</span>
          </a>
        ))}
      </nav>

      {tags.map((tag) => (
        <section key={tag} className="mt-14">
          <h2 className="border-b border-border pb-2 text-xl font-semibold text-fg">{tag}</h2>
          {ops
            .filter((o) => o.op.tags?.includes(tag))
            .map(({ method, path, op }) => {
              const needsAuth = !(op.security && op.security.length === 0);
              const bodySchema = op.requestBody?.content["application/json"]?.schema;
              const example = EXAMPLES[op.operationId];
              return (
                <article key={op.operationId} id={op.operationId} className="scroll-mt-24 border-b border-border py-10 last:border-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className={`rounded border px-2 py-0.5 font-mono text-[11px] uppercase ${METHOD_STYLE[method]}`}>{method}</span>
                    <code className="font-mono text-[15px] text-fg">{path}</code>
                    {!needsAuth ? <Badge variant="outline">No key required</Badge> : null}
                  </div>
                  <h3 className="mt-3 text-lg font-semibold text-fg">{op.summary}</h3>
                  {op.description ? <p className="mt-1 text-sm text-fg-muted">{op.description}</p> : null}
                  {op.parameters?.length ? (
                    <div className="mt-5">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">Parameters</div>
                      <ul className="flex flex-col gap-1 text-sm">
                        {op.parameters.map((p) => (
                          <li key={p.name} className="text-fg-muted">
                            <code className="font-mono text-fg">{p.name}</code> <span className="text-fg-subtle">({p.in}{p.required ? ", required" : ""})</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {bodySchema ? (
                    <div className="mt-5">
                      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">Request body</div>
                      <Fields schema={bodySchema} />
                    </div>
                  ) : null}
                  <div className="mt-5">
                    <div className="mb-2 text-xs font-medium uppercase tracking-wider text-fg-subtle">Responses</div>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(op.responses).map(([code, r]) => (
                        <span key={code} className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-fg-muted" title={r.description}>
                          <span className={code.startsWith("2") ? "font-mono text-accent" : "font-mono text-danger"}>{code}</span> {r.description}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 grid gap-4">
                    <CodeTabs tabs={samples(method, path, op.operationId, needsAuth)} />
                    <details className="group">
                      <summary className="cursor-pointer text-sm text-accent">Try it</summary>
                      <div className="mt-3">
                        <TryIt method={method.toUpperCase()} path={path.replace("{model}", "inrent/auto").replace("{id}", "")} apiBase={site.apiBaseUrl} exampleBody={example ? JSON.stringify(example, null, 2) : undefined} needsAuth={needsAuth} />
                      </div>
                    </details>
                  </div>
                </article>
              );
            })}
        </section>
      ))}

      <section className="mt-14">
        <h2 className="border-b border-border pb-2 text-xl font-semibold text-fg">Errors</h2>
        <p className="mt-3 text-sm text-fg-muted">
          All errors share one shape: <code className="font-mono text-fg">{`{ "error": { "type", "code", "message", "param", "request_id" } }`}</code>.
        </p>
        <div className="mt-4 overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wider text-fg-subtle">
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Meaning</th>
                <th className="px-3 py-2">How to fix</th>
              </tr>
            </thead>
            <tbody>
              {ERROR_CATALOG.map((e) => (
                <tr key={e.code} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-mono text-fg-subtle">{e.status}</td>
                  <td className="px-3 py-2 font-mono text-fg">{e.code}</td>
                  <td className="px-3 py-2 text-fg-muted">{e.what}</td>
                  <td className="px-3 py-2 text-fg-muted">{e.fix}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
