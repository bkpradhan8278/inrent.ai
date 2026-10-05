"use client";

import { Code2, Copy, Eraser, Loader2, Save, Send, Share2, Square, Wrench } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FieldHint, Input, Label, NativeSelect, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { formatMs, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { readSse } from "./sse";

export interface PlaygroundModel {
  slug: string;
  name: string;
  availability: "platform" | "byok" | "unavailable";
  inputPrice: string | null;
  outputPrice: string | null;
  supportsTools: boolean;
}

interface Message {
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

interface Metrics {
  ttftMs: number | null;
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  costEstimated: boolean;
  requestId: string | null;
  provider: string | null;
  fallbacks: number | null;
}

const EMPTY_METRICS: Metrics = { ttftMs: null, latencyMs: null, inputTokens: null, outputTokens: null, costUsd: null, costEstimated: false, requestId: null, provider: null, fallbacks: null };

export interface PlaygroundState {
  model: string;
  system: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  stream: boolean;
  tools: string;
  schema: string;
  messages: Message[];
}

function buildBody(s: PlaygroundState, messages: Message[]) {
  const body: Record<string, unknown> = {
    model: s.model,
    messages: [...(s.system.trim() ? [{ role: "system", content: s.system }] : []), ...messages.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }))],
    temperature: s.temperature,
    max_tokens: s.maxTokens,
    top_p: s.topP,
    stream: s.stream,
    ...(s.stream ? { stream_options: { include_usage: true } } : {}),
  };
  if (s.tools.trim()) body.tools = JSON.parse(s.tools);
  if (s.schema.trim()) body.response_format = { type: "json_schema", json_schema: { name: "output", schema: JSON.parse(s.schema), strict: true } };
  return body;
}

function codeFor(lang: "curl" | "python" | "javascript" | "typescript", body: Record<string, unknown>, apiBase: string) {
  const json = JSON.stringify(body, null, 2);
  switch (lang) {
    case "curl":
      return `curl ${apiBase}/chat/completions \\\n  -H "Authorization: Bearer $INRENT_API_KEY" \\\n  -H "Content-Type: application/json" \\\n  -d '${json.replace(/'/g, "'\\''")}'`;
    case "python":
      return `import os\nfrom openai import OpenAI\n\nclient = OpenAI(base_url="${apiBase}", api_key=os.environ["INRENT_API_KEY"])\n\nresponse = client.chat.completions.create(**${json.replace(/true/g, "True").replace(/false/g, "False").replace(/null/g, "None")})\n${body.stream ? "for chunk in response:\n    print(chunk.choices[0].delta.content or \"\", end=\"\") if chunk.choices else None" : "print(response.choices[0].message.content)"}`;
    case "javascript":
      return `import OpenAI from "openai";\n\nconst client = new OpenAI({ baseURL: "${apiBase}", apiKey: process.env.INRENT_API_KEY });\n\nconst response = await client.chat.completions.create(${json});\n${body.stream ? "for await (const chunk of response) process.stdout.write(chunk.choices[0]?.delta?.content ?? \"\");" : "console.log(response.choices[0].message.content);"}`;
    case "typescript":
      return `import { Inrent } from "@inrent/sdk";\n\nconst client = new Inrent({ apiKey: process.env.INRENT_API_KEY! });\n\nconst response = await client.chat.completions.create(${json});\n${body.stream ? "for await (const chunk of response) process.stdout.write(chunk.choices[0]?.delta?.content ?? \"\");" : "console.log(response.choices[0]?.message.content);"}`;
  }
}

