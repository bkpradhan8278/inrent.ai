import { InrentError } from "@inrent/core";

/** Redacts anything that looks like a credential from upstream error text. */
export function redactSecrets(text: string): string {
  return text
    .replace(/\b(sk|rk|pk|whsec|sk-ant|sk-proj|sk-or|gsk|xai|hf)[-_][A-Za-z0-9_\-*.]{6,}/g, "[redacted]")
    .replace(/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer [redacted]")
    .slice(0, 1_000);
}

function extractMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const err = b.error;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && typeof (err as Record<string, unknown>).message === "string") {
    return (err as Record<string, unknown>).message as string;
  }
  if (typeof b.message === "string") return b.message;
  if (typeof b.detail === "string") return b.detail;
  return null;
}

/** Maps an upstream HTTP failure to an InrentError, deciding whether fallback should be attempted. */
export async function upstreamError(provider: string, res: Response): Promise<InrentError> {
  let message: string | null = null;
  try {
    const text = await res.text();
    try {
      message = extractMessage(JSON.parse(text));
    } catch {
      message = text || null;
    }
  } catch {
    message = null;
  }
  const safe = redactSecrets(message ?? res.statusText ?? "Upstream error");
  const status = res.status;
  if (status === 400 || status === 422 || status === 413) {
    return new InrentError("invalid_request_error", "upstream_invalid_request", `${provider}: ${safe}`, {
      retryable: false,
      details: { provider, upstream_status: status },
    });
  }
  if (status === 401 || status === 403) {
    return new InrentError("provider_error", "upstream_authentication_failed", `${provider} rejected the credential.`, {
      retryable: true,
      status: 502,
      details: { provider, upstream_status: status },
    });
  }
  if (status === 404) {
    return new InrentError("provider_error", "upstream_model_not_found", `${provider}: ${safe}`, {
      retryable: true,
      status: 502,
      details: { provider, upstream_status: status },
    });
  }
  if (status === 429) {
    return new InrentError("provider_error", "upstream_rate_limited", `${provider} is rate limiting requests.`, {
      retryable: true,
      status: 429,
      details: { provider, upstream_status: status },
    });
  }
  return new InrentError("provider_error", "upstream_error", `${provider}: ${safe}`, {
    retryable: true,
    status: 502,
    details: { provider, upstream_status: status },
  });
}

export function networkError(provider: string, err: unknown): InrentError {
  if (err instanceof InrentError) return err;
  const name = err instanceof Error ? err.name : "";
  if (name === "TimeoutError") {
    return new InrentError("timeout_error", "upstream_timeout", `${provider} did not respond in time.`, {
      retryable: true,
      details: { provider },
    });
  }
  if (name === "AbortError") {
    return new InrentError("api_error", "client_closed_request", "The request was cancelled.", {
      retryable: false,
      status: 499,
    });
  }
  return new InrentError("provider_error", "upstream_unreachable", `${provider} could not be reached.`, {
    retryable: true,
    details: { provider },
    cause: err,
  });
}
