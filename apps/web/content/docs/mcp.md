---
title: MCP
description: Register Model Context Protocol servers with least-privilege permissions.
---

> [!NOTE]
> The MCP registry is in **preview**. You can register servers and approve tools today. Executing tools through the gateway is on the roadmap.

## Concepts

- **Server.** An MCP server reachable over Streamable HTTP or SSE, or a STDIO connector you run yourself. Templates: GitHub, Slack, Notion, Google Drive, Postgres, Filesystem and Custom.
- **Max permission.** Each server has a ceiling — `read`, `write` or `admin`. Only owners and admins can set `write` or `admin`.
- **Tools.** Every tool has a permission level at or below the server's ceiling and starts **disabled**.
- **Approval.** Enabling a tool is an explicit approval. Write, admin and destructive tools can be approved only by an owner or admin.

## Security

- Server URLs are validated. Private-network destinations are rejected.
- Server credentials are encrypted at rest and never shown again.
- Creating, enabling, disabling, deleting, approving and revoking are all audit-logged.

## Recommended setup

1. Register the server with `read` access.
2. Approve only the read tools you need.
3. Add write tools later, one at a time, with an owner's approval.
