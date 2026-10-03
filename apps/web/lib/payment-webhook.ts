import "server-only";
import { configuredPaymentProviders, PaymentSignatureError, processPaymentWebhook } from "@inrent/services/payments";

const MAX_BODY_BYTES = 1_000_000;

/**
 * Shared handler for payment provider webhooks. Reads the raw body (signatures are computed
 * over exact bytes), verifies it inside the provider adapter, and applies the event
 * idempotently. Returns 2xx for duplicates so providers stop retrying.
 */
export async function handlePaymentWebhook(req: Request, provider: "STRIPE" | "RAZORPAY") {
  if (!configuredPaymentProviders().includes(provider)) return Response.json({ error: "not_configured" }, { status: 404 });
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return Response.json({ error: "payload_too_large" }, { status: 413 });
  try {
    const outcome = await processPaymentWebhook(provider, raw, req.headers);
    return Response.json({ received: true, outcome });
  } catch (e) {
    if (e instanceof PaymentSignatureError) return Response.json({ error: "invalid_signature" }, { status: 400 });
    console.error(`[payments:${provider.toLowerCase()}] webhook processing failed`, e instanceof Error ? e.message : e);
    // 500 lets the provider retry; processing is idempotent.
    return Response.json({ error: "processing_failed" }, { status: 500 });
  }
}
