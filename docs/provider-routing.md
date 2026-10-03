# Provider integration & routing

## Principle

INRENT never assumes it may resell access to a provider's API. Every provider has an **integration mode** chosen by an administrator. Platform-funded serving (customers paying INRENT credits) is only possible when the legal basis is recorded. Everything else is bring-your-own-key (BYOK), where the customer's own agreement with the provider applies.

## Integration modes

| Mode                  | Meaning                                                      | Platform-funded serving requires                                                                                                                            |
| --------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DIRECT_RESALE`       | Provider terms reviewed and they permit reselling API access | `resaleVerified` set by an admin (with a terms URL recorded), the model marked `resaleAllowed = true`, an active price and a resolvable platform credential |
| `AUTHORIZED_RESELLER` | INRENT holds a reseller or partner agreement                 | Same as above. The terms reference points at the agreement                                                                                                  |
| `CUSTOM_ENTERPRISE`   | A provider agreement covering specific customers             | Only for organizations covered by that agreement                                                                                                            |
| `SELF_HOSTED`         | INRENT-operated inference (for example vLLM)                 | Model license verified for commercial use (`commercialUse = true`), an active price and a resolvable credential                                             |
| `OPEN_WEIGHT`         | Open-weight model served by an inference partner             | Model license verified for commercial use, an active price and a resolvable credential (record the partner's terms on the provider)                         |
| `BYOK`                | Customers bring their own provider key                       | Never platform-funded                                                                                                                                       |

`null` license, commercial-use or resale values count as **not allowed**. For platform funding the model must also be `VERIFIED` (not `NEEDS_REVIEW` or `RESTRICTED`). A `DISABLED` model or endpoint is never served, BYOK included. `BETA` models need the beta flag. Development mock providers and dev-only models are refused in production.

The decision is a pure function, `evaluateServing` (`packages/core/src/policy.ts`), that returns separate `platform` and `byok` eligibility with a reason. The gateway uses those reasons to explain unavailability (for example _"This model is available with your own provider key — add one under BYOK"_) instead of returning a generic error.

### Admin workflow

1. Admin → Providers: choose the integration mode, record the terms URL and legal-review notes, and set the **credential reference** (`env:OPENAI_API_KEY`, `vault:…`, `aws-sm:…`, `gcp-sm:…`, never the secret itself). Mark resale as verified only after review.
2. Admin → Models & pricing: record the license, commercial-use and resale flags, and verification status.
3. Publish a price per endpoint with its source. Prices are versioned, and the previous version is closed.
4. Enable the endpoint and provider. Each step is audit-logged.

The seeded catalog (`packages/db/prisma/catalog.ts`) lists real providers and models as **disabled, BYOK-mode and `NEEDS_REVIEW`, with no prices**, so nothing is served with platform funds until someone completes this workflow.

## BYOK

Customers add provider keys in the dashboard. Keys are encrypted with AES-256-GCM, bound to the organization and provider, and decrypted only inside the gateway. When an organization prefers BYOK (the default), its own keys rank first. Platform-funded endpoints remain available as fallback where they're permitted. BYOK requests are billed by the provider. INRENT charges only the optional `BYOK_FEE_PCT`.

## Routing

Candidates are every enabled endpoint of the requested model (or, for `inrent/auto`, of eligible chat models) that passes the serving policy, through either platform funding or the organization's BYOK keys.

### Filters

Candidates are excluded (with a recorded reason) when:

- the provider is `DOWN` (health checks) or its circuit breaker is open,
- the request's `inrent.providers.only` or `ignore` excludes it,
- it lacks a required capability (tools, vision, JSON mode, structured output, streaming),
- the estimated input plus requested output exceeds its context length,
- the key or project model allowlist excludes the model.

### Scoring

Cost, latency (TTFT p50, else latency p50) and quality tier are min-max normalized across the remaining candidates (unknown values count as 0.5), then combined by policy. Lower scores rank first:

| Policy               | Score                                         |
| -------------------- | --------------------------------------------- |
| `BALANCED` (default) | 0.45·cost + 0.35·latency + 0.20·(1 − quality) |
| `LOWEST_COST`        | cost + 0.05·latency                           |
| `LOWEST_LATENCY`     | latency + 0.05·cost                           |
| `BEST_QUALITY`       | (1 − quality) + 0.05·cost + 0.05·latency      |

Adjustments: `DEGRADED` +1.5 (kept only as a fallback), `UNKNOWN` health +0.05, BYOK −3 when the organization prefers BYOK. `inrent.providers.order` overrides the score ordering. Ties break by provider priority, then endpoint priority, then slug.

The policy comes from the request (`inrent.route`), else the organization setting. Up to **3** candidates are attempted by default, or 1 when `allow_fallbacks: false`. If the primary model has no healthy candidate, the models in `inrent.fallback_models` are tried in order.

### Fallback rules

- Retryable failures (connection errors, timeouts, 408/409/429, 5xx from the provider) move on to the next candidate.
- Client errors (400/422, content policy) do **not** fall back. They'd fail everywhere and would multiply cost.
- Streaming falls back only **before the first byte**. After that, an upstream failure is reported in-band and the stream ends. Tokens already produced are billed.
- Every attempt (provider, model, billing mode, outcome, status, latency) is stored in `Request.routing` and shown on the request detail page.

### Health and circuit breaking

- The worker runs a health check for every enabled provider each minute and derives `HEALTHY`, `DEGRADED` or `DOWN` from recent results. Transitions emit `provider.down` / `provider.recovered` webhooks.
- Each gateway instance keeps a circuit breaker per provider. When the failure ratio is high over a short window it opens for 30 s, then lets traffic probe again.

## Adapters

`packages/providers` implements the `ProviderAdapter` interface (`chat`, `chatStream`, `embeddings`, `images`, `listModels`, `healthCheck`):

- **OpenAI-compatible:** OpenAI, xAI, Mistral, DeepSeek, Groq, Together, Fireworks, Cerebras, OpenRouter, vLLM, Ollama, LiteLLM and others that speak `/v1/chat/completions`.
- **Anthropic:** translates the Messages API (system prompts, tools, images, streaming events, usage) to and from the OpenAI format.
- **Mock (development only):** deterministic responses with failure injection (`mock://local?fail=…`) for tests and local development.

Adding a provider: implement the interface (or reuse the OpenAI-compatible adapter with a base URL), add it to the catalog as disabled and BYOK, then follow the admin workflow above.
