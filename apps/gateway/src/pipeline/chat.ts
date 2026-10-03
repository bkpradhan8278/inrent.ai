import type { Context } from "hono";
import {
  estimateMessagesTokens,
  estimateTextTokens,
  InrentError,
  normalizeUsage,
  type ChatCompletion,
  type ChatCompletionChunk,
  type ChatCompletionRequestInput,
  type NormalizedUsage,
} from "@inrent/core";
import type { ChatStream, UpstreamChatRequest } from "@inrent/providers";
import type { GatewayState } from "../state";
import type { GatewayAuth, GatewayDeps, GatewayEnv } from "../types";
import { policyFrom, preferencesFrom, requirementsFromChat } from "./candidates";
import { buildRecord, costFor, finalize, PipelineError, prepare, responseHeaders, runWithFallback, type Attempt, type Prepared } from "./execute";

export function toUpstream(body: ChatCompletionRequestInput, providerModelId: string): UpstreamChatRequest {
  const { inrent: _inrent, metadata: _metadata, model: _model, stream: _stream, stream_options: _so, ...rest } = body;
  return { ...(rest as Omit<UpstreamChatRequest, "model">), model: providerModelId };
}

function estimateUsage(body: ChatCompletionRequestInput, outputText: string): NormalizedUsage {
  return {
    inputTokens: estimateMessagesTokens(body.messages),
    outputTokens: estimateTextTokens(outputText),
    cachedTokens: 0,
    reasoningTokens: 0,
    estimated: true,
  };
}

export interface ChatResult {
  completion: ChatCompletion;
  headers: Record<string, string>;
}

async function logFailure(c: Context<GatewayEnv>, deps: GatewayDeps, auth: GatewayAuth, endpoint: string, body: ChatCompletionRequestInput, err: InrentError, attempts: Attempt[], prepared: Prepared | null) {
  const last = attempts.filter((a) => a.outcome !== "skipped").at(-1);
  const candidate = last ? (prepared?.ranked.find((r) => r.providerSlug === last.provider && r.modelSlug === last.model) ?? null) : null;
  const record = buildRecord(deps, {
    c,
    auth,
    endpoint,
    modelRequested: body.model,
    stream: Boolean(body.stream),
    candidate,
    status: err.code === "client_closed_request" ? "CANCELLED" : "ERROR",
    httpStatus: err.status,
    error: err,
    attempts,
    decision: prepared?.decision ?? null,
    prompt: { messages: body.messages },
  });
  await finalize(deps, auth, record, null);
}

/**
 * Shared chat pipeline used by /v1/chat/completions, /v1/completions and /v1/responses.
 * Returns either a JSON completion or a streaming Response.
 */
