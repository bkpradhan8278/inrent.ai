---
title: CLI
description: Manage keys, browse models and test requests from your terminal.
---

```bash
npm install -g @inrent/cli
inrent login
```

`inrent login` stores your key in `~/.config/inrent/config.json` with `0600` permissions. You can also set `INRENT_API_KEY` and, for self-hosted deployments, `INRENT_BASE_URL`.

## Commands

| Command | Description |
| --- | --- |
| `inrent login` / `logout` | Save or remove credentials |
| `inrent config`, `config get <key>`, `config set <key> <value>` | Show or edit configuration |
| `inrent status` | API health and your key's status |
| `inrent models` / `models list` | List models with availability and prices |
| `inrent models search <query>` | Search the catalog |
| `inrent models info <model>` | Details for one model |
| `inrent keys` / `keys list` | List keys (needs `keys:read`) |
| `inrent keys create --name <n> [--env …]` | Create a key (needs `keys:write`) |
| `inrent keys revoke <id>` | Revoke a key |
| `inrent usage [--days 30]` | Usage summary (needs `usage:read`) |
| `inrent logs [--limit 20] [--status error]` | Recent requests (needs `logs:read`) |
| `inrent logs <request_id>` | One request: routing, tokens, cost, latency |
| `inrent test [--model …] "<prompt>"` | Send a test request and print timing |
| `inrent playground [--model …]` | Interactive chat in your terminal |
| `inrent deploy` | Model deployment (coming with GPU Cloud) |
| `inrent gpu search`, `deploy`, `stop`, `ssh`, `logs` | GPU Cloud (coming soon — exits with code 2, nothing is provisioned) |

```text
$ inrent models
MODEL                          PROVIDERS  CONTEXT  INPUT/1M  OUTPUT/1M  STATUS
inrent/auto                    —          —        —         —          platform
qwen/qwen3-32b                 3          —        —         —          byok
...
```

Every command supports `--json` for scripting. Global options: `--api-key`, `--base-url`, `--no-color`. Credentials resolve in this order: `--api-key` → `INRENT_API_KEY` → saved config. Set `INRENT_CONFIG` to use a different config file.

Exit codes: `0` success, `1` error (the message includes the error code and request ID), `2` feature not available yet.

```bash
echo "$INRENT_API_KEY" | inrent login        # non-interactive login from stdin
inrent test -m inrent/auto "Say hello"       # streams the reply, then TTFT, latency, tokens, request ID
inrent logs --status error --limit 10 --json | jq '.[].error_code'
```
