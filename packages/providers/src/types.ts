import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest,
  EmbeddingRequest,
  EmbeddingResponse,
  ImageGenerationRequest,
  ImageGenerationResponse,
} from "@inrent/core";

export type AdapterType = "OPENAI_COMPATIBLE" | "ANTHROPIC" | "LITELLM" | "MOCK";
export type ProviderEndpoint = "chat" | "embeddings" | "images" | "responses";

export interface ProviderConfig {
  slug: string;
  adapter: AdapterType;
  baseUrl: string;
  /** Resolved secret — platform credential or decrypted BYOK key. Never logged. */
  apiKey: string | null;
  timeoutMs?: number;
  /** Idle timeout between streamed chunks. */
  streamIdleTimeoutMs?: number;
  extraHeaders?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

export interface CallOptions {
  requestId: string;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/** Upstream request: `model` is the provider's model id; INRENT extensions are removed. */
export type UpstreamChatRequest = Omit<ChatCompletionRequest, "model"> & { model: string };

export interface ChatStream extends AsyncIterable<ChatCompletionChunk> {
  /** Time to first byte from the provider (ms), available once the stream opened. */
  readonly ttfbMs: number;
}

export interface HealthResult {
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
}

export interface ProviderAdapter {
  readonly slug: string;
  readonly type: AdapterType;
  chat(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatCompletion>;
  /** Resolves once the upstream accepted the stream (so the gateway can still fall back before then). */
  chatStream(req: UpstreamChatRequest, opts: CallOptions): Promise<ChatStream>;
  embeddings?(req: EmbeddingRequest, opts: CallOptions): Promise<EmbeddingResponse>;
  images?(req: ImageGenerationRequest, opts: CallOptions): Promise<ImageGenerationResponse>;
  listModels?(opts: CallOptions): Promise<Array<{ id: string; owned_by?: string }>>;
  healthCheck(opts: CallOptions): Promise<HealthResult>;
}
