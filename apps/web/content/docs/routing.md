---
title: Routing & fallback
description: How INRENT chooses a provider for each request and recovers from failures.
---

## Eligibility

For each request, INRENT collects every endpoint that can serve the model and filters out those that:

- are disabled, or whose provider is down (failing health checks or an open circuit breaker);
- are not permitted for your organization — for example, a provider without verified resale terms and no BYOK key;
- lack a capability the request needs (tools, vision, JSON mode, structured output, streaming);
- have a context window too small for the prompt plus `max_tokens`;
- are excluded by your key or project model allowlist.

## Policies

| Policy | Prefers |
| --- | --- |
| `balanced` (default) | A weighted mix of price, measured latency and quality tier |
| `lowest_cost` | Cheapest eligible endpoint |
| `lowest_latency` | Lowest measured time-to-first-token |
| `best_quality` | Highest quality tier |

Set a default per organization in **Settings → Routing**, or per request:

```json
{ "model": "meta/llama-3.3-70b-instruct", "messages": [...], "inrent": { "route": "lowest_cost" } }
```

Degraded providers stay eligible but are ranked behind healthy ones. When your organization prefers BYOK, endpoints you hold keys for are tried first.

## Provider preferences

```json
"inrent": {
  "providers": {
    "order": ["groq", "together"],
    "only": ["groq", "together", "fireworks"],
    "ignore": ["cerebras"],
    "allow_fallbacks": true
  }
}
```

## Fallback

INRENT tries up to three endpoints for a model. It moves to the next one on retryable failures: timeouts, network errors, 5xx responses, upstream rate limits, and rejected provider credentials. It does **not** retry `400` validation errors, because another provider would reject them too.

`fallback_models` adds whole models to try after the primary model's providers:

```json
"inrent": { "fallback_models": ["qwen/qwen3-32b", "inrent/auto"] }
```

For streaming requests, fallback works until the first chunk arrives.

## Observability

Every request log stores the routing policy, every attempt (provider, outcome, status and latency) and the reasons candidates were rejected. The response headers `x-inrent-provider` and `x-inrent-fallbacks` summarize the decision.
