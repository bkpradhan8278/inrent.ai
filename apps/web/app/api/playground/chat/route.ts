import { chatCompletionRequestSchema, describeZodError } from "@inrent/core";
import { INTERNAL_ASSERTION_HEADER, signInternalAssertion } from "@inrent/core/server";
import { getWorkspaceForRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

const PASS_HEADERS = ["content-type", "x-request-id", "x-inrent-trace-id", "x-inrent-provider", "x-inrent-model", "x-inrent-fallbacks", "x-inrent-billing-mode", "x-inrent-cost-usd", "retry-after", "x-ratelimit-remaining-requests"];

function error(status: number, code: string, message: string) {
  return Response.json({ error: { type: status === 401 ? "authentication_error" : "invalid_request_error", code, message, param: null, request_id: null } }, { status });
}

/**
 * Dashboard playground → gateway. The browser never holds an API key: the server signs a
 * short-lived internal assertion for the user's active project, and the gateway applies the
 * same rate limits, credit checks, billing and logging as any API request.
 */
export async function POST(req: Request) {
  const ws = await getWorkspaceForRequest(req);
  if (!ws) return error(401, "not_signed_in", "Sign in to run requests in the playground.");
  if (!ws.can("playground:use")) return error(403, "permission_denied", "Your role cannot use the playground.");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return error(400, "invalid_json", "Request body must be valid JSON.");
  }
  const parsed = chatCompletionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    const { message } = describeZodError(parsed.error);
    return error(400, "invalid_request", message);
  }

  const secret = process.env.INTERNAL_SERVICE_SECRET;
  const gateway = process.env.GATEWAY_INTERNAL_URL ?? "http://localhost:8080";
  if (!secret) return error(500, "misconfigured", "Playground is not configured on this server.");

  const assertion = signInternalAssertion({ organizationId: ws.org.id, projectId: ws.project.id, userId: ws.user.id, source: "playground" }, secret, 120);
  let upstream: Response;
  try {
    upstream = await fetch(`${gateway}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", [INTERNAL_ASSERTION_HEADER]: assertion, "user-agent": "inrent-playground" },
      body: JSON.stringify(parsed.data),
      signal: req.signal,
    });
  } catch {
    return error(503, "gateway_unreachable", "The INRENT gateway is unreachable. If you are running locally, start it with `pnpm dev`.");
  }
  const headers = new Headers();
  for (const h of PASS_HEADERS) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }
  headers.set("cache-control", "no-store");
  return new Response(upstream.body, { status: upstream.status, headers });
}
