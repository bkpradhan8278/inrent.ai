---
title: Embeddings
description: Turn text into vectors for search, clustering and retrieval.
---

```python tab="Python"
res = client.embeddings.create(
    model="openai/text-embedding-3-small",
    input=["first document", "second document"],
)
vectors = [d.embedding for d in res.data]
```

```typescript tab="TypeScript"
const res = await client.embeddings.create({
  model: "openai/text-embedding-3-small",
  input: ["first document", "second document"],
});
```

```bash tab="cURL"
curl {{API_BASE_URL}}/embeddings \
  -H "Authorization: Bearer $INRENT_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"model":"openai/text-embedding-3-small","input":["first document"]}'
```

- `input` accepts a string, an array of up to 2,048 strings, or token arrays.
- `dimensions` is forwarded to models that support shortening.
- Embeddings are billed on input tokens only.
