import { site } from "./site";

/** Code samples generated from configuration — the endpoint and model are never hard-coded in UI. */
export function chatSnippets(model: string, opts: { apiBase?: string; prompt?: string } = {}) {
  const base = opts.apiBase ?? site.apiBaseUrl;
  const prompt = opts.prompt ?? "Hello";
  return [
    {
      label: "cURL",
      lang: "bash",
      code: `curl ${base}/chat/completions \\
  -H "Authorization: Bearer $INRENT_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "user", "content": "${prompt}" }
    ]
  }'`,
    },
    {
      label: "Python",
      lang: "python",
      code: `import os
from openai import OpenAI

client = OpenAI(
    base_url="${base}",
    api_key=os.environ["INRENT_API_KEY"],
)

completion = client.chat.completions.create(
    model="${model}",
    messages=[{"role": "user", "content": "${prompt}"}],
)
print(completion.choices[0].message.content)`,
    },
    {
      label: "JavaScript",
      lang: "javascript",
      code: `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "${base}",
  apiKey: process.env.INRENT_API_KEY,
});

const completion = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "${prompt}" }],
});
console.log(completion.choices[0].message.content);`,
    },
    {
      label: "TypeScript",
      lang: "typescript",
      code: `import { Inrent } from "@inrent/sdk";

const client = new Inrent({ apiKey: process.env.INRENT_API_KEY! });

const completion = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "${prompt}" }],
});
console.log(completion.choices[0]?.message.content);`,
    },
    {
      label: "Node.js (stream)",
      lang: "javascript",
      code: `import { Inrent } from "@inrent/sdk";

const client = new Inrent({ apiKey: process.env.INRENT_API_KEY });

const stream = await client.chat.completions.create({
  model: "${model}",
  messages: [{ role: "user", content: "${prompt}" }],
  stream: true,
});
for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content ?? "");
}`,
    },
  ];
}
