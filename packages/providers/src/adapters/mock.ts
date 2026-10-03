import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatMessage,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@inrent/core";
import { estimateMessagesTokens, estimateTextTokens, InrentError, newCompletionId } from "@inrent/core";
import type { CallOptions, ChatStream, HealthResult, ProviderAdapter, ProviderConfig, UpstreamChatRequest } from "../types";

/**
 * Deterministic development/test provider. It never calls a real model and is refused by
 * the policy engine in production. Behaviour is configurable through the base URL:
 *
 *   mock://local?fail=always|rate_limit|timeout|auth|bad_request&delay=15
 *
 * and, for manual testing in development, through prompt directives: "[[mock:fail]]".
 */

type FailMode = "never" | "always" | "rate_limit" | "timeout" | "auth" | "bad_request";

function parseConfig(baseUrl: string): { fail: FailMode; delayMs: number } {
  try {
    const url = new URL(baseUrl);
    const fail = (url.searchParams.get("fail") ?? "never") as FailMode;
    const delayMs = Number(url.searchParams.get("delay") ?? "12");
    return { fail, delayMs: Number.isFinite(delayMs) ? delayMs : 12 };
  } catch {
    return { fail: "never", delayMs: 12 };
  }
}

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content.map((p) => (p.type === "text" ? p.text : `[${p.type}]`)).join(" ");
    }
  }
  return "";
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (ms <= 0) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      const e = new Error("Aborted");
      e.name = "AbortError";
      reject(e);
    });
  });

export class MockAdapter implements ProviderAdapter {
  readonly slug: string;
  readonly type = "MOCK" as const;
  private readonly fail: FailMode;
  private readonly delayMs: number;

  constructor(config: ProviderConfig) {
    this.slug = config.slug;
    const parsed = parseConfig(config.baseUrl);
    this.fail = parsed.fail;
    this.delayMs = parsed.delayMs;
  }

  private maybeFail(prompt: string): void {
    const directive = /\[\[mock:(fail|rate_limit|timeout|auth|bad_request)\]\]/.exec(prompt)?.[1];
    const mode: FailMode = directive ? (directive === "fail" ? "always" : (directive as FailMode)) : this.fail;
    switch (mode) {
      case "always":
        throw new InrentError("provider_error", "upstream_error", `${this.slug}: simulated upstream failure`, {
          retryable: true,
          status: 502,
          details: { provider: this.slug, upstream_status: 500 },
        });
      case "rate_limit":
        throw new InrentError("provider_error", "upstream_rate_limited", `${this.slug} is rate limiting requests.`, {
          retryable: true,
          status: 429,
          details: { provider: this.slug, upstream_status: 429 },
        });
      case "timeout":
        throw new InrentError("timeout_error", "upstream_timeout", `${this.slug} did not respond in time.`, {
          retryable: true,
          details: { provider: this.slug },
        });
      case "auth":
        throw new InrentError("provider_error", "upstream_authentication_failed", `${this.slug} rejected the credential.`, {
          retryable: true,
          status: 502,
        });
      case "bad_request":
        throw new InrentError("invalid_request_error", "upstream_invalid_request", `${this.slug}: simulated invalid request`, {
          retryable: false,
        });
      default:
        return;
    }
  }

  private respond(req: UpstreamChatRequest): { content: string | null; toolCalls?: ChatMessage["tool_calls"]; finish: string } {
    const prompt = lastUserText(req.messages);
    if (req.tools?.length && (req.tool_choice === "required" || /\bcall\b.*\btool\b/i.test(prompt))) {
      const tool = req.tools[0]!;
      return {
        content: null,
        toolCalls: [{ id: `call_mock_${tool.function.name}`, type: "function", function: { name: tool.function.name, arguments: "{}" } }],
        finish: "tool_calls",
      };
    }
    if (req.response_format?.type === "json_object" || req.response_format?.type === "json_schema") {
      return { content: JSON.stringify({ mock: true, echo: prompt.slice(0, 200) }), finish: "stop" };
    }
    const echo = prompt.length > 280 ? `${prompt.slice(0, 280)}…` : prompt;
    const content = `This is a development mock response from INRENT — no real model was called. You said: "${echo}"`;
    const max = req.max_completion_tokens ?? req.max_tokens;
    if (max && estimateTextTokens(content) > max) {
      return { content: content.slice(0, max * 4), finish: "length" };
    }
    return { content, finish: "stop" };
  }

