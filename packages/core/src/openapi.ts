/**
 * OpenAPI 3.1 description of the public INRENT API. Served by the gateway at /openapi.json
 * and rendered by the docs API reference. Keep in sync with apps/gateway routes.
 */

const errorRef = { $ref: "#/components/schemas/Error" };
const errorResponses = {
  "400": { description: "Invalid request", content: { "application/json": { schema: errorRef } } },
  "401": { description: "Missing, invalid, revoked or expired API key", content: { "application/json": { schema: errorRef } } },
  "402": { description: "Insufficient credits or budget exceeded", content: { "application/json": { schema: errorRef } } },
  "403": { description: "Permission denied or model not allowed", content: { "application/json": { schema: errorRef } } },
  "404": { description: "Model not found", content: { "application/json": { schema: errorRef } } },
  "429": { description: "Rate limit exceeded (see retry-after and x-ratelimit-* headers)", content: { "application/json": { schema: errorRef } } },
  "502": { description: "Upstream provider error after fallbacks", content: { "application/json": { schema: errorRef } } },
  "503": { description: "No eligible provider is available for the model", content: { "application/json": { schema: errorRef } } },
};

const routing = {
  type: "object",
  description: "INRENT routing extension. Ignored by other OpenAI-compatible servers.",
  properties: {
    route: { type: "string", enum: ["balanced", "lowest_cost", "lowest_latency", "best_quality"] },
    providers: {
      type: "object",
      properties: {
        order: { type: "array", items: { type: "string" }, description: "Providers to try first, in order." },
        only: { type: "array", items: { type: "string" } },
        ignore: { type: "array", items: { type: "string" } },
        allow_fallbacks: { type: "boolean", default: true },
      },
    },
    fallback_models: { type: "array", items: { type: "string" }, maxItems: 4 },
  },
};

