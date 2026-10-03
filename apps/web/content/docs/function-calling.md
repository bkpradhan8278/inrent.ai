---
title: Function calling
description: Let models call your tools with JSON arguments.
---

Pass `tools` and optionally `tool_choice`. INRENT only routes to providers whose endpoint supports tool calling.

```python tab="Python"
import json

tools = [{
    "type": "function",
    "function": {
        "name": "get_weather",
        "description": "Current weather for a city",
        "parameters": {
            "type": "object",
            "properties": {"city": {"type": "string"}},
            "required": ["city"],
        },
    },
}]

first = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Weather in Bhubaneswar?"}],
    tools=tools,
)
call = first.choices[0].message.tool_calls[0]
result = {"city": "Bhubaneswar", "temp_c": 31}  # your function

final = client.chat.completions.create(
    model="inrent/auto",
    messages=[
        {"role": "user", "content": "Weather in Bhubaneswar?"},
        first.choices[0].message,
        {"role": "tool", "tool_call_id": call.id, "content": json.dumps(result)},
    ],
    tools=tools,
)
```

```typescript tab="TypeScript"
const tools = [{
  type: "function" as const,
  function: {
    name: "get_weather",
    description: "Current weather for a city",
    parameters: { type: "object", properties: { city: { type: "string" } }, required: ["city"] },
  },
}];

const first = await client.chat.completions.create({
  model: "inrent/auto",
  messages: [{ role: "user", content: "Weather in Bhubaneswar?" }],
  tools,
});
const call = first.choices[0]?.message.tool_calls?.[0];
```

## Provider translation

For providers with their own tool formats (for example Anthropic's Messages API), INRENT translates tool definitions, tool calls and tool results to and from the OpenAI format, including streamed argument deltas.

## tool_choice

- `"auto"` (default): the model decides.
- `"required"`: the model must call a tool.
- `"none"`: no tool calls.
- `{"type": "function", "function": {"name": "get_weather"}}`: force a specific tool.

If the requested model has no provider that supports tools, the request fails with `400 unsupported_capability`.