export function Playground({
  models,
  apiBase,
  signedIn,
  initial,
  compact = false,
  onSave,
  onShare,
}: {
  models: PlaygroundModel[];
  apiBase: string;
  signedIn: boolean;
  initial?: Partial<PlaygroundState>;
  compact?: boolean;
  onSave?: (name: string, state: PlaygroundState) => Promise<{ ok: boolean; error?: string }>;
  onShare?: (state: PlaygroundState) => Promise<{ ok: boolean; url?: string; error?: string }>;
}) {
  const defaultModel = initial?.model ?? models.find((m) => m.availability === "platform")?.slug ?? models[0]?.slug ?? "inrent/auto";
  const [state, setState] = useState<PlaygroundState>({
    model: defaultModel,
    system: initial?.system ?? "You are a helpful assistant.",
    temperature: initial?.temperature ?? 0.7,
    maxTokens: initial?.maxTokens ?? 512,
    topP: initial?.topP ?? 1,
    stream: initial?.stream ?? true,
    tools: initial?.tools ?? "",
    schema: initial?.schema ?? "",
    messages: initial?.messages ?? [],
  });
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState<Metrics>(EMPTY_METRICS);
  const [codeOpen, setCodeOpen] = useState(false);
  const [codeLang, setCodeLang] = useState<"curl" | "python" | "javascript" | "typescript">("curl");
  const [advanced, setAdvanced] = useState(Boolean(initial?.tools || initial?.schema));
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const model = models.find((m) => m.slug === state.model);

  const set = <K extends keyof PlaygroundState>(k: K, v: PlaygroundState[K]) => setState((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [state.messages]);

  const jsonError = useMemo(() => {
    for (const [label, value] of [
      ["Tools", state.tools],
      ["JSON schema", state.schema],
    ] as const) {
      if (!value.trim()) continue;
      try {
        JSON.parse(value);
      } catch {
        return `${label} must be valid JSON.`;
      }
    }
    return null;
  }, [state.tools, state.schema]);

  const estimateCost = useCallback(
    (inTok: number, outTok: number) => {
      if (!model?.inputPrice || !model.outputPrice) return null;
      return (inTok * Number(model.inputPrice) + outTok * Number(model.outputPrice)) / 1_000_000;
    },
    [model],
  );

  const send = async () => {
    const text = input.trim();
    if (!text || running) return;
    if (!signedIn) {
      toast.error("Sign in to run requests.");
      return;
    }
    if (jsonError) {
      toast.error(jsonError);
      return;
    }
    const messages: Message[] = [...state.messages, { role: "user", content: text }];
    setState((s) => ({ ...s, messages: [...messages, { role: "assistant", content: "" }] }));
    setInput("");
    setRunning(true);
    setMetrics(EMPTY_METRICS);
    const controller = new AbortController();
    abortRef.current = controller;
    const started = performance.now();
    let firstTokenAt: number | null = null;
    const update = (content: string, error = false) =>
      setState((s) => {
        const next = [...s.messages];
        next[next.length - 1] = { role: "assistant", content, error };
        return { ...s, messages: next };
      });
    try {
      const res = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildBody(state, messages)),
        signal: controller.signal,
      });
      const head: Partial<Metrics> = {
        requestId: res.headers.get("x-request-id"),
        provider: res.headers.get("x-inrent-provider"),
        fallbacks: res.headers.get("x-inrent-fallbacks") ? Number(res.headers.get("x-inrent-fallbacks")) : null,
      };
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const err = body?.error;
        update(`${err?.message ?? `Request failed (${res.status})`}${err?.code ? `\n\ncode: ${err.code}` : ""}`, true);
        setMetrics({ ...EMPTY_METRICS, ...head, requestId: head.requestId ?? err?.request_id ?? null, latencyMs: Math.round(performance.now() - started) });
        return;
      }
      if (state.stream && res.body) {
        let content = "";
        let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
        for await (const data of readSse(res.body)) {
          if (data === "[DONE]") break;
          const chunk = JSON.parse(data);
          if (chunk.error) {
            update(`${content}\n\n[stream error] ${chunk.error.message}`, true);
            break;
          }
          const delta = chunk.choices?.[0]?.delta;
          const piece = delta?.content ?? (delta?.tool_calls ? JSON.stringify(delta.tool_calls) : "");
          if (piece) {
            firstTokenAt ??= performance.now();
            content += piece;
            update(content);
          }
          if (chunk.usage) usage = chunk.usage;
        }
        const cost = usage ? estimateCost(usage.prompt_tokens, usage.completion_tokens) : null;
        setMetrics({
          ...EMPTY_METRICS,
          ...head,
          ttftMs: firstTokenAt ? Math.round(firstTokenAt - started) : null,
          latencyMs: Math.round(performance.now() - started),
          inputTokens: usage?.prompt_tokens ?? null,
          outputTokens: usage?.completion_tokens ?? null,
          costUsd: cost,
          costEstimated: true,
        });
      } else {
        const json = await res.json();
        const msg = json.choices?.[0]?.message;
        update(msg?.content ?? (msg?.tool_calls ? JSON.stringify(msg.tool_calls, null, 2) : ""));
        const latency = Math.round(performance.now() - started);
        const charged = res.headers.get("x-inrent-cost-usd");
        setMetrics({
          ...EMPTY_METRICS,
          ...head,
          ttftMs: latency,
          latencyMs: latency,
          inputTokens: json.usage?.prompt_tokens ?? null,
          outputTokens: json.usage?.completion_tokens ?? null,
          costUsd: charged ? Number(charged) : null,
          costEstimated: false,
        });
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") update("[stopped]", true);
      else update("Network error — could not reach the playground service.", true);
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const body = useMemo(() => {
    try {
      return buildBody(state, [...state.messages, ...(input.trim() ? [{ role: "user" as const, content: input.trim() }] : [])]);
    } catch {
      return { model: state.model, messages: [] };
    }
  }, [state, input]);

  return (
    <div className={cn("grid gap-4", compact ? "lg:grid-cols-[260px_1fr]" : "lg:grid-cols-[300px_1fr]")}>
      <div className="panel flex flex-col gap-5 rounded-xl p-4">
        <div className="grid gap-1.5">
          <Label htmlFor="pg-model">Model</Label>
          <NativeSelect id="pg-model" value={state.model} onChange={(e) => set("model", e.target.value)} disabled={compact && Boolean(initial?.model)}>
            {models.map((m) => (
              <option key={m.slug} value={m.slug}>
                {m.name}
                {m.availability === "byok" ? " (BYOK)" : m.availability === "unavailable" ? " (not enabled)" : ""}
              </option>
            ))}
          </NativeSelect>
          {model?.availability === "unavailable" ? <FieldHint className="text-amber">Not enabled yet — requests will return model_unavailable.</FieldHint> : null}
          {model?.availability === "byok" ? <FieldHint>Requires your own provider key (Dashboard → BYOK).</FieldHint> : null}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="pg-system">System prompt</Label>
          <Textarea id="pg-system" value={state.system} onChange={(e) => set("system", e.target.value)} className="min-h-20 text-[13px]" />
        </div>
        {(
          [
            ["temperature", "Temperature", 0, 2, 0.1],
            ["topP", "Top P", 0, 1, 0.05],
          ] as const
        ).map(([k, label, min, max, step]) => (
          <div key={k} className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`pg-${k}`}>{label}</Label>
              <span className="font-mono text-xs text-fg-muted">{state[k]}</span>
            </div>
            <input id={`pg-${k}`} type="range" min={min} max={max} step={step} value={state[k]} onChange={(e) => set(k, Number(e.target.value))} className="accent-accent" />
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="pg-max">Max tokens</Label>
          <Input id="pg-max" type="number" min={1} max={32000} value={state.maxTokens} onChange={(e) => set("maxTokens", Math.max(1, Number(e.target.value) || 1))} />
        </div>
        <label className="flex items-center justify-between text-[13px] text-fg">
          Streaming
          <Switch checked={state.stream} onCheckedChange={(v) => set("stream", v)} aria-label="Toggle streaming" />
        </label>
        <button type="button" onClick={() => setAdvanced((a) => !a)} className="flex items-center gap-2 text-left text-[13px] text-fg-muted hover:text-fg">
          <Wrench className="size-3.5" /> {advanced ? "Hide" : "Show"} tools & structured output
        </button>
        {advanced ? (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="pg-tools">Tools (JSON array)</Label>
              <Textarea id="pg-tools" value={state.tools} onChange={(e) => set("tools", e.target.value)} placeholder='[{"type":"function","function":{"name":"get_weather","parameters":{"type":"object","properties":{"city":{"type":"string"}}}}}]' className="min-h-24 font-mono text-[11.5px]" />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pg-schema">Structured output (JSON schema)</Label>
              <Textarea id="pg-schema" value={state.schema} onChange={(e) => set("schema", e.target.value)} placeholder='{"type":"object","properties":{"answer":{"type":"string"}},"required":["answer"]}' className="min-h-24 font-mono text-[11.5px]" />
            </div>
            {jsonError ? <p className="text-xs text-danger">{jsonError}</p> : null}
          </>
        ) : null}
      </div>

      <div className="panel flex min-h-[540px] flex-col overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="font-mono text-[12px] text-fg-muted">{state.model}</span>
          <div className="ml-auto flex flex-wrap items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => setCodeOpen(true)}>
              <Code2 /> Get code
            </Button>
            {onSave ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const name = window.prompt("Name this request", state.messages.find((m) => m.role === "user")?.content.slice(0, 40) ?? "Untitled");
                  if (!name) return;
                  const r = await onSave(name, state);
                  if (r.ok) toast.success("Request saved");
                  else toast.error(r.error ?? "Could not save");
                }}
              >
                <Save /> Save
              </Button>
            ) : null}
            {onShare ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  const r = await onShare(state);
                  if (r.ok && r.url) {
                    await navigator.clipboard.writeText(r.url).catch(() => undefined);
                    toast.success("Share link copied", { description: "Anyone in your organization with the link can open it." });
                  } else toast.error(r.error ?? "Could not share");
                }}
              >
                <Share2 /> Share
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(JSON.stringify({ request: body, transcript: state.messages }, null, 2)).catch(() => undefined);
                toast.success("Copied conversation as JSON");
              }}
            >
              <Copy /> Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setState((s) => ({ ...s, messages: [] }))} disabled={running || !state.messages.length}>
              <Eraser /> Clear
            </Button>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite">
          {state.messages.length === 0 ? (
            <div className="flex h-full min-h-60 flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm text-fg-muted">Send a message to test {model?.name ?? "a model"}.</p>
              {!signedIn ? (
                <p className="text-xs text-fg-subtle">
                  <Link href="/sign-in" className="text-accent hover:underline">
                    Sign in
                  </Link>{" "}
                  to run requests. Playground usage is billed like API usage.
                </p>
              ) : (
                <p className="text-xs text-fg-subtle">Playground requests use your active project and are billed like API requests.</p>
              )}
            </div>
          ) : (
            state.messages.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap rounded-xl px-4 py-2.5 text-[14px] leading-relaxed",
                    m.role === "user" ? "bg-surface-3 text-fg" : m.error ? "border border-danger/35 bg-danger-soft text-danger" : "border border-border bg-bg-elevated text-fg-muted",
                  )}
                >
                  {m.content || (running && i === state.messages.length - 1 ? <Loader2 className="size-4 animate-spin text-fg-subtle" /> : "")}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="grid grid-cols-3 gap-px border-t border-border bg-border text-[11px] sm:grid-cols-7">
          {[
            ["TTFT", formatMs(metrics.ttftMs)],
            ["Latency", formatMs(metrics.latencyMs)],
            ["Input", metrics.inputTokens === null ? "—" : formatNumber(metrics.inputTokens)],
            ["Output", metrics.outputTokens === null ? "—" : formatNumber(metrics.outputTokens)],
            ["Total", metrics.inputTokens === null ? "—" : formatNumber((metrics.inputTokens ?? 0) + (metrics.outputTokens ?? 0))],
            [metrics.costEstimated ? "Est. cost" : "Cost", metrics.costUsd === null ? "—" : `$${metrics.costUsd.toFixed(6)}`],
            ["Provider", metrics.provider ?? "—"],
          ].map(([k, v]) => (
            <div key={k} className="bg-surface px-3 py-2">
              <div className="uppercase tracking-wider text-fg-subtle">{k}</div>
              <div className="mt-0.5 truncate font-mono text-[12px] text-fg">{v}</div>
            </div>
          ))}
        </div>
        {metrics.requestId ? (
          <div className="flex items-center gap-2 border-t border-border bg-bg-elevated px-4 py-1.5 font-mono text-[11px] text-fg-subtle">
            request_id <span className="text-fg-muted">{metrics.requestId}</span>
            {metrics.fallbacks ? <Badge variant="amber">{metrics.fallbacks} fallback</Badge> : null}
          </div>
        ) : null}

        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={signedIn ? "Message… (Enter to send, Shift+Enter for a new line)" : "Sign in to send messages"}
            className="max-h-40 min-h-11 flex-1 resize-none"
            aria-label="Message"
          />
          {running ? (
            <Button type="button" variant="secondary" size="icon" onClick={() => abortRef.current?.abort()} aria-label="Stop">
              <Square />
            </Button>
          ) : (
            <Button type="submit" size="icon" disabled={!input.trim()} aria-label="Send">
              <Send />
            </Button>
          )}
        </form>
      </div>

      <Dialog open={codeOpen} onOpenChange={setCodeOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Get code</DialogTitle>
            <DialogDescription>This request as code. Replace $INRENT_API_KEY with a key from Dashboard → API Keys.</DialogDescription>
          </DialogHeader>
          <div className="flex gap-1">
            {(["curl", "python", "javascript", "typescript"] as const).map((l) => (
              <Button key={l} size="sm" variant={codeLang === l ? "secondary" : "ghost"} onClick={() => setCodeLang(l)}>
                {l === "curl" ? "cURL" : l[0]!.toUpperCase() + l.slice(1)}
              </Button>
            ))}
          </div>
          <div className="relative mt-3">
            <pre data-theme="dark" className="max-h-[50vh] overflow-auto rounded-lg border border-border bg-[#080a0e] p-4 font-mono text-[12px] leading-relaxed text-fg-muted">{codeFor(codeLang, body, apiBase)}</pre>
            <Button
              size="sm"
              variant="secondary"
              className="absolute right-2 top-2"
              onClick={async () => {
                await navigator.clipboard.writeText(codeFor(codeLang, body, apiBase)).catch(() => undefined);
                toast.success("Copied");
              }}
            >
              <Copy /> Copy
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
