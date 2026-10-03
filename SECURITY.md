# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities privately to **security@inrent.ai**. Do not open a public issue. Include:

- a description of the issue and its impact,
- steps to reproduce (a proof of concept if possible),
- affected endpoints, versions or commits,
- any request IDs (`req_…`) involved. **Never include live API keys or other people's data.**

We will acknowledge your report and keep you informed while we investigate and fix it. We will not take legal action against good-faith research that follows this policy: avoid privacy violations, data destruction and service degradation, only test against accounts you own, and give us reasonable time to remediate before disclosure.

> This policy is a starting template. Response-time commitments, scope and any bug-bounty terms should be confirmed by the INRENT team before publication.

## Scope

In scope: the INRENT API (`api.inrent.ai`), web application and dashboard (`inrent.ai`), the SDKs and CLI in this repository.

Out of scope: denial-of-service testing, social engineering, physical attacks, third-party services (model providers, payment processors) and findings that need a compromised device.

## Supported versions

Only the latest release on `main` receives security fixes.

## Security architecture

The controls in this codebase are described in [docs/security.md](docs/security.md): hashed API keys, encrypted secrets, RBAC, rate limiting, SSRF protection, signed webhooks, audit logging, idempotent billing and the production safety checks.

INRENT does **not** currently hold SOC 2, ISO 27001 or other certifications. Any claim of certification will only be made once it is formally attained.
