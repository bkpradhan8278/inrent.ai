---
title: Agents
description: Versioned agent definitions with budgets and boundaries (preview).
---

> [!NOTE]
> The agent builder is in **preview** and must be enabled for your organization. You can create and version agent definitions; the hosted runtime is on the roadmap.

An agent definition includes:

| Field | Description |
| --- | --- |
| Name, description | Human-readable identity |
| Model | Any catalog model, including `inrent/auto` |
| System prompt | Up to 32k characters |
| Temperature | 0–2 |
| Max steps | 1–50 model/tool iterations |
| Budget | Optional per-agent spend ceiling |
| MCP servers | Approved servers from your organization |
| Memory | Opt-in (roadmap) |

Each edit creates an immutable version, so runs can pin a version and you can roll back.
