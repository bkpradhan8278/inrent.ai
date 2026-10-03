import { Counter, Histogram, Registry, collectDefaultMetrics } from "prom-client";

/** Prometheus metrics for the gateway. Labels are bounded (no ids, no user input). */
export function createMetrics() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry, prefix: "inrent_gateway_" });
  const requests = new Counter({
    name: "inrent_requests_total",
    help: "Gateway requests by endpoint, model, provider and outcome",
    labelNames: ["endpoint", "model", "provider", "status", "billing_mode"] as const,
    registers: [registry],
  });
  const latency = new Histogram({
    name: "inrent_request_duration_seconds",
    help: "End-to-end request latency",
    labelNames: ["endpoint", "provider", "stream"] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 4, 8, 16, 32, 64, 128],
    registers: [registry],
  });
  const ttft = new Histogram({
    name: "inrent_time_to_first_token_seconds",
    help: "Time to first token for streamed responses",
    labelNames: ["provider"] as const,
    buckets: [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8],
    registers: [registry],
  });
  const tokens = new Counter({ name: "inrent_tokens_total", help: "Tokens processed", labelNames: ["type", "provider"] as const, registers: [registry] });
  const providerErrors = new Counter({ name: "inrent_provider_errors_total", help: "Upstream provider failures", labelNames: ["provider", "code"] as const, registers: [registry] });
  const fallbacks = new Counter({ name: "inrent_fallbacks_total", help: "Requests that fell back to another provider", labelNames: ["from", "to"] as const, registers: [registry] });
  const revenue = new Counter({ name: "inrent_revenue_nano_usd_total", help: "Customer charges (nano-USD)", labelNames: ["provider"] as const, registers: [registry] });
  const providerCost = new Counter({ name: "inrent_provider_cost_nano_usd_total", help: "Provider cost (nano-USD)", labelNames: ["provider"] as const, registers: [registry] });
  const rateLimited = new Counter({ name: "inrent_rate_limited_total", help: "Requests rejected by rate limits", labelNames: ["scope"] as const, registers: [registry] });
  const authFailures = new Counter({ name: "inrent_auth_failures_total", help: "Authentication failures", labelNames: ["reason"] as const, registers: [registry] });
  return { registry, requests, latency, ttft, tokens, providerErrors, fallbacks, revenue, providerCost, rateLimited, authFailures };
}

export type Metrics = ReturnType<typeof createMetrics>;
