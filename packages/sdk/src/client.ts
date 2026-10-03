import { InrentConnectionError, InrentError, InrentTimeoutError } from "./errors";
import { attachMeta, metaFromHeaders, type WithMeta } from "./meta";
import { Stream } from "./streaming";
import { Chat, Completions, Embeddings, Images, Keys, Models, Requests, Responses, Usage } from "./resources";

export const VERSION = "0.1.0";
export const DEFAULT_BASE_URL = "https://api.inrent.ai/v1";

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface ClientOptions {
  /** Defaults to the `INRENT_API_KEY` environment variable. */
  apiKey?: string;
  /** Defaults to `INRENT_BASE_URL` or https://api.inrent.ai/v1. */
  baseURL?: string;
  /** Per-attempt timeout in milliseconds. Default 600 000 (10 min) for long generations. */
  timeout?: number;
  /** Retries for 408/409/429/5xx and connection errors (exponential backoff, honours Retry-After). Default 2. Requests that fail before producing output are not billed. */
  maxRetries?: number;
  defaultHeaders?: Record<string, string>;
  /** Custom fetch implementation (tests, proxies, older runtimes). */
  fetch?: Fetch;
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}

interface InternalRequest {
  method: "GET" | "POST" | "DELETE";
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  stream?: boolean;
  options?: RequestOptions;
}

function readEnv(name: string): string | undefined {
  try {
    const g = globalThis as { process?: { env?: Record<string, string | undefined> }; Deno?: { env?: { get(n: string): string | undefined } } };
    return g.process?.env?.[name] ?? g.Deno?.env?.get(name);
  } catch {
    return undefined;
  }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(signal.reason);
    }, { once: true });
  });

/**
 * INRENT API client.
 *
 * ```ts
 * const client = new Inrent();
 * const r = await client.chat.completions.create({ model: "inrent/auto", messages: [{ role: "user", content: "Hi" }] });
 * ```
 */
export class Inrent {
  readonly baseURL: string;
  readonly timeout: number;
  readonly maxRetries: number;
  private readonly apiKey: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly fetchImpl: Fetch;

  readonly chat: Chat;
  readonly completions: Completions;
  readonly responses: Responses;
  readonly embeddings: Embeddings;
  readonly images: Images;
  readonly models: Models;
  readonly keys: Keys;
  readonly usage: Usage;
  readonly requests: Requests;

  constructor(opts: ClientOptions = {}) {
    const apiKey = opts.apiKey ?? readEnv("INRENT_API_KEY");
    if (!apiKey) throw new Error("Missing API key. Pass { apiKey } or set the INRENT_API_KEY environment variable.");
    this.apiKey = apiKey;
    this.baseURL = (opts.baseURL ?? readEnv("INRENT_BASE_URL") ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.timeout = opts.timeout ?? 600_000;
    this.maxRetries = opts.maxRetries ?? 2;
    this.defaultHeaders = opts.defaultHeaders ?? {};
    const f = opts.fetch ?? (globalThis.fetch as Fetch | undefined);
    if (!f) throw new Error("No fetch implementation found. Use Node 18+ or pass { fetch }.");
    this.fetchImpl = f.bind(globalThis);

    this.chat = new Chat(this);
    this.completions = new Completions(this);
    this.responses = new Responses(this);
    this.embeddings = new Embeddings(this);
    this.images = new Images(this);
    this.models = new Models(this);
    this.keys = new Keys(this);
    this.usage = new Usage(this);
    this.requests = new Requests(this);
  }

  /** @internal */
  async request<T extends object>(req: InternalRequest & { stream?: false }): Promise<WithMeta<T>>;
  /** @internal */
  async request<T>(req: InternalRequest & { stream: true }): Promise<Stream<T>>;
  async request<T>(req: InternalRequest): Promise<WithMeta<T & object> | Stream<T>> {
    const url = new URL(this.baseURL + req.path);
    for (const [k, v] of Object.entries(req.query ?? {})) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    const maxRetries = req.options?.maxRetries ?? this.maxRetries;
    const timeout = req.options?.timeout ?? this.timeout;
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.apiKey}`,
      accept: req.stream ? "text/event-stream" : "application/json",
      "x-inrent-client": `inrent-sdk-js/${VERSION}`,
      ...(req.body !== undefined ? { "content-type": "application/json" } : {}),
      ...this.defaultHeaders,
      ...req.options?.headers,
    };
    const body = req.body !== undefined ? JSON.stringify(req.body) : undefined;

    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const userSignal = req.options?.signal;
      if (userSignal?.aborted) throw userSignal.reason ?? new Error("Aborted");
      const onAbort = () => controller.abort(userSignal?.reason);
      userSignal?.addEventListener("abort", onAbort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeout);

      let res: Response;
      try {
        res = await this.fetchImpl(url.toString(), { method: req.method, headers, body, signal: controller.signal });
      } catch (e) {
        clearTimeout(timer);
        userSignal?.removeEventListener("abort", onAbort);
        if (userSignal?.aborted) throw e;
        const err = timedOut ? new InrentTimeoutError(timeout) : new InrentConnectionError(e);
        if (attempt < maxRetries) {
          await sleep(this.backoff(attempt, null), userSignal);
          continue;
        }
        throw err;
      }

      if (!res.ok) {
        clearTimeout(timer);
        userSignal?.removeEventListener("abort", onAbort);
        const err = await InrentError.fromResponse(res);
        if (err.retryable && attempt < maxRetries) {
          await sleep(this.backoff(attempt, res.headers), userSignal);
          continue;
        }
        throw err;
      }

      const meta = metaFromHeaders(res.headers, res.status);
      if (req.stream) {
        // The timeout covers time-to-first-byte only; streams may run longer.
        clearTimeout(timer);
        return new Stream<T>(res, controller, meta);
      }
      try {
        const json = (await res.json()) as T & object;
        return attachMeta(json, meta);
      } catch (e) {
        if (timedOut) throw new InrentTimeoutError(timeout);
        throw new InrentError({ status: res.status, code: "invalid_response", type: "api_error", message: `Could not parse the API response: ${e instanceof Error ? e.message : String(e)}`, requestId: meta.requestId, retryable: false });
      } finally {
        clearTimeout(timer);
        userSignal?.removeEventListener("abort", onAbort);
      }
    }
  }

  private backoff(attempt: number, headers: Headers | null): number {
    const retryAfter = headers?.get("retry-after");
    if (retryAfter) {
      const s = Number(retryAfter);
      if (Number.isFinite(s) && s >= 0) return Math.min(s * 1000, 60_000);
      const date = Date.parse(retryAfter);
      if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 60_000);
    }
    const base = Math.min(500 * 2 ** attempt, 8000);
    return base / 2 + Math.random() * (base / 2);
  }
}
