import type { Inrent, RequestOptions } from "./client";
import type { WithMeta } from "./meta";
import type { Stream } from "./streaming";
import type {
  ApiKey,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParams,
  Completion,
  CompletionCreateParams,
  CreatedApiKey,
  CurrentKey,
  EmbeddingCreateParams,
  EmbeddingResponse,
  ImageGenerateParams,
  ImageResponse,
  KeyCreateParams,
  List,
  Model,
  RequestDetail,
  RequestLog,
  ResponseCreateParams,
  ResponseObject,
  UsageSummary,
} from "./types";

abstract class Resource {
  constructor(protected readonly client: Inrent) {}
}

class ChatCompletions extends Resource {
  create(params: ChatCompletionCreateParams & { stream: true }, options?: RequestOptions): Promise<Stream<ChatCompletionChunk>>;
  create(params: ChatCompletionCreateParams & { stream?: false }, options?: RequestOptions): Promise<WithMeta<ChatCompletion>>;
  create(params: ChatCompletionCreateParams, options?: RequestOptions): Promise<WithMeta<ChatCompletion> | Stream<ChatCompletionChunk>>;
  create(params: ChatCompletionCreateParams, options?: RequestOptions) {
    if (params.stream) {
      // Ask for a final usage chunk unless the caller opted out explicitly.
      const body = { ...params, stream_options: { include_usage: true, ...params.stream_options } };
      return this.client.request<ChatCompletionChunk>({ method: "POST", path: "/chat/completions", body, stream: true, options });
    }
    return this.client.request<ChatCompletion>({ method: "POST", path: "/chat/completions", body: params, options });
  }
}

export class Chat extends Resource {
  readonly completions = new ChatCompletions(this.client);
}

/** Legacy text completions. */
export class Completions extends Resource {
  create(params: CompletionCreateParams & { stream: true }, options?: RequestOptions): Promise<Stream<Completion>>;
  create(params: CompletionCreateParams & { stream?: false }, options?: RequestOptions): Promise<WithMeta<Completion>>;
  create(params: CompletionCreateParams, options?: RequestOptions) {
    if (params.stream) return this.client.request<Completion>({ method: "POST", path: "/completions", body: params, stream: true, options });
    return this.client.request<Completion>({ method: "POST", path: "/completions", body: params, options });
  }
}

export class Responses extends Resource {
  create(params: ResponseCreateParams & { stream: true }, options?: RequestOptions): Promise<Stream<Record<string, unknown>>>;
  create(params: ResponseCreateParams & { stream?: false }, options?: RequestOptions): Promise<WithMeta<ResponseObject>>;
  create(params: ResponseCreateParams, options?: RequestOptions) {
    if (params.stream) return this.client.request<Record<string, unknown>>({ method: "POST", path: "/responses", body: params, stream: true, options });
    return this.client.request<ResponseObject>({ method: "POST", path: "/responses", body: params, options });
  }
}

export class Embeddings extends Resource {
  create(params: EmbeddingCreateParams, options?: RequestOptions) {
    return this.client.request<EmbeddingResponse>({ method: "POST", path: "/embeddings", body: params, options });
  }
}

export class Images extends Resource {
  generate(params: ImageGenerateParams, options?: RequestOptions) {
    return this.client.request<ImageResponse>({ method: "POST", path: "/images/generations", body: params, options });
  }
}

export class Models extends Resource {
  /** Public catalog with availability and verified pricing. */
  list(options?: RequestOptions) {
    return this.client.request<List<Model>>({ method: "GET", path: "/models", options });
  }
  retrieve(id: string, options?: RequestOptions) {
    return this.client.request<Model>({ method: "GET", path: `/models/${id.split("/").map(encodeURIComponent).join("/")}`, options });
  }
}

export class Keys extends Resource {
  /** The key making the request: limits, balance and spend. */
  async current(options?: RequestOptions): Promise<CurrentKey> {
    return (await this.client.request<{ data: CurrentKey }>({ method: "GET", path: "/key", options })).data;
  }
  list(params: { includeRevoked?: boolean } = {}, options?: RequestOptions) {
    return this.client.request<List<ApiKey>>({ method: "GET", path: "/keys", query: { include_revoked: params.includeRevoked }, options });
  }
  /** Requires `keys:write`. A key cannot grant permissions it does not have. */
  async create(params: KeyCreateParams, options?: RequestOptions): Promise<CreatedApiKey> {
    return (await this.client.request<{ data: CreatedApiKey }>({ method: "POST", path: "/keys", body: params, options })).data;
  }
  revoke(id: string, options?: RequestOptions) {
    return this.client.request<{ id: string; revoked: boolean }>({ method: "DELETE", path: `/keys/${encodeURIComponent(id)}`, options });
  }
}

export class Usage extends Resource {
  async retrieve(params: { days?: number; projectId?: string } = {}, options?: RequestOptions): Promise<UsageSummary> {
    return (await this.client.request<{ data: UsageSummary }>({ method: "GET", path: "/usage", query: { days: params.days, project_id: params.projectId }, options })).data;
  }
}

export class Requests extends Resource {
  list(params: { limit?: number; cursor?: string; model?: string; status?: "success" | "error" | "cancelled" } = {}, options?: RequestOptions) {
    return this.client.request<List<RequestLog>>({ method: "GET", path: "/requests", query: params, options });
  }
  async retrieve(requestId: string, options?: RequestOptions): Promise<RequestDetail> {
    return (await this.client.request<{ data: RequestDetail }>({ method: "GET", path: `/requests/${encodeURIComponent(requestId)}`, options })).data;
  }
}
