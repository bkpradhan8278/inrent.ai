---
title: SDKs
description: Official TypeScript and Python SDKs — or any OpenAI SDK.
---

## Any OpenAI SDK

Point the official OpenAI SDK at INRENT:

```python tab="Python"
from openai import OpenAI
client = OpenAI(base_url="{{API_BASE_URL}}", api_key=os.environ["INRENT_API_KEY"])
```

```javascript tab="JavaScript"
import OpenAI from "openai";
const client = new OpenAI({ baseURL: "{{API_BASE_URL}}", apiKey: process.env.INRENT_API_KEY });
```

## @inrent/sdk (TypeScript / JavaScript)

```bash
npm install @inrent/sdk
```

```typescript
import { Inrent, InrentError } from "@inrent/sdk";

const client = new Inrent({ apiKey: process.env.INRENT_API_KEY });

const completion = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Hello" }],
  inrent: { route: "lowest_latency" },
});
console.log(completion.choices[0]?.message.content, completion._meta.requestId);

try {
  await client.chat.completions.create({ model: "nope/model", messages: [] });
} catch (e) {
  if (e instanceof InrentError) console.error(e.status, e.code, e.requestId);
}
```

Features: chat completions (with streaming async iterators), responses, embeddings, images, models, key/usage/request management, typed errors, automatic retries with backoff for 429/5xx, timeouts and abort signals. Zero runtime dependencies. Works in Node 18+, Deno, Bun and edge runtimes.

## inrent (Python)

```bash
pip install inrent
```

```python
from inrent import Inrent

client = Inrent(api_key="...")

response = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response["choices"][0]["message"]["content"])

for chunk in client.chat.completions.create(model="inrent/auto", messages=[{"role": "user", "content": "Stream"}], stream=True):
    print(chunk["choices"][0]["delta"].get("content", "") if chunk["choices"] else "", end="")
```

The Python SDK uses `httpx`, supports streaming iterators, retries, timeouts, and raises `inrent.InrentError` with `status`, `code` and `request_id`.
