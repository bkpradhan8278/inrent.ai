# Deployment

## Environments

| Environment | Trigger                                               | Approval                                                      | Purpose                                         |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| development | local / `docker compose`                              | none                                                          | mock provider allowed, demo seed                |
| staging     | every push to `main` (`.github/workflows/deploy.yml`) | none                                                          | production-like; payment providers in test mode |
| production  | after staging succeeds                                | **required reviewers** on the GitHub `production` environment | live traffic                                    |

Production is never deployed directly from a laptop: the deploy workflow is the only path, it deploys the exact images already running in staging, and the `production` environment requires approval. Configure reviewers under _Settings → Environments → production_.

## Images

The root `Dockerfile` builds four targets from one cached dependency layer:

| Target    | Contents                                                                              | Port                       |
| --------- | ------------------------------------------------------------------------------------- | -------------------------- |
| `gateway` | bundled gateway + pruned production `node_modules` + Prisma engine                    | 8080 (`/health`, `/ready`) |
| `worker`  | bundled worker + pruned production `node_modules`                                     | none                       |
| `web`     | Next.js standalone output (`NEXT_PUBLIC_*` compiled in, so build one per environment) | 3000 (`/api/health`)       |
| `migrate` | workspace with Prisma CLI; default command `migrate deploy`                           | none                       |

Images contain no secrets and run as the non-root `node` user. Services handle `SIGTERM` gracefully: the gateway stops accepting connections and gives in-flight streams `GATEWAY_SHUTDOWN_GRACE_MS` to finish and bill. Run them with an init process (`--init`, compose `init: true`).

## Kubernetes

`infrastructure/kubernetes` contains a kustomize base (namespace with Pod Security `restricted`, ConfigMap, migration Job, Deployments with probes, HPAs, PDB, NetworkPolicies, Ingress) and `staging` / `production` overlays.

Before the first deploy:

1. Provision PostgreSQL 16, Redis 7 (`noeviction`), an ingress controller with cert-manager, and a secret manager. See `infrastructure/terraform/README.md` for the target layout.
2. Create the `inrent-secrets` Secret in each namespace from your secret manager (keys listed in `base/config.yaml`), for example with External Secrets Operator. Never commit it.
3. Add the `KUBE_CONFIG` secret (base64 kubeconfig scoped to that namespace) to the GitHub `staging` and `production` environments.
4. Point DNS for `inrent.ai` / `api.inrent.ai` (and the staging hosts) at the ingress.

Each deploy (`scripts/deploy.sh`) renders the overlay with the commit-SHA image tags, server-side dry-runs it, applies config and runs the **migration Job first**, waits for it, then rolls out the gateway, worker and web, and waits for each rollout.

### Migrations

Migrations are forward-only and must stay compatible with the release that is still running (expand → deploy → contract). CI checks the schema against the migrations (`migrate diff`) and applies them to a fresh database on every PR.

### Rollback

Re-run the deploy workflow with `ref` set to the previous good commit. Images are immutable per SHA. Database migrations are not rolled back automatically. Write a new forward migration instead.

## Configuration checklist (production)

- [ ] `INRENT_ENV=production`. Startup fails on development secrets, the mock provider or private webhook targets.
- [ ] Strong random values for `BETTER_AUTH_SECRET`, `API_KEY_PEPPER`, `INTERNAL_SERVICE_SECRET`, `IP_HASH_SALT`, and a 32-byte `INRENT_ENCRYPTION_KEYS` entry.
- [ ] `TRUST_PROXY=true` only behind your load balancer. `METRICS_TOKEN` set and Prometheus configured with it.
- [ ] Ingress: response buffering **off** for the API host, read timeout ≥ 600 s, body size ≥ 20 MB.
- [ ] Payment providers in live mode with webhooks pointing at `https://inrent.ai/api/webhooks/{stripe|razorpay}`. For Razorpay, set `RAZORPAY_USD_INR_RATE` from your FX policy.
- [ ] Email provider configured (`EMAIL_PROVIDER=resend|sendgrid`, `EMAIL_FROM` on a verified domain).
- [ ] `SENTRY_DSN` and `OTEL_EXPORTER_OTLP_ENDPOINT` for error reporting and tracing. Alert rules from `infrastructure/prometheus/alerts.yml`.
- [ ] Database backups with point-in-time recovery, and a tested restore.
- [ ] Providers: follow the admin workflow in [provider-routing.md](provider-routing.md) before enabling anything, and set credential references for platform-funded providers.
- [ ] Legal pages reviewed by counsel (they ship as templates).

## Without Kubernetes

Any container platform works (ECS, Cloud Run, Fly, Render, Railway…): run the four images with the same environment variables, run `migrate` as a release step before switching traffic, keep at least two gateway instances, and disable proxy response buffering for streaming. Vercel can host `apps/web` on its own. The gateway and worker need a long-running Node runtime.
