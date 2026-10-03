import { describe, expect, it } from "vitest";
import { parseSse } from "../src/sse";
import { sseStream } from "./helpers";

describe("SSE parser", () => {
  it("parses events split across arbitrary chunk boundaries", async () => {
    const stream = sseStream(['data: {"a":1}\n\n', ": comment\n", "event: ping\ndata: x\n\n", "data: line1\ndata: line2\r\n\r\n", "data: [DONE]\n\n"], 3);
    const events = [];
    for await (const e of parseSse(stream)) events.push(e);
    expect(events).toEqual([
      { event: null, data: '{"a":1}' },
      { event: "ping", data: "x" },
      { event: null, data: "line1\nline2" },
      { event: null, data: "[DONE]" },
    ]);
  });

  it("flushes a trailing event without a blank line", async () => {
    const events = [];
    for await (const e of parseSse(sseStream(["data: tail"]))) events.push(e);
    expect(events).toEqual([{ event: null, data: "tail" }]);
  });

  it("times out idle streams", async () => {
    const stream = new ReadableStream<Uint8Array>({ start() {} });
    await expect(async () => {
      for await (const _ of parseSse(stream, { idleTimeoutMs: 20 })) void _;
    }).rejects.toThrow(/idle/);
  });
});
