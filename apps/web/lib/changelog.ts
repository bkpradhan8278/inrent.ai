export interface ChangelogEntry {
  date: string;
  title: string;
  tags: Array<"API" | "Models" | "Providers" | "Dashboard" | "SDK" | "CLI" | "Billing" | "Security" | "Infrastructure">;
  items: string[];
}

/** Release notes. Only shipped work is listed here. */
export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-03",
    title: "Platform foundation",
    tags: ["API", "Dashboard", "Billing", "SDK", "CLI", "Security", "Infrastructure"],
    items: [
      "OpenAI-compatible gateway: chat completions with SSE streaming, completions, a Responses API subset, embeddings, image generation and model discovery.",
      "Routing policies (balanced, lowest cost, lowest latency, best quality), provider preferences, fallback models and automatic failover with a circuit breaker.",
      "API keys with environments, permissions, model allowlists, spend and rate limits, expiry, rotation and revocation; only HMAC digests are stored.",
      "Prepaid credits with an idempotent ledger, Stripe checkout (Razorpay-ready), opt-in auto-recharge, budgets and spending caps.",
      "Dashboard: usage analytics, request logs, billing, projects, team roles, BYOK, webhooks, MCP registry (preview), settings and data export.",
      "Provider integration modes (resale, authorized reseller, BYOK, enterprise, self-hosted, open weights) and model license verification before platform-funded serving.",
      "TypeScript and Python SDKs, the inrent CLI, OpenAPI specification and documentation.",
    ],
  },
];
