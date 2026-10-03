import { describe, expect, it } from "vitest";
import { InrentError } from "@inrent/core";
import { OpenAICompatibleAdapter } from "../src/adapters/openaiCompatible";
import { redactSecrets } from "../src/errors";
import { fakeFetch, sseStream } from "./helpers";

const opts = { requestId: "req_test" };

function adapter(fetchImpl: typeof fetch) {
  return new OpenAICompatibleAdapter({ slug: "acme", adapter: "OPENAI_COMPATIBLE", baseUrl: "https://api.acme.test/v1/", apiKey: "sk-secret-123456", fetchImpl });
}

describe("OpenAI-compatible adapter", () => {
  it("sends authenticated chat requests and returns the completion", async () => {
    const { impl, calls } = fakeFetch(() =>
      Response.json({
        id: "c1",
        object: "chat.completion",
        created: 1,
        model: "m",
        choices: [{ index: 0, message: { role: "assistant", content: "hi" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 3, completion_tokens: 1, total_tokens: 4 },
      }),
    );
    const out = await adapter(impl).chat({ model: "m", messages: [{ role: "user", content: "hello" }] }, opts);
    expect(out.choices[0]?.message.content).toBe("hi");
    expect(calls[0]?.url).toBe("https://api.acme.test/v1/chat/completions");
    expect((calls[0]?.init.headers as Record<string, string>).authorization).toBe("Bearer sk-secret-123456");
    expect((calls[0]?.init.headers as Record<string, string>)["x-request-id"]).toBe("req_test");
    expect(calls[0]?.body).toMatchObject({ model: "m", stream: false });
  });

  it("streams chunks and requests usage", async () => {
    const { impl, calls } = fakeFetch(
      () =>
        new Response(
          sseStream([
            'data: {"id":"c","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"He"},"finish_reason":null}]}\n\n',
            'data: {"id":"c","object":"chat.completion.chunk","created":1,"model":"m","choices":[{"index":0,"delta":{"content":"llo"},"finish_reason":"stop"}]}\n\n',
            'data: {"id":"c","object":"chat.completion.chunk","created":1,"model":"m","choices":[],"usage":{"prompt_tokens":2,"completion_tokens":2,"total_tokens":4}}\n\n',
            "data: [DONE]\n\n",
          ]),
          { headers: { "content-type": "text/event-stream" } },
        ),
    );
    const stream = await adapter(impl).chatStream({ model: "m", messages: [{ role: "user", content: "x" }] }, opts);
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    expect(chunks.map((c) => c.choices[0]?.delta.content ?? "").join("")).toBe("Hello");
    expect(chunks.at(-1)?.usage?.total_tokens).toBe(4);
    expect(calls[0]?.body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
  });

  it("maps upstream errors and decides retryability", async () => {
    const cases: Array<[number, string, boolean]> = [
      [400, "upstream_invalid_request", false],
      [401, "upstream_authentication_failed", true],
      [404, "upstream_model_not_found", true],
      [429, "upstream_rate_limited", true],
      [500, "upstream_error", true],
      [503, "upstream_error", true],
    ];
    for (const [status, code, retryable] of cases) {
      const { impl } = fakeFetch(() => Response.json({ error: { message: "nope" } }, { status }));
      const err = await adapter(impl).chat({ model: "m", messages: [{ role: "user", content: "x" }] }, opts).catch((e) => e);
      expect(err).toBeInstanceOf(InrentError);
      expect(err.code).toBe(code);
      expect(err.retryable).toBe(retryable);
    }
  });

  it("never leaks credentials echoed by upstream errors", async () => {
    const { impl } = fakeFetch(() =>
      Response.json({ error: { message: "Incorrect API key provided: sk-proj-abcdef123456. Bearer abc.def" } }, { status: 400 }),
    );
    const err = await adapter(impl).chat({ model: "m", messages: [{ role: "user", content: "x" }] }, opts).catch((e) => e);
    expect(err.message).not.toContain("abcdef123456");
    expect(redactSecrets("key AIzaSyA-1234567890abcdefghijkl")).toContain("[redacted]");
  });

  it("maps network failures to retryable errors", async () => {
    const impl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    const err = await adapter(impl).chat({ model: "m", messages: [{ role: "user", content: "x" }] }, opts).catch((e) => e);
    expect(err.code).toBe("upstream_unreachable");
    expect(err.retryable).toBe(true);
  });

  it("supports embeddings and health checks", async () => {
    const { impl } = fakeFetch((url) =>
      url.endsWith("/models")
        ? Response.json({ data: [{ id: "m" }] })
        : Response.json({ object: "list", data: [{ object: "embedding", index: 0, embedding: [0.1] }], model: "e", usage: { prompt_tokens: 1, total_tokens: 1 } }),
    );
    const a = adapter(impl);
    expect((await a.embeddings({ model: "e", input: "x" }, opts)).data).toHaveLength(1);
    expect((await a.healthCheck(opts)).ok).toBe(true);
    expect(await a.listModels(opts)).toEqual([{ id: "m" }]);
  });
});
