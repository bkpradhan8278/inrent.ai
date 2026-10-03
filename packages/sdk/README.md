# @inrent/sdk

Official JavaScript/TypeScript SDK for the [INRENT](https://inrent.ai) API — one OpenAI-compatible API for many AI models, with routing, fallback, BYOK and usage-based billing.

- Zero runtime dependencies; Node 18+, Bun, Deno and edge runtimes
- Chat completions (streaming async iterators), responses, embeddings, images, models
- Key, usage and request-log management
- Typed `InrentError` with `status`, `code` and `requestId`
- Retries with exponential backoff for 408/409/429/5xx and connection errors (honours `Retry-After`), per-request timeouts and abort signals
- Response metadata on every result: `result._meta.requestId`, `provider`, `model`, `fallbacks`, `costUsd`

```bash
npm install @inrent/sdk
```

```ts
import { Inrent, InrentError } from "@inrent/sdk";

const client = new Inrent(); // reads INRENT_API_KEY (and optional INRENT_BASE_URL)

const completion = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Hello" }],
  inrent: { route: "lowest_latency", fallback_models: ["openai/gpt-4o-mini"] },
});
console.log(completion.choices[0]?.message.content, completion._meta.requestId, completion._meta.costUsd);

// Streaming
const stream = await client.chat.completions.create({ model: "inrent/auto", messages: [{ role: "user", content: "Write a haiku" }], stream: true });
for await (const chunk of stream) process.stdout.write(chunk.choices[0]?.delta.content ?? "");

// Errors
try {
  await client.chat.completions.create({ model: "nope/model", messages: [] });
} catch (e) {
  if (e instanceof InrentError) console.error(e.status, e.code, e.requestId);
}
```

Management (requires a key with the matching permission):

```ts
await client.keys.current();                       // limits, balance, spend for this key
await client.keys.create({ name: "ci", environment: "development", permissions: ["inference"] }); // keys:write — secret returned once
await client.usage.retrieve({ days: 30 });          // usage:read
await client.requests.list({ limit: 20 });          // logs:read
```

Prefer the official OpenAI SDK? It works too — set `baseURL` to `https://api.inrent.ai/v1`.

## Development

```bash
pnpm --filter @inrent/sdk test        # unit tests (fake fetch)
INRENT_LIVE_API_KEY=sk-inrent-dev-… pnpm --filter @inrent/sdk test   # + live tests against a local gateway
pnpm --filter @inrent/sdk build
```

License: Apache-2.0
