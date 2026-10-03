/** Error returned by the INRENT API (or raised for network failures and timeouts). */
export class InrentError extends Error {
  /** HTTP status; 0 for network errors and timeouts. */
  readonly status: number;
  /** Machine-readable code, e.g. `insufficient_credits`, `rate_limit_exceeded`, `model_unavailable`. */
  readonly code: string;
  /** Error class, e.g. `invalid_request_error`, `authentication_error`. */
  readonly type: string;
  readonly param: string | null;
  /** Request ID (`req_…`) — include it when contacting support. */
  readonly requestId: string | null;
  /** Whether retrying the same request may succeed. */
  readonly retryable: boolean;
  readonly headers: Headers | null;

  constructor(init: { status: number; code: string; type: string; message: string; param?: string | null; requestId?: string | null; retryable?: boolean; headers?: Headers | null; cause?: unknown }) {
    super(init.message, init.cause !== undefined ? { cause: init.cause } : undefined);
    this.name = "InrentError";
    this.status = init.status;
    this.code = init.code;
    this.type = init.type;
    this.param = init.param ?? null;
    this.requestId = init.requestId ?? null;
    this.retryable = init.retryable ?? (init.status === 0 || init.status === 408 || init.status === 409 || init.status === 429 || init.status >= 500);
    this.headers = init.headers ?? null;
  }

  static async fromResponse(res: Response): Promise<InrentError> {
    const requestId = res.headers.get("x-request-id");
    type ErrorBody = { error?: { type?: string; code?: string; message?: string; param?: string | null; request_id?: string } };
    let body: ErrorBody | null;
    try {
      body = (await res.json()) as ErrorBody;
    } catch {
      body = null;
    }
    const e = body?.error;
    return new InrentError({
      status: res.status,
      code: e?.code ?? `http_${res.status}`,
      type: e?.type ?? (res.status >= 500 ? "api_error" : "invalid_request_error"),
      message: e?.message ?? `Request failed with status ${res.status}`,
      param: e?.param ?? null,
      requestId: e?.request_id ?? requestId,
      headers: res.headers,
    });
  }
}

export class InrentTimeoutError extends InrentError {
  constructor(timeoutMs: number) {
    super({ status: 0, code: "timeout", type: "api_connection_error", message: `Request timed out after ${timeoutMs} ms`, retryable: true });
    this.name = "InrentTimeoutError";
  }
}

export class InrentConnectionError extends InrentError {
  constructor(cause: unknown) {
    super({ status: 0, code: "connection_error", type: "api_connection_error", message: `Could not reach the INRENT API: ${cause instanceof Error ? cause.message : String(cause)}`, retryable: true, cause });
    this.name = "InrentConnectionError";
  }
}
