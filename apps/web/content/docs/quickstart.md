---
title: Quickstart
description: From zero to your first successful API call in under five minutes.
---

## 1. Create an account

[Sign up]({{APP_URL}}/sign-up) with email, GitHub or Google. You get a personal workspace with a default project.

## 2. Create an API key

Open **Dashboard → API Keys → Create key**. Choose a project and an environment (development, staging or production).

> [!IMPORTANT]
> The full key is shown **once**. INRENT stores only a keyed hash, so copy it now. Lost keys can't be recovered — rotate them instead.

Keys look like `sk-inrent-dev-…`, `sk-inrent-stg-…` or `sk-inrent-prod-…`. The prefix tells you the environment; it contains no account information.

## 3. Store the key

```bash
export INRENT_API_KEY="sk-inrent-dev-..."
```

## 4. Install an SDK

```bash tab="Python"
pip install openai   # or: pip install inrent
```

```bash tab="JavaScript"
npm install openai   # or: npm install @inrent/sdk
```

## 5. Make your first request

```python tab="Python"
import os
from openai import OpenAI

client = OpenAI(base_url="{{API_BASE_URL}}", api_key=os.environ["INRENT_API_KEY"])

response = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Say hello in five languages."}],
)
print(response.choices[0].message.content)
```

```typescript tab="TypeScript"
import { Inrent } from "@inrent/sdk";

const client = new Inrent({ apiKey: process.env.INRENT_API_KEY! });

const response = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Say hello in five languages." }],
});
console.log(response.choices[0]?.message.content);
```

```bash tab="cURL"
curl {{API_BASE_URL}}/chat/completions \
  -H "Authorization: Bearer $INRENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"inrent/auto","messages":[{"role":"user","content":"Say hello in five languages."}]}'
```

The response includes `x-request-id`, `x-inrent-provider` and `x-inrent-cost-usd` headers, and the request appears in **Dashboard → Logs** within seconds.

## Next steps

- Choose a specific model from the [catalog](/models) instead of `inrent/auto`.
- Turn on [streaming](/docs/streaming).
- Set [spend limits](/docs/billing) and [rate limits](/docs/rate-limits) on your key.
