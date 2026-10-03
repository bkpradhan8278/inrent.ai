import type { Context, Hono } from "hono";
import {
  chatCompletionRequestSchema,
  completionRequestSchema,
  describeZodError,
  embeddingRequestSchema,
  Errors,
  estimateTextTokens,
  imageGenerationRequestSchema,
  InrentError,
  responsesRequestSchema,
  ulid,
  type ChatCompletionChunk,
  type ChatCompletionRequestInput,
  type NormalizedUsage,
} from "@inrent/core";
import type { z } from "zod";
import { authenticate, requirePermission } from "../auth";
import { runChat } from "../pipeline/chat";
import { policyFrom, preferencesFrom } from "../pipeline/candidates";
import { buildRecord, costFor, finalize, PipelineError, prepare, responseHeaders, runWithFallback } from "../pipeline/execute";
import type { GatewayState } from "../state";
import type { GatewayAuth, GatewayDeps, GatewayEnv } from "../types";

async function parseBody<S extends z.ZodTypeAny>(c: Context<GatewayEnv>, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw Errors.invalidRequest("Request body must be valid JSON.", null, "invalid_json");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const { message, param } = describeZodError(parsed.error);
    throw Errors.invalidRequest(message, param);
  }
  return parsed.data;
}

async function inferenceAuth(c: Context<GatewayEnv>, deps: GatewayDeps): Promise<GatewayAuth> {
  const auth = await authenticate(c, deps);
  requirePermission(auth, "inference");
  c.set("auth", auth);
  return auth;
}

