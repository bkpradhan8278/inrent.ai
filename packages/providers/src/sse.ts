/**
 * Minimal, spec-compliant Server-Sent Events parser over a byte stream.
 * Yields one record per event with the concatenated `data` lines.
 */
export interface SseEvent {
  event: string | null;
  data: string;
}

export async function* parseSse(
  body: ReadableStream<Uint8Array>,
  opts: { idleTimeoutMs?: number; signal?: AbortSignal } = {},
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let event: string | null = null;
  let data: string[] = [];

  const readWithTimeout = async () => {
    if (!opts.idleTimeoutMs) return reader.read();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const e = new Error("Stream idle timeout");
        e.name = "TimeoutError";
        reject(e);
      }, opts.idleTimeoutMs);
    });
    try {
      return await Promise.race([reader.read(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    while (true) {
      if (opts.signal?.aborted) {
        const e = new Error("Aborted");
        e.name = "AbortError";
        throw e;
      }
      const { done, value } = await readWithTimeout();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx: number;
      while ((idx = buffer.search(/\r\n|\r|\n/)) !== -1) {
        const line = buffer.slice(0, idx);
        const nl = buffer[idx] === "\r" && buffer[idx + 1] === "\n" ? 2 : 1;
        buffer = buffer.slice(idx + nl);
        if (line === "") {
          if (data.length) yield { event, data: data.join("\n") };
          event = null;
          data = [];
          continue;
        }
        if (line.startsWith(":")) continue;
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value2 = colon === -1 ? "" : line.slice(colon + 1);
        if (value2.startsWith(" ")) value2 = value2.slice(1);
        if (field === "data") data.push(value2);
        else if (field === "event") event = value2;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim().startsWith("data:")) data.push(buffer.trim().slice(5).trimStart());
    if (data.length) yield { event, data: data.join("\n") };
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* already closed */
    }
    reader.releaseLock();
  }
}