export const OPENAPI_SPEC = {
  openapi: "3.1.0",
  info: {
    title: "INRENT API",
    version: "1.0.0",
    description:
      "One API for every AI model. OpenAI-compatible: point any OpenAI SDK at the INRENT base URL and use your INRENT API key.",
    contact: { name: "INRENT", url: "https://inrent.ai/support" },
  },
  servers: [{ url: "https://api.inrent.ai/v1", description: "Production" }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: "Chat", description: "Text generation" },
    { name: "Embeddings" },
    { name: "Images" },
    { name: "Models", description: "Model discovery (no key required)" },
    { name: "Management", description: "Keys, usage and logs — requires keys with management permissions" },
  ],
  paths: {
    "/chat/completions": {
      post: {
        tags: ["Chat"],
        operationId: "createChatCompletion",
        summary: "Create a chat completion",
        description: "OpenAI-compatible chat completions with streaming (SSE), tools and structured output.",
        requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChatCompletionRequest" } } } },
        responses: {
          "200": {
            description: "Completion, or a text/event-stream when stream=true",
            headers: {
              "x-request-id": { schema: { type: "string" } },
              "x-inrent-provider": { schema: { type: "string" } },
              "x-inrent-fallbacks": { schema: { type: "integer" } },
            },
            content: { "application/json": { schema: { $ref: "#/components/schemas/ChatCompletion" } }, "text/event-stream": { schema: { type: "string" } } },
          },
          ...errorResponses,
        },
      },
    },
    "/completions": {
      post: {
        tags: ["Chat"],
        operationId: "createCompletion",
        summary: "Create a text completion (legacy)",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["model", "prompt"], properties: { model: { type: "string" }, prompt: { type: "string" }, max_tokens: { type: "integer" }, temperature: { type: "number" }, stream: { type: "boolean" } } } } },
        },
        responses: { "200": { description: "Completion" }, ...errorResponses },
      },
    },
    "/responses": {
      post: {
        tags: ["Chat"],
        operationId: "createResponse",
        summary: "Create a response (Responses API subset)",
        description: "Text and message input, non-streaming. Use chat completions for streaming.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["model", "input"], properties: { model: { type: "string" }, input: { oneOf: [{ type: "string" }, { type: "array", items: { type: "object" } }] }, instructions: { type: "string" }, max_output_tokens: { type: "integer" } } } } },
        },
        responses: { "200": { description: "Response object" }, ...errorResponses },
      },
    },
    "/embeddings": {
      post: {
        tags: ["Embeddings"],
        operationId: "createEmbedding",
        summary: "Create embeddings",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["model", "input"], properties: { model: { type: "string" }, input: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }, dimensions: { type: "integer" }, encoding_format: { type: "string", enum: ["float", "base64"] } } } } },
        },
        responses: { "200": { description: "Embedding list" }, ...errorResponses },
      },
    },
    "/images/generations": {
      post: {
        tags: ["Images"],
        operationId: "createImage",
        summary: "Generate images",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object", required: ["model", "prompt"], properties: { model: { type: "string" }, prompt: { type: "string" }, n: { type: "integer", minimum: 1, maximum: 10 }, size: { type: "string" }, response_format: { type: "string", enum: ["url", "b64_json"] } } } } },
        },
        responses: { "200": { description: "Images" }, ...errorResponses },
      },
    },
    "/models": {
      get: {
        tags: ["Models"],
        operationId: "listModels",
        summary: "List models",
        security: [],
        responses: { "200": { description: "Model list", content: { "application/json": { schema: { type: "object", properties: { object: { const: "list" }, data: { type: "array", items: { $ref: "#/components/schemas/Model" } } } } } } } },
      },
    },
    "/models/{model}": {
      get: {
        tags: ["Models"],
        operationId: "retrieveModel",
        summary: "Retrieve a model",
        security: [],
        parameters: [{ name: "model", in: "path", required: true, schema: { type: "string" }, example: "openai/gpt-4.1" }],
        responses: { "200": { description: "Model", content: { "application/json": { schema: { $ref: "#/components/schemas/Model" } } } }, "404": errorResponses["404"] },
      },
    },
    "/key": {
      get: { tags: ["Management"], operationId: "getKey", summary: "Inspect the current API key, limits and balance", responses: { "200": { description: "Key info" }, "401": errorResponses["401"] } },
    },
    "/keys": {
      get: { tags: ["Management"], operationId: "listKeys", summary: "List API keys (keys:read)", responses: { "200": { description: "Keys" }, "403": errorResponses["403"] } },
      post: {
        tags: ["Management"],
        operationId: "createKey",
        summary: "Create an API key (keys:write)",
        requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name"], properties: { name: { type: "string" }, environment: { type: "string", enum: ["development", "staging", "production"] }, project_id: { type: "string", format: "uuid" }, permissions: { type: "array", items: { type: "string" } }, allowed_models: { type: "array", items: { type: "string" } }, spend_limit_usd: { type: "string" }, rpm_limit: { type: "integer" }, expires_at: { type: "string", format: "date-time" } } } } } },
        responses: { "201": { description: "Created — the secret is returned once" }, "403": errorResponses["403"] },
      },
    },
    "/keys/{id}": {
      delete: { tags: ["Management"], operationId: "revokeKey", summary: "Revoke an API key (keys:write)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Revoked" } } },
    },
    "/usage": {
      get: { tags: ["Management"], operationId: "getUsage", summary: "Usage summary (usage:read)", parameters: [{ name: "days", in: "query", schema: { type: "integer", minimum: 1, maximum: 90 } }], responses: { "200": { description: "Usage" } } },
    },
    "/requests": {
      get: { tags: ["Management"], operationId: "listRequests", summary: "Request logs (logs:read)", parameters: [{ name: "limit", in: "query", schema: { type: "integer" } }, { name: "cursor", in: "query", schema: { type: "string" } }, { name: "status", in: "query", schema: { type: "string", enum: ["success", "error", "cancelled"] } }], responses: { "200": { description: "Requests" } } },
    },
    "/requests/{id}": {
      get: { tags: ["Management"], operationId: "getRequest", summary: "Request detail (logs:read)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { "200": { description: "Request" } } },
    },
  },
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", description: "INRENT API key: sk-inrent-<env>-…" } },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["type", "code", "message"],
            properties: {
              type: { type: "string", example: "rate_limit_error" },
              code: { type: "string", example: "rate_limit_exceeded" },
              message: { type: "string" },
              param: { type: ["string", "null"] },
              request_id: { type: ["string", "null"], example: "req_01J9Z4Q3W6M0Y8R2T5V7X9B1C3" },
            },
          },
        },
      },
      Message: {
        type: "object",
        required: ["role"],
        properties: {
          role: { type: "string", enum: ["system", "developer", "user", "assistant", "tool"] },
          content: { oneOf: [{ type: "string" }, { type: "array", items: { type: "object" } }, { type: "null" }] },
          tool_calls: { type: "array", items: { type: "object" } },
          tool_call_id: { type: "string" },
        },
      },
      ChatCompletionRequest: {
        type: "object",
        required: ["model", "messages"],
        properties: {
          model: { type: "string", example: "openai/gpt-4.1" },
          messages: { type: "array", items: { $ref: "#/components/schemas/Message" } },
          stream: { type: "boolean" },
          stream_options: { type: "object", properties: { include_usage: { type: "boolean" } } },
          temperature: { type: "number", minimum: 0, maximum: 2 },
          top_p: { type: "number" },
          max_tokens: { type: "integer" },
          max_completion_tokens: { type: "integer" },
          stop: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
          tools: { type: "array", items: { type: "object" } },
          tool_choice: {},
          response_format: { type: "object" },
          seed: { type: "integer" },
          user: { type: "string" },
          inrent: routing,
        },
      },
      ChatCompletion: {
        type: "object",
        properties: {
          id: { type: "string" },
          object: { const: "chat.completion" },
          created: { type: "integer" },
          model: { type: "string" },
          provider: { type: "string", description: "Provider that served the request" },
          choices: { type: "array", items: { type: "object" } },
          usage: { type: "object", properties: { prompt_tokens: { type: "integer" }, completion_tokens: { type: "integer" }, total_tokens: { type: "integer" } } },
        },
      },
      Model: {
        type: "object",
        properties: {
          id: { type: "string", example: "openai/gpt-4.1" },
          object: { const: "model" },
          owned_by: { type: "string" },
          name: { type: "string" },
          context_length: { type: ["integer", "null"] },
          capabilities: { type: "array", items: { type: "string" } },
          availability: { type: "string", enum: ["platform", "byok", "unavailable"] },
          pricing: { type: ["object", "null"], properties: { currency: { type: "string" }, unit: { type: "string" }, input: { type: ["string", "null"] }, output: { type: ["string", "null"] } } },
        },
      },
    },
  },
} as const;
