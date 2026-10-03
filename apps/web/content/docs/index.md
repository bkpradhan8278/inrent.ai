---
title: Introduction
description: INRENT is one OpenAI-compatible API for leading AI models — with routing, fallback, unified billing and observability.
---

INRENT sits between your application and AI model providers. You call one API with one key; INRENT authenticates the request, applies your limits and budgets, routes it to an eligible provider, normalizes the response, and records usage and cost.

## What you get

- **One API, many models.** Chat, streaming, tools, structured output, embeddings and images in the OpenAI format.
- **Routing and fallback.** Policies for cost, latency or quality, with automatic failover between providers.
- **Unified billing.** Prepaid credits, exact per-request costs, and spend limits on organizations, projects and keys.
- **Observability.** Request logs, latency, time-to-first-token, tokens, errors and routing decisions.
- **Bring your own key.** Use your own provider accounts through the same API.
- **Security by default.** Hashed API keys, encrypted secrets, RBAC, audit logs and privacy-first logging.

## How a request flows

```text
Your app ──► api.inrent.ai/v1
               │ authenticate key ─ rate limits ─ credits & budgets ─ policy
               ▼
             Router ── ranks eligible providers (cost · latency · quality · health)
               │
               ├──► Provider A ──✕ (retryable failure)
               └──► Provider B ──✓ response normalized, usage billed, request logged
```

## Make your first request

```bash tab="cURL"
curl {{API_BASE_URL}}/chat/completions \
  -H "Authorization: Bearer $INRENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model": "inrent/auto", "messages": [{"role": "user", "content": "Hello"}]}'
```

```python tab="Python"
from openai import OpenAI

client = OpenAI(base_url="{{API_BASE_URL}}", api_key="sk-inrent-...")
completion = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Hello"}],
)
print(completion.choices[0].message.content)
```

```javascript tab="JavaScript"
import OpenAI from "openai";

const client = new OpenAI({ baseURL: "{{API_BASE_URL}}", apiKey: process.env.INRENT_API_KEY });
const completion = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Hello" }],
});
console.log(completion.choices[0].message.content);
```

> [!TIP]
> New here? Follow the [Quickstart](/docs/quickstart) — it takes under five minutes.

## Availability, honestly

Every model in the [catalog](/models) shows one of three states:

| State | Meaning |
| --- | --- |
| **Available** | Served with INRENT credits. Provider terms, license and price have been verified. |
| **Bring your own key** | Usable with your own provider key (BYOK). |
| **Not yet enabled** | Listed for reference; not routable yet. |

GPU Cloud, hosted agents and MCP tool execution are on the [roadmap](/roadmap) and are not available today.
