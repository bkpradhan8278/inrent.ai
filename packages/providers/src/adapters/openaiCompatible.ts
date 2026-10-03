import type {
  ChatCompletion,
  ChatCompletionChunk,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
  Usage,
} from "@inrent/core";
import { networkError } from "../errors";
import { DEFAULT_STREAM_IDLE_MS, getJson, postJson, readJson } from "../http";
import { parseSse } from "../sse";
import type { CallOptions, ChatStream, HealthResult, ProviderAdapter, ProviderConfig, UpstreamChatRequest } from "../types";

/**
 * Adapter for any OpenAI-compatible Chat Completions API:
 * OpenAI, DeepSeek, xAI, Mistral, Groq, Together, Fireworks, Cerebras, Gemini (OpenAI mode),
 * DashScope/Qwen, Z.ai, OpenRouter, Hugging Face router, LiteLLM, vLLM and Ollama.
 */
export class OpenAICompatibleAdapter implements ProviderAdapter {
  readonly slug: string;
  readonly type: ProviderAdapter["type"];

  constructor(private readonly config: ProviderConfig) {
    this.slug = config.slug;
    this.type = config.adapter;
  }

  private authHeaders(): Record<string, string> {
    return this.config.apiKey ? { authorization: `Bearer ${this.config.apiKey}` } : {};
  }

  async chat(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatCompletion> {
    const { res } = await postJson(this.config, "chat/completions", { ...req, stream: false, stream_options: undefined }, this.authHeaders(), opts);
    const body = await readJson<ChatCompletion & { x_groq?: { usage?: Usage } }>(this.slug, res);
    if (!body.usage && body.x_groq?.usage) body.usage = body.x_groq.usage;
    return body;
  }

  async chatStream(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatStream> {
    const { res, ttfbMs } = await postJson(
      this.config,
      "chat/completions",
      { ...req, stream: true, stream_options: { include_usage: true } },
      { ...this.authHeaders(), accept: "text/event-stream" },
      opts,
    );
    if (!res.body) throw networkError(this.slug, new Error("Empty stream body"));
    const body = res.body;
    const slug = this.slug;
    const idle = this.config.streamIdleTimeoutMs ?? DEFAULT_STREAM_IDLE_MS;
    async function* iterate(): AsyncGenerator<ChatCompletionChunk> {
      try {
        for await (const evt of parseSse(body, { idleTimeoutMs: idle, signal: opts.signal })) {
          if (evt.data === "[DONE]") return;
          let chunk: ChatCompletionChunk & { x_groq?: { usage?: Usage }; error?: { message?: string } };
          try {
            chunk = JSON.parse(evt.data);
          } catch {
            continue;
          }
          if (chunk.error) throw networkError(slug, new Error(chunk.error.message ?? "stream error"));
          if (!chunk.usage && chunk.x_groq?.usage) chunk.usage = chunk.x_groq.usage;
          yield chunk;
        }
      } catch (err) {
        throw networkError(slug, err);
      }
    }
    const it = iterate();
    return { ttfbMs, [Symbol.asyncIterator]: () => it };
  }

  async embeddings(req: EmbeddingRequest, opts: CallOptions): Promise<EmbeddingResponse> {
    const { res } = await postJson(this.config, "embeddings", req, this.authHeaders(), opts);
    return readJson<EmbeddingResponse>(this.slug, res);
  }

  async images(req: ImageGenerationRequest, opts: CallOptions): Promise<ImageGenerationResponse> {
    const { res } = await postJson(this.config, "images/generations", req, this.authHeaders(), opts);
    return readJson<ImageGenerationResponse>(this.slug, res);
  }

  async listModels(opts: CallOptions): Promise<Array<{ id: string; owned_by?: string }>> {
    const { res } = await getJson(this.config, "models", this.authHeaders(), opts);
    if (!res.ok) return [];
    const body = await readJson<{ data?: Array<{ id: string; owned_by?: string }> }>(this.slug, res);
    return body.data ?? [];
  }

  async healthCheck(opts: CallOptions): Promise<HealthResult> {
    try {
      const { res, latencyMs } = await getJson(this.config, "models", this.authHeaders(), opts);
      // 401/403 still proves reachability but means the credential is wrong.
      return { ok: res.ok, latencyMs, status: res.status, error: res.ok ? undefined : `HTTP ${res.status}` };
    } catch (err) {
      return { ok: false, latencyMs: 0, error: err instanceof Error ? err.message : "unreachable" };
    }
  }
}
