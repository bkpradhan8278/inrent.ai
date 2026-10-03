import { InrentError } from "./errors";
import type { ResponseMeta } from "./meta";

/** Parses a text/event-stream body into `data:` payloads (one per event). */
export async function* parseSSE(body: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      if (signal?.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r?\n\r?\n/)) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx).replace(/^\r?\n\r?\n/, "");
        const data = raw
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (data) yield data;
      }
    }
    buffer += decoder.decode();
    const tail = buffer
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).replace(/^ /, ""))
      .join("\n");
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Async-iterable stream of parsed events. Iterate with `for await`; call `abort()` to stop early.
 * Errors sent mid-stream by the gateway (`{"error": …}`) are thrown as `InrentError`.
 */
export class Stream<T> implements AsyncIterable<T> {
  readonly _meta: ResponseMeta;
  private consumed = false;

  constructor(
    private readonly response: Response,
    private readonly controller: AbortController,
    meta: ResponseMeta,
  ) {
    this._meta = meta;
  }

  abort() {
    this.controller.abort();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {
    if (this.consumed) throw new Error("A stream can only be iterated once.");
    this.consumed = true;
    if (!this.response.body) return;
    try {
      for await (const data of parseSSE(this.response.body, this.controller.signal)) {
        if (data === "[DONE]") return;
        let parsed: unknown;
        try {
          parsed = JSON.parse(data);
        } catch {
          continue;
        }
        const err = (parsed as { error?: { type?: string; code?: string; message?: string } }).error;
        if (err && typeof err === "object") {
          throw new InrentError({ status: 200, code: err.code ?? "stream_error", type: err.type ?? "api_error", message: err.message ?? "The stream ended with an error.", requestId: this._meta.requestId, retryable: false });
        }
        yield parsed as T;
      }
    } catch (e) {
      if (this.controller.signal.aborted && !(e instanceof InrentError)) return;
      throw e;
    }
  }

  /** Collects the streamed text deltas of a chat completion into one string. */
  async text(): Promise<string> {
    let out = "";
    for await (const chunk of this as AsyncIterable<unknown>) {
      const c = chunk as { choices?: Array<{ delta?: { content?: string | null } }> };
      out += c.choices?.[0]?.delta?.content ?? "";
    }
    return out;
  }
}
