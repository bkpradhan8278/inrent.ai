/**
 * Error model shared by the gateway, the dashboard and the SDKs.
 *
 * Wire format (OpenAI-compatible superset):
 * { "error": { "type": "...", "code": "...", "message": "...", "param": null, "request_id": "req_..." } }
 */

export type ErrorType =
  | "invalid_request_error"
  | "authentication_error"
  | "permission_error"
  | "not_found_error"
  | "rate_limit_error"
  | "insufficient_credits_error"
  | "budget_exceeded_error"
  | "model_unavailable_error"
  | "provider_error"
  | "timeout_error"
  | "conflict_error"
  | "not_supported_error"
  | "api_error";

export const ERROR_STATUS: Record<ErrorType, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  insufficient_credits_error: 402,
  permission_error: 403,
  not_found_error: 404,
  conflict_error: 409,
  budget_exceeded_error: 402,
  rate_limit_error: 429,
  not_supported_error: 501,
  model_unavailable_error: 503,
  provider_error: 502,
  timeout_error: 504,
  api_error: 500,
};

export interface ErrorBody {
  error: {
    type: ErrorType;
    code: string;
    message: string;
    param: string | null;
    request_id: string | null;
    details?: Record<string, unknown>;
  };
}

export class InrentError extends Error {
  readonly type: ErrorType;
  readonly code: string;
  readonly status: number;
  readonly param: string | null;
  readonly details?: Record<string, unknown>;
  /** Whether a different provider might succeed (used by fallback routing). */
  readonly retryable: boolean;
  readonly headers?: Record<string, string>;

