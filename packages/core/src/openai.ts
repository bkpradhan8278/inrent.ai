/**
 * OpenAI-compatible wire types used across the gateway, adapters and tests.
 * These are the normalized shapes INRENT returns regardless of upstream provider.
 */

export type ChatRole = "system" | "developer" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "input_audio"; input_audio: { data: string; format: string } }
  | { type: "file"; file: Record<string, unknown> };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: ChatRole;
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
  /** Some providers return reasoning text separately. */
  reasoning_content?: string;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  n?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  user?: string;
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  tools?: ToolDefinition[];
  tool_choice?: unknown;
  parallel_tool_calls?: boolean;
  response_format?:
    | { type: "text" }
    | { type: "json_object" }
    | { type: "json_schema"; json_schema: { name: string; schema?: Record<string, unknown>; strict?: boolean; description?: string } };
  logprobs?: boolean;
  top_logprobs?: number;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  metadata?: Record<string, string>;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason: string | null;
  logprobs?: unknown;
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: Usage;
  system_fingerprint?: string | null;
  /** INRENT extension: provider that served the request. */
  provider?: string;
}

export interface ToolCallDelta {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}

export interface ChatCompletionChunkChoice {
  index: number;
  delta: Partial<Omit<ChatMessage, "tool_calls">> & { tool_calls?: ToolCallDelta[] };
  finish_reason: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
  usage?: Usage | null;
  provider?: string;
}

export interface EmbeddingRequest {
  model: string;
  input: string | string[] | number[] | number[][];
  encoding_format?: "float" | "base64";
  dimensions?: number;
  user?: string;
}

export interface EmbeddingResponse {
  object: "list";
  data: Array<{ object: "embedding"; index: number; embedding: number[] | string }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
  provider?: string;
}

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
  user?: string;
}

export interface ImageGenerationResponse {
  created: number;
  data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
  provider?: string;
}

/** Normalized usage the billing engine consumes. */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  reasoningTokens: number;
  images?: number;
  estimated: boolean;
}

export function normalizeUsage(usage: Usage | null | undefined): NormalizedUsage | null {
  if (!usage) return null;
  return {
    inputTokens: usage.prompt_tokens ?? 0,
    outputTokens: usage.completion_tokens ?? 0,
    cachedTokens: usage.prompt_tokens_details?.cached_tokens ?? 0,
    reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? 0,
    estimated: false,
  };
}
