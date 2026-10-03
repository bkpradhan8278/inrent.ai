# inrent (Python)

Official Python SDK for the [INRENT](https://inrent.ai) API — one OpenAI-compatible API for many AI models, with routing, fallback, BYOK and usage-based billing.

```bash
pip install inrent
```

```python
from inrent import Inrent, InrentError

client = Inrent()  # reads INRENT_API_KEY (and optional INRENT_BASE_URL)

r = client.chat.completions.create(
    model="inrent/auto",
    messages=[{"role": "user", "content": "Hello"}],
    inrent={"route": "lowest_latency"},
)
print(r["choices"][0]["message"]["content"], r.meta["request_id"], r.meta["cost_usd"])

# Streaming
with client.chat.completions.create(model="inrent/auto", messages=[{"role": "user", "content": "Write a haiku"}], stream=True) as stream:
    for chunk in stream:
        if chunk["choices"]:
            print(chunk["choices"][0]["delta"].get("content", ""), end="")

# Errors
try:
    client.chat.completions.create(model="nope/model", messages=[])
except InrentError as e:
    print(e.status, e.code, e.request_id)
```

Responses are plain `dict`s (the exact API JSON) with INRENT metadata on `.meta`. Also available: `client.responses`, `client.embeddings`, `client.images`, `client.models`, `client.keys` (`current`, `list`, `create`, `revoke`), `client.usage.retrieve(days=…)` and `client.requests` (`list`, `retrieve`).

Retries: 408/409/429/5xx and connection errors are retried with exponential backoff (honouring `Retry-After`), `max_retries=2` by default. Failed requests are not billed.

## Development

```bash
python -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"
pytest                                   # unit tests (httpx MockTransport)
INRENT_LIVE_API_KEY=sk-inrent-dev-… pytest   # + live tests against a local gateway
```

License: Apache-2.0
