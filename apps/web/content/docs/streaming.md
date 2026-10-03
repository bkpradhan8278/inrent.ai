---
title: Streaming
description: Receive tokens as they are generated with server-sent events.
---

Set `stream: true` to receive a `text/event-stream` of `chat.completion.chunk` objects, terminated by `data: [DONE]`.

```python tab="Python"
stream = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Count to five."}],
    stream=True,
    stream_options={"include_usage": True},
)
for chunk in stream:
    if chunk.choices:
        print(chunk.choices[0].delta.content or "", end="", flush=True)
    if chunk.usage:
        print("\n", chunk.usage)
```

```typescript tab="TypeScript"
const stream = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Count to five." }],
  stream: true,
  stream_options: { include_usage: true },
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}
```

```bash tab="cURL"
curl -N {{API_BASE_URL}}/chat/completions \
  -H "Authorization: Bearer $INRENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"inrent/auto","stream":true,"messages":[{"role":"user","content":"Count to five."}]}'
```

## Usage in streams

INRENT always requests usage from the provider so it can bill accurately. You receive the final usage chunk (empty `choices`, populated `usage`) only when you set `stream_options.include_usage: true`.

## Fallback and streaming

Fallback is possible until the first chunk is received from a provider. If a provider fails before producing output, INRENT transparently retries the next eligible provider. Once streaming has begun, a mid-stream failure is reported in-band:

```text
data: {"error":{"type":"provider_error","code":"stream_interrupted","message":"...","request_id":"req_..."}}
```

## Disconnects and billing

If your client disconnects, INRENT cancels the upstream request and charges only for tokens generated up to that point. When the provider didn't report usage for a cancelled stream, usage is estimated and the request log marks it as estimated.
