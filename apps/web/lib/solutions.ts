export interface Solution {
  slug: string;
  title: string;
  headline: string;
  description: string;
  points: Array<{ title: string; body: string }>;
  faq: Array<{ q: string; a: string }>;
}

/** SEO landing pages. Copy is factual about what INRENT does today. */
export const SOLUTIONS: Solution[] = [
  {
    slug: "unified-ai-api",
    title: "Unified AI API",
    headline: "One integration for many AI model providers.",
    description: "Integrate once against a single, OpenAI-compatible API and reach models from multiple providers — with one key, one bill, consistent errors and request-level observability.",
    points: [
      { title: "One schema", body: "Chat, streaming, tools, structured output and embeddings share the OpenAI wire format across providers." },
      { title: "One key, many providers", body: "Use INRENT credits where provider terms allow, or route through your own provider keys (BYOK)." },
      { title: "Consistent errors", body: "Every failure returns the same error shape with a request ID, so retries and alerts are uniform." },
      { title: "Unified usage", body: "Tokens, cost and latency per model, provider, project and key — exportable as CSV or JSON." },
    ],
    faq: [
      { q: "Do I need a separate account with each provider?", a: "Not for models INRENT serves with platform credits. For providers that only allow bring-your-own-key, you add your provider key once in the dashboard." },
      { q: "Which endpoints are supported?", a: "Chat completions (with streaming), completions, a Responses API subset, embeddings, image generation and model listing. Audio endpoints are on the roadmap." },
    ],
  },
  {
    slug: "openai-compatible-api",
    title: "OpenAI-compatible API",
    headline: "Change the base URL. Keep your code.",
    description: "INRENT implements the OpenAI API format, so the official OpenAI SDKs and most OpenAI-compatible tools work by switching the base URL and API key.",
    points: [
      { title: "Drop-in SDK support", body: "Use the OpenAI Python or JavaScript SDK with base_url set to the INRENT API." },
      { title: "Streaming over SSE", body: "Server-sent events in the OpenAI chunk format, including usage on the final chunk when requested." },
      { title: "Tools & structured output", body: "Function calling and JSON-schema responses pass through to providers that support them." },
      { title: "Standard headers", body: "x-request-id, rate-limit headers and retry-after on every response." },
    ],
    faq: [
      { q: "Are model names the same as OpenAI's?", a: "Models are addressed as vendor/model (for example openai/gpt-4.1 or qwen/qwen3-32b). GET /v1/models lists every id." },
      { q: "Is every OpenAI parameter supported?", a: "Common parameters are supported; provider-specific limitations are reflected in each model's capabilities. Unsupported endpoints return a documented not_supported error." },
    ],
  },
  {
    slug: "llm-routing",
    title: "LLM routing & fallback",
    headline: "Route by cost, latency or quality — and fail over automatically.",
    description: "INRENT ranks eligible providers for each request using your routing policy, skips unhealthy endpoints and retries on the next provider when one fails.",
    points: [
      { title: "Policies", body: "Balanced, lowest cost, lowest latency or best quality — per organization or per request." },
      { title: "Fallback before the first byte", body: "Streaming requests can still fail over until the first chunk is sent to you." },
      { title: "Health-aware", body: "Circuit breakers and health checks remove failing providers from rotation quickly." },
      { title: "Explainable", body: "Each request log stores the candidates, attempts and the reason a provider was chosen or skipped." },
    ],
    faq: [
      { q: "Can I pin a provider?", a: "Yes — set inrent.providers.order, only or ignore on the request, or disable fallbacks with allow_fallbacks: false." },
      { q: "What is inrent/auto?", a: "A virtual model that chooses among eligible chat models using your routing policy." },
    ],
  },
  {
    slug: "ai-model-api",
    title: "AI model API",
    headline: "Frontier, open-weight and self-hosted models through one API.",
    description: "Browse the catalog, compare capabilities and prices, then call any enabled model with the same request format.",
    points: [
      { title: "Catalog with verification", body: "Licenses, commercial-use rights and prices are verified before a model is served with platform credits." },
      { title: "Open-weight models", body: "Open-weight models can be served from INRENT-operated vLLM endpoints after license review." },
      { title: "Compare side by side", body: "Context length, modalities, tool calling and pricing in one view." },
      { title: "Playground", body: "Test prompts against any model and export the request as code." },
    ],
    faq: [{ q: "How do I know a model is usable?", a: "Each model shows Available (INRENT credits), Bring your own key, or Not yet enabled." }],
  },
  {
    slug: "ai-inference-api",
    title: "AI inference API",
    headline: "Production inference with guardrails built in.",
    description: "Rate limits, credit checks, budgets, request logging and webhooks wrap every inference call — so you ship features, not plumbing.",
    points: [
      { title: "Budgets that hold", body: "Project, organization and key limits are checked before a provider is called." },
      { title: "Exact metering", body: "Usage is charged from provider-reported tokens with BigInt arithmetic — no float rounding drift." },
      { title: "Webhooks", body: "Signed events for completed and failed requests, low credit and provider health changes." },
      { title: "Privacy controls", body: "Prompt and response logging are off by default; zero-retention mode is available." },
    ],
    faq: [{ q: "Is inference asynchronous?", a: "No — requests are synchronous (or streamed). Background jobs handle billing retries, webhooks and analytics." }],
  },
];

export function getSolution(slug: string) {
  return SOLUTIONS.find((s) => s.slug === slug) ?? null;
}
