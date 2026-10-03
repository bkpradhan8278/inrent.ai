import { describe, expect, it } from "vitest";
import { chatCompletionRequestSchema, describeZodError, embeddingRequestSchema } from "../src/schemas/requests";
import { estimateMessagesTokens, estimateTextTokens } from "../src/tokens";
import { buildWebhookEvent, webhookRetryDelayMs } from "../src/webhookEvents";
import { ulid, newRequestId, randomBase62 } from "../src/ids";

describe("request schemas", () => {
  it("accepts a standard chat request and strips unknown fields", () => {
    const parsed = chatCompletionRequestSchema.parse({
      model: "openai/gpt-4.1",
      messages: [{ role: "user", content: "Hello" }],
      temperature: 0.2,
      evil_param: "drop me",
    });
    expect(parsed.messages[0]?.content).toBe("Hello");
    expect("evil_param" in parsed).toBe(false);
  });

  it("accepts multimodal content, tools and structured output", () => {
    const r = chatCompletionRequestSchema.safeParse({
      model: "m",
      messages: [
        { role: "user", content: [{ type: "text", text: "What is this?" }, { type: "image_url", image_url: { url: "https://x/y.png" } }] },
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "f", arguments: "{}" } }] },
        { role: "tool", content: "42", tool_call_id: "c1" },
      ],
      tools: [{ type: "function", function: { name: "f", parameters: { type: "object" } } }],
      response_format: { type: "json_schema", json_schema: { name: "out", schema: { type: "object" } } },
      inrent: { route: "lowest_cost", providers: { order: ["groq"], allow_fallbacks: true } },
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid requests with a useful param", () => {
    const r = chatCompletionRequestSchema.safeParse({ model: "m", messages: [], temperature: 5 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const d = describeZodError(r.error);
      expect(d.param).toBe("messages");
    }
    const r2 = chatCompletionRequestSchema.safeParse({ model: "m", messages: [{ role: "user", content: "x" }], temperature: 5 });
    expect(r2.success).toBe(false);
    if (!r2.success) expect(describeZodError(r2.error).param).toBe("temperature");
  });

  it("validates embeddings input", () => {
    expect(embeddingRequestSchema.safeParse({ model: "m", input: ["a", "b"] }).success).toBe(true);
    expect(embeddingRequestSchema.safeParse({ model: "m", input: [] }).success).toBe(false);
  });
});

describe("helpers", () => {
  it("estimates tokens", () => {
    expect(estimateTextTokens("")).toBe(0);
    expect(estimateTextTokens("abcd".repeat(10))).toBe(10);
    expect(estimateMessagesTokens([{ content: "abcd" }])).toBeGreaterThan(1);
  });

  it("builds webhook events and backoff", () => {
    const evt = buildWebhookEvent("credit.low", "org-1", { balance_usd: "1.00" }, new Date(1_700_000_000_000));
    expect(evt.id).toMatch(/^evt_/);
    expect(evt.created).toBe(1_700_000_000);
    expect(webhookRetryDelayMs(1)).toBeLessThan(webhookRetryDelayMs(3));
    expect(webhookRetryDelayMs(99)).toBe(21_600_000);
  });

  it("generates sortable ids and random strings", () => {
    const a = ulid(1_000);
    const b = ulid(2_000);
    expect(a < b).toBe(true);
    expect(newRequestId()).toMatch(/^req_[0-9A-Z]{26}$/);
    expect(randomBase62(40)).toMatch(/^[0-9A-Za-z]{40}$/);
  });
});
