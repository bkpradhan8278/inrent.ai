import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatMessage,
  ContentPart,
  ToolCall,
  Usage,
} from "@inrent/core";
import { InrentError, newCompletionId } from "@inrent/core";
import { networkError } from "../errors";
import { DEFAULT_STREAM_IDLE_MS, getJson, postJson, readJson } from "../http";
import { parseSse } from "../sse";
import type { CallOptions, ChatStream, HealthResult, ProviderAdapter, ProviderConfig, UpstreamChatRequest } from "../types";

/**
 * Native Anthropic Messages API adapter. Translates OpenAI-style chat requests to
 * /v1/messages and maps responses and streaming events back to the OpenAI shape.
 */

const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MAX_TOKENS = 4096;

type AnthropicBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } | { type: "url"; url: string } }
  | { type: "tool_use"; id: string; name: string; input: unknown }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicMessage {
  role: "user" | "assistant";
  content: AnthropicBlock[];
}

interface AnthropicResponse {
  id: string;
  model: string;
  content: Array<{ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: string }>;
  stop_reason: string | null;
  usage: AnthropicUsage;
}

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

function textOf(content: ChatMessage["content"]): string {
  if (content === null) return "";
  if (typeof content === "string") return content;
  return content
    .filter((p): p is Extract<ContentPart, { type: "text" }> => p.type === "text")
    .map((p) => p.text)
    .join("\n");
}

function toBlocks(content: ChatMessage["content"]): AnthropicBlock[] {
  if (content === null) return [];
  if (typeof content === "string") return content ? [{ type: "text", text: content }] : [];
  const blocks: AnthropicBlock[] = [];
  for (const part of content) {
    if (part.type === "text") blocks.push({ type: "text", text: part.text });
    else if (part.type === "image_url") {
      const url = part.image_url.url;
      const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
      blocks.push(
        m ? { type: "image", source: { type: "base64", media_type: m[1]!, data: m[2]! } } : { type: "image", source: { type: "url", url } },
      );
    } else {
      throw new InrentError("invalid_request_error", "unsupported_content", `Content type '${part.type}' is not supported by this provider.`, {
        retryable: true,
      });
    }
  }
  return blocks;
}

export function toAnthropicRequest(req: UpstreamChatRequest): Record<string, unknown> {
  const system: string[] = [];
  const messages: AnthropicMessage[] = [];
  const push = (role: "user" | "assistant", blocks: AnthropicBlock[]) => {
    if (blocks.length === 0) return;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else messages.push({ role, content: blocks });
  };

  for (const m of req.messages) {
    if (m.role === "system" || m.role === "developer") system.push(textOf(m.content));
    else if (m.role === "user") push("user", toBlocks(m.content));
    else if (m.role === "assistant") {
      const blocks = toBlocks(m.content);
      for (const tc of m.tool_calls ?? []) {
        let input: unknown = {};
        try {
          input = tc.function.arguments ? JSON.parse(tc.function.arguments) : {};
        } catch {
          input = { _raw: tc.function.arguments };
        }
        blocks.push({ type: "tool_use", id: tc.id, name: tc.function.name, input });
      }
      push("assistant", blocks);
    } else if (m.role === "tool") {
      push("user", [{ type: "tool_result", tool_use_id: m.tool_call_id ?? "", content: textOf(m.content) }]);
    }
  }

  const body: Record<string, unknown> = {
    model: req.model,
    messages,
    max_tokens: req.max_completion_tokens ?? req.max_tokens ?? DEFAULT_MAX_TOKENS,
  };
  if (system.length) body.system = system.join("\n\n");
  if (req.temperature !== undefined) body.temperature = Math.min(1, req.temperature);
  if (req.top_p !== undefined) body.top_p = req.top_p;
  if (req.stop !== undefined) body.stop_sequences = Array.isArray(req.stop) ? req.stop : [req.stop];
  if (req.user) body.metadata = { user_id: req.user };
  if (req.tools?.length) {
    body.tools = req.tools.map((t) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters ?? { type: "object", properties: {} },
    }));
  }
  const tc = req.tool_choice;
  if (tc === "auto") body.tool_choice = { type: "auto" };
  else if (tc === "required") body.tool_choice = { type: "any" };
  else if (tc === "none") body.tool_choice = { type: "none" };
  else if (tc && typeof tc === "object" && "function" in (tc as Record<string, unknown>)) {
    body.tool_choice = { type: "tool", name: (tc as { function: { name: string } }).function.name };
  }
  if (req.parallel_tool_calls === false && body.tool_choice) {
    (body.tool_choice as Record<string, unknown>).disable_parallel_tool_use = true;
  }
  return body;
}

function mapStopReason(reason: string | null | undefined): string | null {
  switch (reason) {
    case "end_turn":
    case "stop_sequence":
      return "stop";
    case "max_tokens":
      return "length";
    case "tool_use":
      return "tool_calls";
    case "refusal":
      return "content_filter";
    default:
      return reason ?? null;
  }
}

export function toOpenAIUsage(u: AnthropicUsage | undefined): Usage {
  const cached = u?.cache_read_input_tokens ?? 0;
  const prompt = (u?.input_tokens ?? 0) + cached + (u?.cache_creation_input_tokens ?? 0);
  const completion = u?.output_tokens ?? 0;
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    total_tokens: prompt + completion,
    prompt_tokens_details: { cached_tokens: cached },
  };
}

