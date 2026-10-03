---
title: Structured output
description: Constrain responses to valid JSON or a JSON schema.
---

## JSON schema

```python tab="Python"
response = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Extract: Ada Lovelace, born 1815"}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "person",
            "strict": True,
            "schema": {
                "type": "object",
                "properties": {"name": {"type": "string"}, "born": {"type": "integer"}},
                "required": ["name", "born"],
                "additionalProperties": False,
            },
        },
    },
)
```

```typescript tab="TypeScript"
const response = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Extract: Ada Lovelace, born 1815" }],
  response_format: {
    type: "json_schema",
    json_schema: {
      name: "person",
      strict: true,
      schema: {
        type: "object",
        properties: { name: { type: "string" }, born: { type: "integer" } },
        required: ["name", "born"],
        additionalProperties: false,
      },
    },
  },
});
```

INRENT routes `json_schema` requests only to providers that support structured outputs.

## JSON mode

`{"type": "json_object"}` asks the model for any valid JSON object. Always tell the model, in the prompt, which JSON you expect.

> [!NOTE]
> Always validate structured output in your application. Even with schema enforcement, treat model output as untrusted input.