export async function runChat(
  c: Context<GatewayEnv>,
  deps: GatewayDeps,
  state: GatewayState,
  auth: GatewayAuth,
  body: ChatCompletionRequestInput,
  opts: { endpoint: string; transformChunk?: (chunk: ChatCompletionChunk) => string | null; doneMarker?: string | null },
): Promise<{ kind: "json"; result: ChatResult } | { kind: "stream"; response: Response }> {
  const estimatedInputTokens = estimateMessagesTokens(body.messages);
  const maxOutput = body.max_completion_tokens ?? body.max_tokens ?? null;
  let prepared: Prepared | null = null;
  try {
    prepared = await prepare(c, deps, state, {
      auth,
      kind: "chat",
      modelRequested: body.model,
      fallbackModels: body.inrent?.fallback_models,
      requirements: requirementsFromChat(body),
      policy: policyFrom(body.inrent?.route, auth.routingPolicy),
      preferences: preferencesFrom(body.inrent, auth.preferByok),
      estimatedInputTokens,
      maxOutputTokens: maxOutput,
    });
  } catch (e) {
    if (e instanceof InrentError && e.status !== 429 && e.status !== 401) {
      await logFailure(c, deps, auth, opts.endpoint, body, e, [], null);
    }
    throw e;
  }
  const p = prepared;
  const signal = c.req.raw.signal;

  if (!body.stream) {
    let outcome;
    try {
      outcome = await runWithFallback(deps, state, p, c.get("requestId"), (adapter, candidate) =>
        adapter.chat(toUpstream(body, candidate.providerModelId), { requestId: c.get("requestId"), signal }),
      );
    } catch (e) {
      if (e instanceof PipelineError) {
        await logFailure(c, deps, auth, opts.endpoint, body, e.error, e.attempts, p);
        throw e.error;
      }
      throw e;
    }
    const { result: completion, candidate, meta, attempts, providerLatencyMs } = outcome;
    const text = completion.choices.map((ch) => (typeof ch.message.content === "string" ? ch.message.content : "")).join("");
    const usage = normalizeUsage(completion.usage) ?? estimateUsage(body, text);
    const cost = costFor(candidate, meta, usage, deps);
    const record = buildRecord(deps, {
      c,
      auth,
      endpoint: opts.endpoint,
      modelRequested: body.model,
      stream: false,
      candidate,
      meta,
      status: "SUCCESS",
      httpStatus: 200,
      usage,
      cost,
      finishReason: completion.choices[0]?.finish_reason ?? null,
      providerLatencyMs,
      attempts,
      decision: p.decision,
      prompt: { messages: body.messages },
      response: { choices: completion.choices },
    });
    await finalize(deps, auth, record, p.rules);
    completion.model = candidate.modelSlug;
    completion.provider = candidate.providerSlug;
    if (!completion.usage) {
      completion.usage = { prompt_tokens: usage.inputTokens, completion_tokens: usage.outputTokens, total_tokens: usage.inputTokens + usage.outputTokens };
    }
    return { kind: "json", result: { completion, headers: responseHeaders(c, { candidate, attempts, rateLimit: p.rateLimitHeaders, chargeNano: cost.userChargeNano }) } };
  }

  // ── Streaming ────────────────────────────────────────────────────────────
  // Fallback is possible until the first chunk is received; after that we are committed.
  const upstreamAbort = new AbortController();
  const onClientAbort = () => upstreamAbort.abort();
  signal.addEventListener("abort", onClientAbort, { once: true });
  const streamStarted = performance.now();
  let outcome: Awaited<ReturnType<typeof runWithFallback<{ stream: ChatStream; iterator: AsyncIterator<ChatCompletionChunk>; first: IteratorResult<ChatCompletionChunk> }>>>;
  try {
    outcome = await runWithFallback(deps, state, p, c.get("requestId"), async (adapter, candidate) => {
      const stream = await adapter.chatStream(toUpstream(body, candidate.providerModelId), { requestId: c.get("requestId"), signal: upstreamAbort.signal });
      const iterator = stream[Symbol.asyncIterator]();
      const first = await iterator.next();
      return { stream, iterator, first };
    });
  } catch (e) {
    signal.removeEventListener("abort", onClientAbort);
    if (e instanceof PipelineError) {
      await logFailure(c, deps, auth, opts.endpoint, body, e.error, e.attempts, p);
      throw e.error;
    }
    throw e;
  }
  const { candidate, meta, attempts } = outcome;
  const { iterator } = outcome.result;
  let pending: IteratorResult<ChatCompletionChunk> | null = outcome.result.first;
  const ttftMs = Math.round(performance.now() - streamStarted);
  const includeUsage = body.stream_options?.include_usage === true;
  const encoder = new TextEncoder();
  let text = "";
  let usage: NormalizedUsage | null = null;
  let finishReason: string | null = null;
  let finalized = false;

  const finish = async (status: "SUCCESS" | "ERROR" | "CANCELLED", error: InrentError | null) => {
    if (finalized) return;
    finalized = true;
    signal.removeEventListener("abort", onClientAbort);
    const u = usage ?? estimateUsage(body, text);
    const cost = costFor(candidate, meta, u, deps);
    const record = buildRecord(deps, {
      c,
      auth,
      endpoint: opts.endpoint,
      modelRequested: body.model,
      stream: true,
      candidate,
      meta,
      status,
      httpStatus: status === "SUCCESS" ? 200 : status === "CANCELLED" ? 499 : error?.status ?? 502,
      error,
      usage: u,
      cost,
      finishReason,
      ttftMs,
      providerLatencyMs: Math.round(performance.now() - streamStarted),
      attempts,
      decision: p.decision,
      prompt: { messages: body.messages },
      response: { content: text, finish_reason: finishReason },
    });
    await finalize(deps, auth, record, p.rules);
  };

  const serialize = (chunk: ChatCompletionChunk): string | null => {
    chunk.model = candidate.modelSlug;
    chunk.provider = candidate.providerSlug;
    for (const choice of chunk.choices) {
      if (typeof choice.delta?.content === "string") text += choice.delta.content;
      if (choice.finish_reason) finishReason = choice.finish_reason;
    }
    if (chunk.usage) {
      usage = normalizeUsage(chunk.usage);
      if (!includeUsage) {
        if (!chunk.choices.length) return null;
        delete chunk.usage;
      }
    }
    if (opts.transformChunk) return opts.transformChunk(chunk);
    return JSON.stringify(chunk);
  };

  const readable = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        // Keep reading until there is something to send: some chunks (e.g. usage the client
        // did not ask for) are dropped, and a pull that enqueues nothing may not be re-invoked.
        for (;;) {
          const next = pending ?? (await iterator.next());
          pending = null;
          if (next.done) {
            if (opts.doneMarker !== null) controller.enqueue(encoder.encode(`data: ${opts.doneMarker ?? "[DONE]"}\n\n`));
            controller.close();
            await finish("SUCCESS", null);
            return;
          }
          const data = serialize(next.value);
          if (data !== null) {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            return;
          }
        }
      } catch (e) {
        const err = e instanceof InrentError ? e : new InrentError("provider_error", "stream_interrupted", "The upstream stream was interrupted.");
        if (upstreamAbort.signal.aborted) {
          await finish("CANCELLED", err);
          try {
            controller.close();
          } catch {
            /* client already gone */
          }
          return;
        }
        // Mid-stream failure: report it in-band (OpenAI style) and end the stream.
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(err.toBody(c.get("requestId")))}\n\n`));
        controller.close();
        await finish("ERROR", err);
      }
    },
    async cancel() {
      upstreamAbort.abort();
      await iterator.return?.().catch(() => undefined);
      await finish("CANCELLED", new InrentError("api_error", "client_closed_request", "Client disconnected.", { status: 499 }));
    },
  });

  return {
    kind: "stream",
    response: new Response(readable, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no",
        ...responseHeaders(c, { candidate, attempts, rateLimit: p.rateLimitHeaders }),
      },
    }),
  };
}
