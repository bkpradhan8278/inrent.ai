import { describe, expect, it, vi } from "vitest";
import { Inrent, InrentError, InrentTimeoutError, parseSSE } from "../src";

type Call = { url: string; init: RequestInit };

function fakeFetch(responses: Array<Response | Error | (() => Response | Promise<Response>)>) {
  const calls: Call[] = [];
  const fn = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (!next) throw new Error("no more responses");
    if (next instanceof Error) throw next;
    return typeof next === "function" ? next() : next;
  });
  return { fetch: fn, calls };
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const completion = { id: "chatcmpl-1", object: "chat.completion", created: 1, model: "inrent/mock-echo", choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }], usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 } };

function sse(events: string[], headers: Record<string, string> = {}) {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      // Split mid-event to exercise buffering.
      const text = events.map((e) => `data: ${e}\n\n`).join("");
      const mid = Math.floor(text.length / 2);
      c.enqueue(enc.encode(text.slice(0, mid)));
      c.enqueue(enc.encode(text.slice(mid)));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream", ...headers } });
}

describe("Inrent client", () => {
  it("requires an API key", () => {
    const prev = process.env.INRENT_API_KEY;
    delete process.env.INRENT_API_KEY;
    expect(() => new Inrent({ fetch: fakeFetch([]).fetch })).toThrow(/Missing API key/);
    if (prev) process.env.INRENT_API_KEY = prev;
  });

  it("sends auth, base URL and JSON body; exposes _meta from headers", async () => {
    const f = fakeFetch([json(completion, 200, { "x-request-id": "req_abc", "x-inrent-provider": "mock", "x-inrent-fallbacks": "1", "x-inrent-cost-usd": "0.000004", "x-inrent-billing-mode": "platform" })]);
    const client = new Inrent({ apiKey: "sk-test", baseURL: "http://gw.local/v1/", fetch: f.fetch });
    const r = await client.chat.completions.create({ model: "inrent/auto", messages: [{ role: "user", content: "hi" }], inrent: { route: "lowest_latency" } });
    expect(f.calls[0]!.url).toBe("http://gw.local/v1/chat/completions");
    const headers = f.calls[0]!.init.headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer sk-test");
    expect(JSON.parse(String(f.calls[0]!.init.body))).toMatchObject({ model: "inrent/auto", inrent: { route: "lowest_latency" } });
    expect(r.choices[0]!.message.content).toBe("hi");
    expect(r._meta).toMatchObject({ requestId: "req_abc", provider: "mock", fallbacks: 1, costUsd: "0.000004", billingMode: "platform", status: 200 });
    // _meta is not enumerable, so the result serializes like the raw API response.
    expect(Object.keys(r)).not.toContain("_meta");
    expect(JSON.parse(JSON.stringify(r))).toEqual(completion);
  });

  it("retries 429 honouring retry-after, then succeeds", async () => {
    const f = fakeFetch([json({ error: { type: "rate_limit_error", code: "rate_limit_exceeded", message: "slow down" } }, 429, { "retry-after": "0" }), json(completion)]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch });
    const r = await client.chat.completions.create({ model: "m", messages: [] });
    expect(r.id).toBe("chatcmpl-1");
    expect(f.calls).toHaveLength(2);
  });

  it("retries connection errors and 5xx up to maxRetries", async () => {
    const f = fakeFetch([new TypeError("fetch failed"), json({ error: { code: "upstream_error", message: "x" } }, 502, { "retry-after": "0" }), json({ error: { code: "upstream_error", message: "x" } }, 503, { "retry-after": "0" })]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch, maxRetries: 2 });
    const err = await client.models.list().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InrentError);
    expect((err as InrentError).status).toBe(503);
    expect(f.calls).toHaveLength(3);
  });

  it("does not retry 4xx and parses the error envelope", async () => {
    const f = fakeFetch([json({ error: { type: "invalid_request_error", code: "model_not_found", message: "No such model", param: "model", request_id: "req_err" } }, 404)]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch });
    const err = (await client.chat.completions.create({ model: "nope/model", messages: [] }).catch((e: unknown) => e)) as InrentError;
    expect(err).toBeInstanceOf(InrentError);
    expect({ status: err.status, code: err.code, type: err.type, param: err.param, requestId: err.requestId, retryable: err.retryable }).toEqual({ status: 404, code: "model_not_found", type: "invalid_request_error", param: "model", requestId: "req_err", retryable: false });
    expect(f.calls).toHaveLength(1);
  });

  it("402 insufficient credits is surfaced without retries", async () => {
    const f = fakeFetch([json({ error: { type: "insufficient_credits_error", code: "insufficient_credits", message: "Add credits" } }, 402)]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch });
    await expect(client.chat.completions.create({ model: "m", messages: [] })).rejects.toMatchObject({ status: 402, code: "insufficient_credits" });
    expect(f.calls).toHaveLength(1);
  });

  it("times out slow requests", async () => {
    const f = { fetch: (_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))) };
    const client = new Inrent({ apiKey: "k", fetch: f.fetch, timeout: 30, maxRetries: 0 });
    await expect(client.models.list()).rejects.toBeInstanceOf(InrentTimeoutError);
  });

  it("respects a caller abort signal without retrying", async () => {
    const controller = new AbortController();
    const fetch = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))));
    const client = new Inrent({ apiKey: "k", fetch, maxRetries: 3 });
    const p = client.models.list({ signal: controller.signal });
    controller.abort();
    await expect(p).rejects.toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("streams chat chunks, requests usage and stops at [DONE]", async () => {
    const chunk = (content: string) => JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [{ index: 0, delta: { content }, finish_reason: null }] });
    const usage = JSON.stringify({ id: "c", object: "chat.completion.chunk", created: 1, model: "m", choices: [], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } });
    const f = fakeFetch([sse([chunk("Hel"), chunk("lo"), usage, "[DONE]", chunk("ignored")], { "x-request-id": "req_s" })]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch });
    const stream = await client.chat.completions.create({ model: "m", messages: [{ role: "user", content: "x" }], stream: true });
    expect(stream._meta.requestId).toBe("req_s");
    expect(JSON.parse(String(f.calls[0]!.init.body)).stream_options).toEqual({ include_usage: true });
    let text = "";
    let total = 0;
    for await (const c of stream) {
      text += c.choices[0]?.delta.content ?? "";
      if (c.usage) total = c.usage.total_tokens;
    }
    expect(text).toBe("Hello");
    expect(total).toBe(3);
  });

  it("throws mid-stream gateway errors as InrentError", async () => {
    const f = fakeFetch([sse([JSON.stringify({ choices: [{ index: 0, delta: { content: "a" } }] }), JSON.stringify({ error: { type: "api_error", code: "upstream_error", message: "provider dropped" } })], { "x-request-id": "req_x" })]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch });
    const stream = await client.chat.completions.create({ model: "m", messages: [], stream: true });
    await expect(stream.text()).rejects.toMatchObject({ code: "upstream_error", requestId: "req_x" });
  });

  it("unwraps management endpoints", async () => {
    const f = fakeFetch([json({ data: { id: "k1", name: "ci", key: "sk-inrent-dev-xyz", prefix: "sk-inrent-dev-xy" } }, 201), json({ data: { days: 7, balance_usd: "1.000000" } })]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch });
    const created = await client.keys.create({ name: "ci", environment: "development" });
    expect(created.key).toBe("sk-inrent-dev-xyz");
    const usage = await client.usage.retrieve({ days: 7 });
    expect(usage.balance_usd).toBe("1.000000");
    expect(f.calls[1]!.url).toBe("https://api.inrent.ai/v1/usage?days=7");
  });

  it("encodes model slugs in retrieve", async () => {
    const f = fakeFetch([json({ id: "openai/gpt-4.1" })]);
    const client = new Inrent({ apiKey: "k", fetch: f.fetch, baseURL: "http://x/v1" });
    await client.models.retrieve("openai/gpt-4.1");
    expect(f.calls[0]!.url).toBe("http://x/v1/models/openai/gpt-4.1");
  });
});

describe("parseSSE", () => {
  it("handles CRLF, multi-line data and comments", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode(": keep-alive\r\n\r\ndata: a\r\ndata: b\r\n\r\ndata: c"));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of parseSSE(body)) out.push(d);
    expect(out).toEqual(["a\nb", "c"]);
  });
});