  constructor(
    type: ErrorType,
    code: string,
    message: string,
    opts: {
      status?: number;
      param?: string | null;
      details?: Record<string, unknown>;
      retryable?: boolean;
      headers?: Record<string, string>;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: opts.cause });
    this.name = "InrentError";
    this.type = type;
    this.code = code;
    this.status = opts.status ?? ERROR_STATUS[type];
    this.param = opts.param ?? null;
    this.details = opts.details;
    this.retryable = opts.retryable ?? false;
    this.headers = opts.headers;
  }

  toBody(requestId: string | null): ErrorBody {
    return {
      error: {
        type: this.type,
        code: this.code,
        message: this.message,
        param: this.param,
        request_id: requestId,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}

export function isInrentError(e: unknown): e is InrentError {
  return e instanceof InrentError;
}

/** Shorthand constructors for the common cases. */
export const Errors = {
  invalidRequest: (message: string, param: string | null = null, code = "invalid_request") =>
    new InrentError("invalid_request_error", code, message, { param }),
  missingApiKey: () =>
    new InrentError(
      "authentication_error",
      "missing_api_key",
      "No API key provided. Send it as 'Authorization: Bearer sk-inrent-…'.",
    ),
  invalidApiKey: () =>
    new InrentError("authentication_error", "invalid_api_key", "The API key is invalid."),
  revokedApiKey: () =>
    new InrentError("authentication_error", "revoked_api_key", "This API key has been revoked."),
  expiredApiKey: () =>
    new InrentError("authentication_error", "expired_api_key", "This API key has expired."),
  permissionDenied: (message: string, code = "permission_denied") =>
    new InrentError("permission_error", code, message),
  modelNotFound: (model: string) =>
    new InrentError(
      "not_found_error",
      "model_not_found",
      `The model '${model}' does not exist or is not available to your organization.`,
      { param: "model" },
    ),
  modelNotAllowed: (model: string) =>
    new InrentError(
      "permission_error",
      "model_not_allowed",
      `This API key or project is not allowed to use '${model}'.`,
      { param: "model" },
    ),
  modelUnavailable: (model: string, reason: string, details?: Record<string, unknown>) =>
    new InrentError("model_unavailable_error", "model_unavailable", `'${model}' is unavailable: ${reason}`, {
      param: "model",
      details,
    }),
  insufficientCredits: (details?: Record<string, unknown>) =>
    new InrentError(
      "insufficient_credits_error",
      "insufficient_credits",
      "Your organization's credit balance is too low for this request. Add credits or enable auto-recharge.",
      { details },
    ),
  budgetExceeded: (scope: "project" | "organization" | "api_key" | "member", details?: Record<string, unknown>) =>
    new InrentError(
      "budget_exceeded_error",
      `${scope}_budget_exceeded`,
      scope === "api_key"
        ? "This API key has reached its spending limit."
        : `Your ${scope === "organization" ? "organization" : scope}'s monthly budget has been reached.`,
      { details },
    ),
  rateLimited: (message: string, headers: Record<string, string>, code = "rate_limit_exceeded") =>
    new InrentError("rate_limit_error", code, message, { headers }),
  notSupported: (message: string, code = "endpoint_not_supported") =>
    new InrentError("not_supported_error", code, message),
  providerError: (message: string, opts: { retryable?: boolean; status?: number; code?: string } = {}) =>
    new InrentError("provider_error", opts.code ?? "provider_error", message, {
      retryable: opts.retryable ?? true,
      status: opts.status ?? 502,
    }),
  timeout: (message = "The upstream provider did not respond in time.") =>
    new InrentError("timeout_error", "upstream_timeout", message, { retryable: true }),
  suspended: () =>
    new InrentError(
      "permission_error",
      "organization_suspended",
      "This organization is suspended. Contact support for details.",
    ),
  internal: (message = "An unexpected error occurred. It has been logged.") =>
    new InrentError("api_error", "internal_error", message),
};

/**
 * Human-oriented catalog used by the docs and the dashboard to explain errors:
 * what happened, why, and how to fix it.
 */
export const ERROR_CATALOG: Array<{
  code: string;
  type: ErrorType;
  status: number;
  what: string;
  fix: string;
}> = [
  { code: "missing_api_key", type: "authentication_error", status: 401, what: "No API key was sent.", fix: "Send 'Authorization: Bearer $INRENT_API_KEY'." },
  { code: "invalid_api_key", type: "authentication_error", status: 401, what: "The key does not match any active key.", fix: "Copy the key again or create a new one in Dashboard → API Keys." },
  { code: "revoked_api_key", type: "authentication_error", status: 401, what: "The key was revoked.", fix: "Create a new key; revoked keys cannot be restored." },
  { code: "expired_api_key", type: "authentication_error", status: 401, what: "The key passed its expiration date.", fix: "Rotate the key or create a new one." },
  { code: "invalid_request", type: "invalid_request_error", status: 400, what: "The request body failed validation.", fix: "Check the 'param' field and the API reference." },
  { code: "model_not_found", type: "not_found_error", status: 404, what: "The model slug is unknown or hidden.", fix: "List models with GET /v1/models and use the 'id' field." },
  { code: "model_not_allowed", type: "permission_error", status: 403, what: "The key or project restricts which models it can call.", fix: "Update the key's or project's model allowlist." },
  { code: "model_unavailable", type: "model_unavailable_error", status: 503, what: "No eligible provider can serve the model right now.", fix: "Add a BYOK key for the provider, choose another model, or enable fallbacks." },
  { code: "insufficient_credits", type: "insufficient_credits_error", status: 402, what: "The organization's balance cannot cover the request.", fix: "Add credits in Billing or enable auto-recharge." },
  { code: "project_budget_exceeded", type: "budget_exceeded_error", status: 402, what: "The project reached its monthly budget.", fix: "Increase the project budget or wait for the next period." },
  { code: "organization_budget_exceeded", type: "budget_exceeded_error", status: 402, what: "The organization reached its monthly spending cap.", fix: "Raise the cap in Billing → Limits." },
  { code: "api_key_budget_exceeded", type: "budget_exceeded_error", status: 402, what: "The API key reached its spending limit.", fix: "Raise the key's limit or create a new key." },
  { code: "rate_limit_exceeded", type: "rate_limit_error", status: 429, what: "Too many requests or tokens in the current window.", fix: "Back off using the 'retry-after' header, or raise limits." },
  { code: "provider_error", type: "provider_error", status: 502, what: "The upstream provider returned an error.", fix: "Retry, or allow fallbacks so another provider can serve the request." },
  { code: "upstream_timeout", type: "timeout_error", status: 504, what: "The upstream provider did not respond in time.", fix: "Retry with a smaller request or allow fallbacks." },
  { code: "endpoint_not_supported", type: "not_supported_error", status: 501, what: "The endpoint or feature is not available for this model yet.", fix: "Check the model's supported endpoints on its model page." },
  { code: "organization_suspended", type: "permission_error", status: 403, what: "The organization is suspended.", fix: "Contact support." },
  { code: "internal_error", type: "api_error", status: 500, what: "Something failed inside INRENT.", fix: "Retry. If it persists, contact support with the request_id." },
];
