import { networkError, upstreamError } from "./errors";
import type { CallOptions, ProviderConfig } from "./types";

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_STREAM_IDLE_MS = 60_000;

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function signalFor(config: ProviderConfig, opts: CallOptions): AbortSignal {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? config.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  return opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
}

/** POSTs JSON upstream and returns the Response once headers arrive; maps failures to InrentError. */
export async function postJson(
  config: ProviderConfig,
  path: string,
  body: unknown,
  headers: Record<string, string>,
  opts: CallOptions,
): Promise<{ res: Response; ttfbMs: number }> {
  const doFetch = config.fetchImpl ?? fetch;
  const started = performance.now();
  let res: Response;
  try {
    res = await doFetch(joinUrl(config.baseUrl, path), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "inrent-gateway/0.1",
        "x-request-id": opts.requestId,
        ...config.extraHeaders,
        ...headers,
      },
      body: JSON.stringify(body),
      signal: signalFor(config, opts),
    });
  } catch (err) {
    throw networkError(config.slug, err);
  }
  if (!res.ok) throw await upstreamError(config.slug, res);
  return { res, ttfbMs: Math.round(performance.now() - started) };
}

export async function getJson(
  config: ProviderConfig,
  path: string,
  headers: Record<string, string>,
  opts: CallOptions,
): Promise<{ res: Response; latencyMs: number }> {
  const doFetch = config.fetchImpl ?? fetch;
  const started = performance.now();
  let res: Response;
  try {
    res = await doFetch(joinUrl(config.baseUrl, path), {
      method: "GET",
      headers: { "user-agent": "inrent-gateway/0.1", ...config.extraHeaders, ...headers },
      signal: signalFor(config, { ...opts, timeoutMs: opts.timeoutMs ?? 10_000 }),
    });
  } catch (err) {
    throw networkError(config.slug, err);
  }
  return { res, latencyMs: Math.round(performance.now() - started) };
}

export async function readJson<T>(provider: string, res: Response): Promise<T> {
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw networkError(provider, err);
  }
}
