import { describe, expect, it } from "vitest";
import { AnthropicAdapter, fromAnthropicResponse, toAnthropicRequest } from "../src/adapters/anthropic";
import { fakeFetch, sseStream } from "./helpers";

describe("Anthropic translation", () => {
  it("translates system, tools, images and tool results", () => {
    const body = toAnthropicRequest({
      model: "claude",
      temperature: 1.6,
      stop: "END",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: [{ type: "text", text: "What?" }, { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } }] },
        { role: "assistant", content: null, tool_calls: [{ id: "t1", type: "function", function: { name: "lookup", arguments: '{"q":"x"}' } }] },
        { role: "tool", tool_call_id: "t1", content: "result" },
        { role: "user", content: "thanks" },
      ],
      tools: [{ type: "function", function: { name: "lookup", parameters: { type: "object" } } }],
      tool_choice: "required",
    });
    expect(body.system).toBe("Be brief.");
    expect(body.temperature).toBe(1);
    expect(body.max_tokens).toBe(4096);
    expect(body.stop_sequences).toEqual(["END"]);
    expect(body.tool_choice).toEqual({ type: "any" });
    const messages = body.messages as Array<{ role: string; content: Array<Record<string, unknown>> }>;
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0]?.content[1]).toEqual({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });
    expect(messages[1]?.content[0]).toEqual({ type: "tool_use", id: "t1", name: "lookup", input: { q: "x" } });
    // tool_result and the following user text merge into one user turn
    expect(messages[2]?.content).toEqual([
      { type: "tool_result", tool_use_id: "t1", content: "result" },
      { type: "text", text: "thanks" },
    ]);
  });

  it("maps responses, tool use, stop reasons and cached usage", () => {
    const out = fromAnthropicResponse(
      {
        id: "msg",
        model: "claude",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "t2", name: "lookup", input: { q: 1 } },
        ],
        stop_reason: "tool_use",
        usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90 },
      },
      "anthropic/claude",
    );
    expect(out.choices[0]?.finish_reason).toBe("tool_calls");
    expect(out.choices[0]?.message.tool_calls?.[0]?.function).toEqual({ name: "lookup", arguments: '{"q":1}' });
    expect(out.usage).toMatchObject({ prompt_tokens: 100, completion_tokens: 5, prompt_tokens_details: { cached_tokens: 90 } });
  });

  it("maps streaming events to OpenAI chunks with usage", async () => {
    const ev = (o: unknown) => `event: x\ndata: ${JSON.stringify(o)}\n\n`;
    const { impl, calls } = fakeFetch(
      () =>
        new Response(
          sseStream([
            ev({ type: "message_start", message: { usage: { input_tokens: 12 } } }),
            ev({ type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }),
            ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hi " } }),
            ev({ type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "there" } }),
            ev({ type: "content_block_start", index: 1, content_block: { type: "tool_use", id: "t", name: "f" } }),
            ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: '{"a":' } }),
            ev({ type: "content_block_delta", index: 1, delta: { type: "input_json_delta", partial_json: "1}" } }),
            ev({ type: "message_delta", delta: { stop_reason: "tool_use" }, usage: { output_tokens: 7 } }),
            ev({ type: "message_stop" }),
          ]),
        ),
    );
    const adapter = new AnthropicAdapter({ slug: "anthropic", adapter: "ANTHROPIC", baseUrl: "https://api.anthropic.test", apiKey: "k", fetchImpl: impl });
    const stream = await adapter.chatStream({ model: "claude", messages: [{ role: "user", content: "x" }] }, { requestId: "r" });
    const chunks = [];
    for await (const c of stream) chunks.push(c);
    const text = chunks.map((c) => c.choices[0]?.delta.content ?? "").join("");
    expect(text).toBe("Hi there");
    const args = chunks.flatMap((c) => c.choices[0]?.delta.tool_calls ?? []).map((t) => t.function?.arguments ?? "").join("");
    expect(args).toBe('{"a":1}');
    expect(chunks.find((c) => c.choices[0]?.finish_reason)?.choices[0]?.finish_reason).toBe("tool_calls");
    expect(chunks.at(-1)?.usage).toMatchObject({ prompt_tokens: 12, completion_tokens: 7 });
    expect((calls[0]?.init.headers as Record<string, string>)["x-api-key"]).toBe("k");
    expect(calls[0]?.url).toBe("https://api.anthropic.test/v1/messages");
  });
});
