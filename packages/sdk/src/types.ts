/** Wire types for the INRENT API (OpenAI-compatible, plus INRENT extensions). */

export type Role = "system" | "developer" | "user" | "assistant" | "tool";

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } }
  | { type: "input_audio"; input_audio: { data: string; format: "wav" | "mp3" } };

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatMessage {
  role: Role;
  content: string | ContentPart[] | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolDefinition {
  type: "function";
  function: { name: string; description?: string; parameters?: Record<string, unknown>; strict?: boolean };
}

/** INRENT routing controls. Ignored by other OpenAI-compatible servers. */
export interface RoutingOptions {
  route?: "balanced" | "lowest_cost" | "lowest_latency" | "best_quality";
  providers?: { order?: string[]; only?: string[]; ignore?: string[]; allow_fallbacks?: boolean };
  /** Additional models to try, in order, if the primary has no healthy provider. */
  fallback_models?: string[];
}

export interface ChatCompletionCreateParams {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
  seed?: number;
  n?: number;
  user?: string;
  tools?: ToolDefinition[];
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  parallel_tool_calls?: boolean;
  response_format?: { type: "text" } | { type: "json_object" } | { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict?: boolean } };
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  metadata?: Record<string, string>;
  inrent?: RoutingOptions;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  prompt_tokens_details?: { cached_tokens?: number };
  completion_tokens_details?: { reasoning_tokens?: number };
}

export interface ChatCompletion {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: Array<{ index: number; message: { role: "assistant"; content: string | null; tool_calls?: ToolCall[]; refusal?: string | null }; finish_reason: string | null }>;
  usage?: Usage;
  system_fingerprint?: string | null;
}

export interface ChatCompletionChunk {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: "assistant"; content?: string | null; tool_calls?: Array<{ index: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } }> };
    finish_reason: string | null;
  }>;
  usage?: Usage | null;
}

export interface CompletionCreateParams {
  model: string;
  prompt: string | string[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  stop?: string | string[];
  stream?: boolean;
  inrent?: RoutingOptions;
}

export interface Completion {
  id: string;
  object: "text_completion";
  created: number;
  model: string;
  choices: Array<{ index: number; text: string; finish_reason: string | null }>;
  usage?: Usage;
}

export interface ResponseCreateParams {
  model: string;
  input: string | Array<{ role: Role; content: string | ContentPart[] }>;
  instructions?: string;
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: ToolDefinition[];
  stream?: boolean;
  inrent?: RoutingOptions;
}

export interface ResponseObject {
  id: string;
  object: "response";
  created_at: number;
  model: string;
  status: string;
  output: Array<{ type: string; role?: string; content?: Array<{ type: string; text?: string }> }>;
  output_text?: string;
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number };
}

export interface EmbeddingCreateParams {
  model: string;
  input: string | string[];
  dimensions?: number;
  encoding_format?: "float" | "base64";
  user?: string;
  inrent?: RoutingOptions;
}

export interface EmbeddingResponse {
  object: "list";
  model: string;
  data: Array<{ object: "embedding"; index: number; embedding: number[] | string }>;
  usage: { prompt_tokens: number; total_tokens: number };
}

export interface ImageGenerateParams {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  quality?: string;
  response_format?: "url" | "b64_json";
  inrent?: RoutingOptions;
}

export interface ImageResponse {
  created: number;
  data: Array<{ url?: string; b64_json?: string; revised_prompt?: string }>;
}

export interface Model {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
  name: string;
  description: string;
  context_length: number | null;
  capabilities: string[];
  modalities: { input: string[]; output: string[] };
  status: string;
  /** `platform` (INRENT credits), `byok` (needs your provider key) or `unavailable`. */
  availability: "platform" | "byok" | "unavailable";
  pricing: { currency: "USD"; unit: "per_1m_tokens"; input: string | null; output: string | null; cached_input: string | null } | null;
  providers: string[];
  dev_only?: boolean;
}

export interface List<T> {
  object: "list";
  data: T[];
  next_cursor?: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  last_four?: string;
  environment: string;
  project: { id: string; name: string };
  permissions: string[];
  allowed_models?: string[];
  spend_limit_usd?: string | null;
  rpm_limit?: number | null;
  tpm_limit?: number | null;
  expires_at: string | null;
  revoked_at?: string | null;
  last_used_at?: string | null;
  created_at?: string;
}

export interface CreatedApiKey extends ApiKey {
  /** The secret. Returned once — store it immediately. */
  key: string;
}

export interface KeyCreateParams {
  name: string;
  environment?: "development" | "staging" | "production";
  project_id?: string;
  permissions?: Array<"inference" | "keys:read" | "keys:write" | "usage:read" | "logs:read">;
  allowed_models?: string[];
  spend_limit_usd?: string;
  rpm_limit?: number;
  tpm_limit?: number;
  expires_at?: string;
}

export interface CurrentKey {
  id: string;
  name: string;
  prefix: string;
  environment: string;
  organization_id: string;
  project: { id: string; name: string };
  permissions: string[];
  limits: { spend_limit_usd: string | null; rpm: number; tpm: number };
  usage: { spent_usd: string };
  balance_usd: string;
  expires_at: string | null;
}

export interface UsageSummary {
  days: number;
  balance_usd: string;
  totals: { requests: number; errors: number; inputTokens: number; outputTokens: number; spend_usd: string; avgLatencyMs: number | null; p95LatencyMs: number | null; avgTtftMs: number | null; errorRate: number; fallbackRate: number };
  daily: Array<{ date: string; requests: number; errors: number; input_tokens: number; output_tokens: number; spend_usd: string }>;
  by_model: Array<{ model: string; requests: number; tokens: number; spend_usd: string }>;
  by_provider: Array<{ provider: string; requests: number; errors: number; avg_latency_ms: number | null; spend_usd: string }>;
  demo_data: boolean;
}

export interface RequestLog {
  request_id: string;
  created_at: string;
  endpoint: string;
  model: string;
  provider: string | null;
  status: "success" | "error" | "cancelled";
  http_status: number;
  error_code: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  latency_ms: number | null;
  ttft_ms: number | null;
  fallbacks: number;
  api_key: string | null;
  project: string;
}

export interface RequestDetail {
  request_id: string;
  trace_id: string | null;
  created_at: string;
  endpoint: string;
  model_requested: string;
  model: string | null;
  provider: string | null;
  billing_mode: string;
  status: string;
  http_status: number;
  error: { type: string | null; code: string | null; message: string | null } | null;
  usage: { input_tokens: number; output_tokens: number; cached_tokens: number; estimated: boolean };
  cost_usd: string;
  latency_ms: number | null;
  ttft_ms: number | null;
  routing: unknown;
}