  async chat(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatCompletion> {
    this.maybeFail(lastUserText(req.messages));
    await sleep(this.delayMs, opts.signal);
    const r = this.respond(req);
    const promptTokens = estimateMessagesTokens(req.messages);
    const completionTokens = r.content ? estimateTextTokens(r.content) : 8;
    return {
      id: newCompletionId(),
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: req.model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: r.content, ...(r.toolCalls ? { tool_calls: r.toolCalls } : {}) },
          finish_reason: r.finish,
        },
      ],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens, total_tokens: promptTokens + completionTokens },
    };
  }

  async chatStream(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatStream> {
    this.maybeFail(lastUserText(req.messages));
    const started = performance.now();
    await sleep(this.delayMs, opts.signal);
    const ttfbMs = Math.round(performance.now() - started);
    const r = this.respond(req);
    const id = newCompletionId();
    const created = Math.floor(Date.now() / 1000);
    const delay = this.delayMs;
    const promptTokens = estimateMessagesTokens(req.messages);
    async function* iterate(): AsyncGenerator<ChatCompletionChunk> {
      const base = { id, object: "chat.completion.chunk" as const, created, model: req.model };
      yield { ...base, choices: [{ index: 0, delta: { role: "assistant", content: "" }, finish_reason: null }] };
      if (r.toolCalls) {
        for (const [index, tc] of r.toolCalls.entries()) {
          yield { ...base, choices: [{ index: 0, delta: { tool_calls: [{ index, ...tc }] }, finish_reason: null }] };
        }
      } else {
        const words = (r.content ?? "").split(/(?<=\s)/);
        for (const word of words) {
          await sleep(Math.min(delay, 25), opts.signal);
          yield { ...base, choices: [{ index: 0, delta: { content: word }, finish_reason: null }] };
        }
      }
      yield { ...base, choices: [{ index: 0, delta: {}, finish_reason: r.finish }] };
      const completion = r.content ? estimateTextTokens(r.content) : 8;
      yield { ...base, choices: [], usage: { prompt_tokens: promptTokens, completion_tokens: completion, total_tokens: promptTokens + completion } };
    }
    const it = iterate();
    return { ttfbMs, [Symbol.asyncIterator]: () => it };
  }

  async embeddings(req: EmbeddingRequest, opts: CallOptions): Promise<EmbeddingResponse> {
    const inputs = Array.isArray(req.input) ? req.input : [req.input];
    this.maybeFail(inputs.map((i) => (typeof i === "string" ? i : "")).join(" "));
    await sleep(this.delayMs, opts.signal);
    const dims = req.dimensions ?? 8;
    let tokens = 0;
    const data = inputs.map((input, index) => {
      const text = typeof input === "string" ? input : JSON.stringify(input);
      tokens += Math.max(1, estimateTextTokens(text));
      let h = 2166136261;
      for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
      const embedding = Array.from({ length: dims }, (_, d) => {
        const v = Math.sin(h * (d + 1)) * 0.5;
        return Number(v.toFixed(6));
      });
      return { object: "embedding" as const, index, embedding };
    });
    return { object: "list", data, model: req.model, usage: { prompt_tokens: tokens, total_tokens: tokens } };
  }

  async listModels(): Promise<Array<{ id: string }>> {
    return [{ id: "mock-echo" }, { id: "mock-embed" }];
  }

  async healthCheck(): Promise<HealthResult> {
    return this.fail === "never" ? { ok: true, latencyMs: this.delayMs } : { ok: false, latencyMs: this.delayMs, error: "simulated failure" };
  }
}
