# GPU Cloud roadmap

GPU Cloud is **not launched**. The product shows it as "coming soon" everywhere. The waitlist collects real demand (GPU type, expected hours, use case), the CLI's `inrent gpu …` commands exit with code 2 and a clear message, and no GPU capacity, pricing or availability is displayed or simulated as real.

## What exists today

- **Data model:** `GpuProvider`, `GpuOffer`, `GpuInstance` tables and the `WaitlistEntry` model.
- **Abstraction:** the `GPUProvider` interface (`packages/providers/src/gpu/types.ts`) with `searchOffers`, `createInstance`, `getInstance`, `stopInstance`, `restartInstance`, `deleteInstance`, `getLogs` and `getMetrics`.
- **Registry:** `createGpuProvider` returns a mock implementation for development and tests. Real vendors throw `GpuCloudNotAvailableError` until an adapter and a commercial agreement exist.
- **Product surface:** `/gpu` marketing page and waitlist, admin "GPU & waitlist" page with demand signals, and the `GPU_CLOUD_ENABLED` feature flag (off).

## Phases

| Phase                      | Scope                                                                                                                                         | Exit criteria                                                                                                |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| 0. Demand (now)            | Waitlist, demand dashboard, partner conversations                                                                                             | Enough qualified demand per GPU type and region to justify capacity commitments                              |
| 1. Brokered on-demand GPUs | Adapters for 1–2 partner clouds (contracts in place); search offers, launch, stop, SSH/Jupyter, per-second billing from credits, hard budgets | Adapter conformance tests passing against partner sandboxes; billing reconciliation against partner invoices |
| 2. Serverless endpoints    | Deploy an open-weight model (vLLM / TGI) behind the existing gateway; autoscaling to zero; `inrent deploy`                                    | Cold start and throughput SLOs met; models routed like any provider (`SELF_HOSTED` mode)                     |
| 3. Marketplace             | Third-party hosts listing capacity; verification, reliability scoring, escrowed payouts, dispute handling                                     | Host KYC/verification, abuse controls, payout compliance in target countries                                 |

## Requirements before launch

- **Commercial:** reseller or partner agreements for each capacity source. INRENT never lists capacity it has no right to sell.
- **Billing:** per-second metering from provider events, pre-authorization against credits, auto-stop at budget, and reconciliation jobs.
- **Security:** tenant isolation (no shared GPUs without vendor MIG/vGPU isolation), SSH keys managed per user, egress controls, abuse detection (crypto-mining), image scanning.
- **Reliability:** instance state machine with idempotent provider calls, orphan detection, and preemption handling for spot capacity.
- **Compliance:** data-residency options per region, and export controls for high-end accelerators.

## Integration targets (to be evaluated, no commitments)

Partner clouds and marketplaces with public APIs (for example RunPod, Lambda, Vast.ai, CoreWeave, Crusoe), plus INRENT-operated clusters. Choices depend on terms, pricing, regions and API maturity. None is integrated or endorsed today.
