import { z } from "zod";

/**
 * Request validation for the public API. Unknown top-level fields are stripped so that only
 * vetted parameters are forwarded upstream. Limits bound request size and abuse potential.
 */

export const LIMITS = {
  maxMessages: 2_000,
  maxStringLength: 2_000_000,
  maxTools: 128,
  maxOutputTokens: 1_000_000,
  maxEmbeddingInputs: 2_048,
  maxStop: 4,
  maxBodyBytes: 20 * 1024 * 1024,
} as const;

const text = z.string().max(LIMITS.maxStringLength);

const contentPart = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text }),
  z.object({
    type: z.literal("image_url"),
    image_url: z.object({
      url: z.string().max(LIMITS.maxStringLength),
      detail: z.enum(["auto", "low", "high"]).optional(),
    }),
  }),
  z.object({
    type: z.literal("input_audio"),
    input_audio: z.object({ data: z.string().max(LIMITS.maxStringLength), format: z.string().max(16) }),
  }),
  z.object({ type: z.literal("file"), file: z.record(z.string(), z.unknown()) }),
]);

const toolCall = z.object({
  id: z.string().max(256),
  type: z.literal("function"),
  function: z.object({ name: z.string().max(256), arguments: z.string().max(LIMITS.maxStringLength) }),
});

export const chatMessageSchema = z.object({
  role: z.enum(["system", "developer", "user", "assistant", "tool"]),
  content: z.union([text, z.array(contentPart).max(512), z.null()]).optional().default(null),
  name: z.string().max(256).optional(),
  tool_calls: z.array(toolCall).max(LIMITS.maxTools).optional(),
  tool_call_id: z.string().max(256).optional(),
});

const toolDefinition = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1).max(64),
    description: z.string().max(8_192).optional(),
    parameters: z.record(z.string(), z.unknown()).optional(),
    strict: z.boolean().optional(),
  }),
});

const responseFormat = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text") }),
  z.object({ type: z.literal("json_object") }),
  z.object({
    type: z.literal("json_schema"),
    json_schema: z.object({
      name: z.string().min(1).max(64),
      description: z.string().max(4_096).optional(),
      schema: z.record(z.string(), z.unknown()).optional(),
      strict: z.boolean().optional(),
    }),
  }),
]);

/** INRENT routing extension (optional, ignored by other OpenAI-compatible servers). */
export const routingExtensionSchema = z
  .object({
    route: z.enum(["balanced", "lowest_cost", "lowest_latency", "best_quality"]).optional(),
    providers: z
      .object({
        order: z.array(z.string().max(64)).max(32).optional(),
        only: z.array(z.string().max(64)).max(32).optional(),
        ignore: z.array(z.string().max(64)).max(32).optional(),
        allow_fallbacks: z.boolean().optional(),
      })
      .optional(),
    /** Additional models to try, in order, when the primary model has no healthy provider. */
    fallback_models: z.array(z.string().max(128)).max(4).optional(),
  })
  .optional();

export const chatCompletionRequestSchema = z.object({
  model: z.string().min(1).max(128),
  messages: z.array(chatMessageSchema).min(1).max(LIMITS.maxMessages),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).max(LIMITS.maxOutputTokens).optional(),
  max_completion_tokens: z.number().int().min(1).max(LIMITS.maxOutputTokens).optional(),
  n: z.number().int().min(1).max(1).optional(),
  stop: z.union([z.string().max(256), z.array(z.string().max(256)).max(LIMITS.maxStop)]).optional(),
  presence_penalty: z.number().min(-2).max(2).optional(),
  frequency_penalty: z.number().min(-2).max(2).optional(),
  seed: z.number().int().optional(),
  user: z.string().max(256).optional(),
  stream: z.boolean().optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
  tools: z.array(toolDefinition).max(LIMITS.maxTools).optional(),
  tool_choice: z
    .union([
      z.enum(["none", "auto", "required"]),
      z.object({ type: z.literal("function"), function: z.object({ name: z.string().max(64) }) }),
    ])
    .optional(),
  parallel_tool_calls: z.boolean().optional(),
  response_format: responseFormat.optional(),
  logprobs: z.boolean().optional(),
  top_logprobs: z.number().int().min(0).max(20).optional(),
  reasoning_effort: z.enum(["minimal", "low", "medium", "high"]).optional(),
  metadata: z.record(z.string().max(64), z.string().max(512)).optional(),
  inrent: routingExtensionSchema,
});

export type ChatCompletionRequestInput = z.infer<typeof chatCompletionRequestSchema>;

export const completionRequestSchema = z.object({
  model: z.string().min(1).max(128),
  prompt: z.union([text, z.array(text).max(1)]),
  max_tokens: z.number().int().min(1).max(LIMITS.maxOutputTokens).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stop: z.union([z.string().max(256), z.array(z.string().max(256)).max(LIMITS.maxStop)]).optional(),
  stream: z.boolean().optional(),
  user: z.string().max(256).optional(),
  inrent: routingExtensionSchema,
});

export const embeddingRequestSchema = z.object({
  model: z.string().min(1).max(128),
  input: z.union([
    text,
    z.array(text).min(1).max(LIMITS.maxEmbeddingInputs),
    z.array(z.number().int()).min(1).max(100_000),
    z.array(z.array(z.number().int()).max(100_000)).min(1).max(LIMITS.maxEmbeddingInputs),
  ]),
  encoding_format: z.enum(["float", "base64"]).optional(),
  dimensions: z.number().int().min(1).max(65_536).optional(),
  user: z.string().max(256).optional(),
  inrent: routingExtensionSchema,
});

export const imageGenerationRequestSchema = z.object({
  model: z.string().min(1).max(128),
  prompt: z.string().min(1).max(32_000),
  n: z.number().int().min(1).max(10).optional(),
  size: z.string().max(32).optional(),
  quality: z.string().max(32).optional(),
  response_format: z.enum(["url", "b64_json"]).optional(),
  user: z.string().max(256).optional(),
  inrent: routingExtensionSchema,
});

/** Subset of the Responses API: text or message input, non-streaming. */
export const responsesRequestSchema = z.object({
  model: z.string().min(1).max(128),
  input: z.union([
    text,
    z
      .array(
        z.object({
          role: z.enum(["system", "developer", "user", "assistant"]),
          content: z.union([
            text,
            z.array(
              z.discriminatedUnion("type", [
                z.object({ type: z.literal("input_text"), text }),
                z.object({ type: z.literal("output_text"), text }),
                z.object({ type: z.literal("input_image"), image_url: z.string().max(LIMITS.maxStringLength) }),
              ]),
            ),
          ]),
        }),
      )
      .min(1)
      .max(LIMITS.maxMessages),
  ]),
  instructions: z.string().max(LIMITS.maxStringLength).optional(),
  max_output_tokens: z.number().int().min(1).max(LIMITS.maxOutputTokens).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stream: z.boolean().optional(),
  user: z.string().max(256).optional(),
  inrent: routingExtensionSchema,
});

export type ResponsesRequestInput = z.infer<typeof responsesRequestSchema>;

/** Formats the first zod issue into an OpenAI-style message + param. */
export function describeZodError(error: z.ZodError): { message: string; param: string | null } {
  const issue = error.issues[0];
  if (!issue) return { message: "Invalid request body.", param: null };
  const param = issue.path.length ? issue.path.map(String).join(".") : null;
  return { message: param ? `Invalid value for '${param}': ${issue.message}` : issue.message, param };
}
