---
title: Models
description: Discover models, understand availability, and choose the right one.
---

## List models

`GET /models` needs no API key and returns every public model with capabilities, context length, availability and published pricing.

```bash
curl {{API_BASE_URL}}/models
```

Example response shape (values are illustrative):

```json
{
  "object": "list",
  "data": [
    {
      "id": "vendor/model-name",
      "object": "model",
      "owned_by": "vendor",
      "context_length": 128000,
      "capabilities": ["chat", "tools", "structured_output", "streaming"],
      "availability": "platform",
      "pricing": { "currency": "USD", "unit": "per_1m_tokens", "input": "0.50", "output": "1.50" }
    }
  ]
}
```

## Availability

- `platform` — served with INRENT credits.
- `byok` — usable with your own provider key.
- `unavailable` — not yet enabled.

## How models are verified

Before INRENT serves a model with platform credits, an administrator verifies:

1. The provider's commercial terms, or a signed agreement, permit it.
2. The model and weights licenses permit commercial use.
3. The current price is recorded together with its source.

Models whose license or terms are unknown are never served with platform credits. They can still be listed, and used with BYOK where the provider supports it.

## inrent/auto

`inrent/auto` routes each chat request to an eligible model using your organization's routing policy. Use explicit models when you need reproducibility.
