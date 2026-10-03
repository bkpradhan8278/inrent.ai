/** Response metadata from INRENT headers, attached to results as a non-enumerable `_meta`. */
export interface ResponseMeta {
  requestId: string | null;
  traceId: string | null;
  /** Provider that served the request, e.g. `anthropic`. */
  provider: string | null;
  /** Model that served the request (useful with `inrent/auto`). */
  model: string | null;
  /** Number of providers tried before success. */
  fallbacks: number | null;
  /** `platform` (INRENT credits) or `byok` (your provider key). */
  billingMode: string | null;
  /** Amount charged, in USD, as a decimal string. */
  costUsd: string | null;
  rateLimit: { limitRequests: number | null; remainingRequests: number | null; resetRequests: string | null };
  status: number;
}

const num = (v: string | null) => (v === null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function metaFromHeaders(headers: Headers, status: number): ResponseMeta {
  return {
    requestId: headers.get("x-request-id"),
    traceId: headers.get("x-inrent-trace-id"),
    provider: headers.get("x-inrent-provider"),
    model: headers.get("x-inrent-model"),
    fallbacks: num(headers.get("x-inrent-fallbacks")),
    billingMode: headers.get("x-inrent-billing-mode"),
    costUsd: headers.get("x-inrent-cost-usd"),
    rateLimit: {
      limitRequests: num(headers.get("x-ratelimit-limit-requests")),
      remainingRequests: num(headers.get("x-ratelimit-remaining-requests")),
      resetRequests: headers.get("x-ratelimit-reset-requests"),
    },
    status,
  };
}

export type WithMeta<T> = T & { readonly _meta: ResponseMeta };

export function attachMeta<T extends object>(value: T, meta: ResponseMeta): WithMeta<T> {
  Object.defineProperty(value, "_meta", { value: meta, enumerable: false, configurable: true });
  return value as WithMeta<T>;
}