export function registerInferenceRoutes(app: Hono<GatewayEnv>, deps: GatewayDeps, state: GatewayState) {
  app.post("/v1/chat/completions", async (c) => {
    const auth = await inferenceAuth(c, deps);
    const body = await parseBody(c, chatCompletionRequestSchema);
    const out = await runChat(c, deps, state, auth, body, { endpoint: "chat.completions" });
    if (out.kind === "stream") return out.response;
    return c.json(out.result.completion, 200, out.result.headers);
  });

  // Legacy text completions, served through the chat pipeline for maximum provider coverage.
  app.post("/v1/completions", async (c) => {
    const auth = await inferenceAuth(c, deps);
    const body = await parseBody(c, completionRequestSchema);
    const prompt = Array.isArray(body.prompt) ? (body.prompt[0] ?? "") : body.prompt;
    const chat: ChatCompletionRequestInput = {
      model: body.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: body.max_tokens,
      temperature: body.temperature,
      top_p: body.top_p,
      stop: body.stop,
      stream: body.stream,
      user: body.user,
      inrent: body.inrent,
    };
    const id = `cmpl-${ulid()}`;
    const out = await runChat(c, deps, state, auth, chat, {
      endpoint: "completions",
      transformChunk: (chunk: ChatCompletionChunk) =>
        JSON.stringify({
          id,
          object: "text_completion",
          created: chunk.created,
          model: chunk.model,
          provider: chunk.provider,
          choices: chunk.choices.map((ch) => ({ index: ch.index, text: ch.delta.content ?? "", finish_reason: ch.finish_reason, logprobs: null })),
          ...(chunk.usage ? { usage: chunk.usage } : {}),
        }),
    });
    if (out.kind === "stream") return out.response;
    const cc = out.result.completion;
    return c.json(
      {
        id,
        object: "text_completion",
        created: cc.created,
        model: cc.model,
        provider: cc.provider,
        choices: cc.choices.map((ch) => ({ index: ch.index, text: typeof ch.message.content === "string" ? ch.message.content : "", finish_reason: ch.finish_reason, logprobs: null })),
        usage: cc.usage,
      },
      200,
      out.result.headers,
    );
  });

  // Responses API (subset): text and message input, non-streaming.
  app.post("/v1/responses", async (c) => {
    const auth = await inferenceAuth(c, deps);
    const body = await parseBody(c, responsesRequestSchema);
    if (body.stream) throw Errors.notSupported("Streaming is not yet available on /v1/responses. Use /v1/chat/completions with stream: true.", "streaming_not_supported");
    const messages: ChatCompletionRequestInput["messages"] = [];
    if (body.instructions) messages.push({ role: "system", content: body.instructions });
    if (typeof body.input === "string") messages.push({ role: "user", content: body.input });
    else {
      for (const item of body.input) {
        const content =
          typeof item.content === "string"
            ? item.content
            : item.content.map((part) =>
                part.type === "input_image" ? { type: "image_url" as const, image_url: { url: part.image_url } } : { type: "text" as const, text: part.text },
              );
        messages.push({ role: item.role, content });
      }
    }
    const out = await runChat(c, deps, state, auth, {
      model: body.model,
      messages,
      max_tokens: body.max_output_tokens,
      temperature: body.temperature,
      top_p: body.top_p,
      user: body.user,
      inrent: body.inrent,
    }, { endpoint: "responses" });
    if (out.kind === "stream") return out.response;
    const cc = out.result.completion;
    const text = typeof cc.choices[0]?.message.content === "string" ? cc.choices[0].message.content : "";
    return c.json(
      {
        id: `resp_${ulid()}`,
        object: "response",
        created_at: cc.created,
        status: cc.choices[0]?.finish_reason === "length" ? "incomplete" : "completed",
        model: cc.model,
        provider: cc.provider,
        output: [{ type: "message", id: `msg_${ulid()}`, status: "completed", role: "assistant", content: [{ type: "output_text", text, annotations: [] }] }],
        output_text: text,
        usage: cc.usage ? { input_tokens: cc.usage.prompt_tokens, output_tokens: cc.usage.completion_tokens, total_tokens: cc.usage.total_tokens } : undefined,
      },
      200,
      out.result.headers,
    );
  });

  app.post("/v1/embeddings", async (c) => {
    const auth = await inferenceAuth(c, deps);
    const body = await parseBody(c, embeddingRequestSchema);
    const inputs = Array.isArray(body.input) ? body.input : [body.input];
    const estimated = inputs.reduce<number>((sum, i) => sum + (typeof i === "string" ? estimateTextTokens(i) : Array.isArray(i) ? i.length : 1), 0);
    const prepared = await prepare(c, deps, state, {
      auth,
      kind: "embeddings",
      modelRequested: body.model,
      requirements: {},
      policy: policyFrom(body.inrent?.route, auth.routingPolicy),
      preferences: preferencesFrom(body.inrent, auth.preferByok),
      estimatedInputTokens: estimated,
      maxOutputTokens: 0,
    });
    try {
      const { inrent: _i, ...upstreamBody } = body;
      const outcome = await runWithFallback(deps, state, prepared, c.get("requestId"), (adapter, candidate) => {
        if (!adapter.embeddings) throw new InrentError("not_supported_error", "endpoint_not_supported", "Provider does not support embeddings.", { retryable: true });
        return adapter.embeddings({ ...upstreamBody, model: candidate.providerModelId }, { requestId: c.get("requestId"), signal: c.req.raw.signal });
      });
      const { result, candidate, meta, attempts, providerLatencyMs } = outcome;
      const usage: NormalizedUsage = { inputTokens: result.usage?.prompt_tokens ?? estimated, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, estimated: !result.usage };
      const cost = costFor(candidate, meta, usage, deps);
      await finalize(deps, auth, buildRecord(deps, { c, auth, endpoint: "embeddings", modelRequested: body.model, stream: false, candidate, meta, status: "SUCCESS", httpStatus: 200, usage, cost, providerLatencyMs, attempts, decision: prepared.decision }), prepared.rules);
      return c.json({ ...result, model: candidate.modelSlug, provider: candidate.providerSlug }, 200, responseHeaders(c, { candidate, attempts, rateLimit: prepared.rateLimitHeaders, chargeNano: cost.userChargeNano }));
    } catch (e) {
      if (e instanceof PipelineError) {
        await finalize(deps, auth, buildRecord(deps, { c, auth, endpoint: "embeddings", modelRequested: body.model, stream: false, status: "ERROR", httpStatus: e.error.status, error: e.error, attempts: e.attempts, decision: prepared.decision }), null);
        throw e.error;
      }
      throw e;
    }
  });

  app.post("/v1/images/generations", async (c) => {
    const auth = await inferenceAuth(c, deps);
    const body = await parseBody(c, imageGenerationRequestSchema);
    const n = body.n ?? 1;
    const prepared = await prepare(c, deps, state, {
      auth,
      kind: "images",
      modelRequested: body.model,
      requirements: {},
      policy: policyFrom(body.inrent?.route, auth.routingPolicy),
      preferences: preferencesFrom(body.inrent, auth.preferByok),
      estimatedInputTokens: estimateTextTokens(body.prompt),
      maxOutputTokens: 0,
    });
    try {
      const { inrent: _i, ...upstreamBody } = body;
      const outcome = await runWithFallback(deps, state, prepared, c.get("requestId"), (adapter, candidate) => {
        if (!adapter.images) throw new InrentError("not_supported_error", "endpoint_not_supported", "Provider does not support image generation.", { retryable: true });
        return adapter.images({ ...upstreamBody, model: candidate.providerModelId }, { requestId: c.get("requestId"), signal: c.req.raw.signal });
      });
      const { result, candidate, meta, attempts, providerLatencyMs } = outcome;
      const usage: NormalizedUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, reasoningTokens: 0, images: result.data?.length ?? n, estimated: false };
      const cost = costFor(candidate, meta, usage, deps);
      await finalize(deps, auth, buildRecord(deps, { c, auth, endpoint: "images.generations", modelRequested: body.model, stream: false, candidate, meta, status: "SUCCESS", httpStatus: 200, usage, units: usage.images, cost, providerLatencyMs, attempts, decision: prepared.decision }), prepared.rules);
      return c.json({ ...result, provider: candidate.providerSlug }, 200, responseHeaders(c, { candidate, attempts, rateLimit: prepared.rateLimitHeaders, chargeNano: cost.userChargeNano }));
    } catch (e) {
      if (e instanceof PipelineError) {
        await finalize(deps, auth, buildRecord(deps, { c, auth, endpoint: "images.generations", modelRequested: body.model, stream: false, status: "ERROR", httpStatus: e.error.status, error: e.error, attempts: e.attempts, decision: prepared.decision }), null);
        throw e.error;
      }
      throw e;
    }
  });

  // Endpoints on the roadmap respond with an explicit, documented error rather than pretending.
  const notYet = (path: string, what: string) =>
    app.post(path, async (c) => {
      await inferenceAuth(c, deps);
      throw Errors.notSupported(`${what} is not available yet. See https://inrent.ai/roadmap for timing.`);
    });
  notYet("/v1/audio/transcriptions", "Audio transcription");
  notYet("/v1/audio/speech", "Text-to-speech");
  notYet("/v1/batches", "The Batch API");
  notYet("/v1/rerank", "Reranking");
  notYet("/v1/videos", "Video generation");
  notYet("/v1/agents", "Hosted agents");
}