export function fromAnthropicResponse(body: AnthropicResponse, requestedModel: string): ChatCompletion {
  const text: string[] = [];
  const toolCalls: ToolCall[] = [];
  for (const block of body.content) {
    if (block.type === "text") text.push((block as { text: string }).text);
    else if (block.type === "tool_use") {
      const b = block as { id: string; name: string; input: unknown };
      toolCalls.push({ id: b.id, type: "function", function: { name: b.name, arguments: JSON.stringify(b.input ?? {}) } });
    }
  }
  return {
    id: newCompletionId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: requestedModel,
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text.length ? text.join("") : toolCalls.length ? null : "",
          ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
        },
        finish_reason: mapStopReason(body.stop_reason),
      },
    ],
    usage: toOpenAIUsage(body.usage),
  };
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly slug: string;
  readonly type = "ANTHROPIC" as const;

  constructor(private readonly config: ProviderConfig) {
    this.slug = config.slug;
  }

  private headers(): Record<string, string> {
    return {
      ...(this.config.apiKey ? { "x-api-key": this.config.apiKey } : {}),
      "anthropic-version": ANTHROPIC_VERSION,
    };
  }

  async chat(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatCompletion> {
    const { res } = await postJson(this.config, "v1/messages", toAnthropicRequest(req), this.headers(), opts);
    const body = await readJson<AnthropicResponse>(this.slug, res);
    return fromAnthropicResponse(body, req.model);
  }

  async chatStream(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatStream> {
    const { res, ttfbMs } = await postJson(
      this.config,
      "v1/messages",
      { ...toAnthropicRequest(req), stream: true },
      { ...this.headers(), accept: "text/event-stream" },
      opts,
    );
    if (!res.body) throw networkError(this.slug, new Error("Empty stream body"));
    const body = res.body;
    const slug = this.slug;
    const idle = this.config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_MS;
    const id = newCompletionId();
    const created = Math.floor(Date.now() / 1000);
    const model = req.model;

    async function* iterate(): AsyncGenerator<ChatCompletionChunk> {
      const usage: AnthropicUsage = {};
      const toolIndexByBlock = new Map<number, number>();
      let toolCount = 0;
      let finish: string | null = null;
      const chunk = (delta: ChatCompletionChunk["choices"][number]["delta"], finishReason: string | null = null): ChatCompletionChunk => ({
        id,
        object: "chat.completion.chunk",
        created,
        model,
        choices: [{ index: 0, delta, finish_reason: finishReason }],
      });
      try {
        for await (const evt of parseSse(body, { idleTimeoutMs: idle, signal: opts.signal })) {
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(evt.data);
          } catch {
            continue;
          }
          const type = (data.type as string) ?? evt.event;
          if (type === "message_start") {
            const m = data.message as { usage?: AnthropicUsage } | undefined;
            Object.assign(usage, m?.usage ?? {});
            yield chunk({ role: "assistant", content: "" });
          } else if (type === "content_block_start") {
            const block = data.content_block as { type: string; id?: string; name?: string };
            if (block?.type === "tool_use") {
              const toolIndex = toolCount++;
              toolIndexByBlock.set(data.index as number, toolIndex);
              yield chunk({
                tool_calls: [{ index: toolIndex, id: block.id, type: "function", function: { name: block.name ?? "", arguments: "" } }],
              });
            }
          } else if (type === "content_block_delta") {
            const delta = data.delta as { type: string; text?: string; partial_json?: string };
            if (delta?.type === "text_delta" && delta.text) yield chunk({ content: delta.text });
            else if (delta?.type === "input_json_delta") {
              const toolIndex = toolIndexByBlock.get(data.index as number) ?? 0;
              yield chunk({ tool_calls: [{ index: toolIndex, function: { arguments: delta.partial_json ?? "" } }] });
            }
          } else if (type === "message_delta") {
            const d = data.delta as { stop_reason?: string } | undefined;
            finish = mapStopReason(d?.stop_reason);
            Object.assign(usage, (data.usage as AnthropicUsage) ?? {});
          } else if (type === "error") {
            const e = data.error as { message?: string } | undefined;
            throw new Error(e?.message ?? "Anthropic stream error");
          } else if (type === "message_stop") {
            break;
          }
        }
      } catch (err) {
        throw networkError(slug, err);
      }
      yield chunk({}, finish ?? "stop");
      yield { id, object: "chat.completion.chunk", created, model, choices: [], usage: toOpenAIUsage(usage) };
    }
    const it = iterate();
    return { ttfbMs, [Symbol.asyncIterator]: () => it };
  }

  async listModels(opts: CallOptions): Promise<Array<{ id: string }>> {
    const { res } = await getJson(this.config, "v1/models", this.headers(), opts);
    if (!res.ok) return [];
    const body = await readJson<{ data?: Array<{ id: string }> }>(this.slug, res);
    return body.data ?? [];
  }

  async healthCheck(opts: CallOptions): Promise<HealthResult> {
    try {
      const { res, latencyMs } = await getJson(this.config, "v1/models", this.headers(), opts);
      return { ok: res.ok, latencyMs, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, latencyMs: 0, error: err instanceof Error ? err.message : "unreachable" };
    }
  }
}
