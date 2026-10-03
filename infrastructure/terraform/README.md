# Terraform (planned)

This directory documents the intended cloud infrastructure for running INRENT in production. **No Terraform modules are included yet** — the application runs today with Docker Compose (local) and the Kubernetes manifests in `../kubernetes` against infrastructure you provision.

## Target layout

```text
terraform/
  modules/
    network/        VPC, private subnets, NAT, security groups
    database/       Managed PostgreSQL 16 (Multi-AZ, PITR backups, encryption at rest, IAM auth)
    cache/          Managed Redis 7 (TLS, AUTH, Multi-AZ, noeviction policy for BullMQ)
    cluster/        Managed Kubernetes (EKS/GKE/AKS), node pools, cluster autoscaler
    secrets/        Secret manager entries + External Secrets Operator IAM bindings
    observability/  Log/metrics/trace backends, alerting routes
    edge/           DNS, TLS certificates, CDN/WAF for inrent.ai and api.inrent.ai
  envs/
    staging/        Small footprint; real payment provider in test mode
    production/     HA everywhere; deletion protection; restricted operator access
```

## Requirements per component

| Component     | Production requirement                                                                                                                                              |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PostgreSQL    | v16, ≥ 2 vCPU / 8 GB to start, Multi-AZ, automated backups with 14–35 day PITR, encrypted, private networking only                                                  |
| Redis         | v7, TLS + AUTH, Multi-AZ, `maxmemory-policy noeviction` (BullMQ requires it), persistence on                                                                        |
| Kubernetes    | Pod Security `restricted`, NetworkPolicies enforced, HPA + cluster autoscaler, ≥ 2 zones                                                                            |
| Ingress       | TLS 1.2+, HSTS, response buffering **off** for the API host (streaming), 600 s read timeout                                                                         |
| Secrets       | All values in `.env.example` marked secret live in a secret manager; rotated on a schedule; never in Git or images                                                  |
| Observability | Prometheus-compatible scraping of the gateway (`METRICS_TOKEN`), OTLP traces (`OTEL_EXPORTER_OTLP_ENDPOINT`), error reporting (`SENTRY_DSN`), centralized JSON logs |
| Egress        | Allow-list upstream model providers, payment providers and the email provider where the platform supports egress policies                                           |

## State & access

- Remote state in an encrypted, versioned bucket with state locking.
- Separate state and credentials per environment; production applies require approval (mirrors the `production` GitHub environment).
- Plan on every PR touching `infrastructure/terraform`; apply only from CI.

## Contributing modules

When adding modules: pin provider versions, keep resources private by default, add `prevent_destroy` to stateful resources, and document every output that feeds Kubernetes secrets.
