"use client";

import { Loader2, Play } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { useStoredValue } from "@/lib/hooks";

const KEY_STORAGE = "inrent:try-it-key";

/**
 * Interactive request runner. The key lives only in this tab's sessionStorage and is sent
 * directly from the browser to the API (the gateway allows CORS for bearer requests).
 */
export function TryIt({ method, path, apiBase, exampleBody, needsAuth }: { method: string; path: string; apiBase: string; exampleBody?: string; needsAuth: boolean }) {
  const storedKey = useStoredValue("session", KEY_STORAGE, "inrent:try-key");
  const [editedKey, setKey] = useState<string | null>(null);
  const key = editedKey ?? storedKey;
  const [body, setBody] = useState(exampleBody ?? "");
  const [pathValue, setPathValue] = useState(path);
  const [result, setResult] = useState<{ status: number; ms: number; headers: string; body: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    setResult(null);
    const started = performance.now();
    try {
      const res = await fetch(`${apiBase}${pathValue}`, {
        method,
        headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), ...(body && method !== "GET" ? { "content-type": "application/json" } : {}) },
        body: method !== "GET" && method !== "DELETE" && body ? body : undefined,
      });
      const text = await res.text();
      let pretty = text;
      try {
        pretty = JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        /* streamed or plain text */
      }
      const hs = ["x-request-id", "x-inrent-provider", "x-inrent-cost-usd", "x-ratelimit-remaining-requests"].map((h) => (res.headers.get(h) ? `${h}: ${res.headers.get(h)}` : null)).filter(Boolean).join("\n");
      setResult({ status: res.status, ms: Math.round(performance.now() - started), headers: hs, body: pretty.slice(0, 20_000) });
    } catch (e) {
      setResult({ status: 0, ms: Math.round(performance.now() - started), headers: "", body: `Network error: ${(e as Error).message}. Is ${apiBase} reachable from your browser?` });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4">
      <div className="grid gap-3">
        {needsAuth ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`key-${path}`}>API key</Label>
            <Input
              id={`key-${path}`}
              type="password"
              autoComplete="off"
              placeholder="sk-inrent-…"
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                try {
                  sessionStorage.setItem(KEY_STORAGE, e.target.value);
                } catch {
                  /* ignore */
                }
              }}
            />
          </div>
        ) : null}
        {path.includes("{") ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`path-${path}`}>Path</Label>
            <Input id={`path-${path}`} value={pathValue} onChange={(e) => setPathValue(e.target.value)} className="font-mono" />
          </div>
        ) : null}
        {exampleBody !== undefined ? (
          <div className="grid gap-1.5">
            <Label htmlFor={`body-${path}`}>Body</Label>
            <Textarea id={`body-${path}`} value={body} onChange={(e) => setBody(e.target.value)} className="min-h-36 font-mono text-[12px]" spellCheck={false} />
          </div>
        ) : null}
        <Button onClick={run} disabled={loading || (needsAuth && !key)} size="sm" className="w-fit">
          {loading ? <Loader2 className="animate-spin" /> : <Play />} Send request
        </Button>
      </div>
      {result ? (
        <div className="mt-4 overflow-hidden rounded-md border border-border">
          <div className="flex items-center gap-3 border-b border-border bg-surface px-3 py-1.5 font-mono text-[11px]">
            <span className={result.status >= 200 && result.status < 300 ? "text-accent" : "text-danger"}>{result.status || "ERR"}</span>
            <span className="text-fg-subtle">{result.ms} ms</span>
          </div>
          {result.headers ? <pre className="border-b border-border px-3 py-2 font-mono text-[11px] text-fg-subtle">{result.headers}</pre> : null}
          <pre className="max-h-80 overflow-auto px-3 py-2 font-mono text-[11.5px] leading-relaxed text-fg-muted">{result.body}</pre>
        </div>
      ) : null}
    </div>
  );
}
