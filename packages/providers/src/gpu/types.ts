/**
 * GPU Cloud provider abstraction (future product — not live).
 *
 * Core business logic depends only on this interface. Vendor adapters (Vast.ai, RunPod,
 * Lambda, CoreWeave, INRENT-owned fleet) implement it once credentials and API contracts
 * are in place. Nothing Vast-specific leaks into the domain model.
 */

export interface GpuOfferQuery {
  gpuModel?: string;
  minGpuCount?: number;
  minVramGb?: number;
  region?: string;
  maxPricePerHourUsd?: number;
  interruptible?: boolean;
  limit?: number;
}

export interface GpuOffer {
  provider: string;
  externalId: string;
  gpuModel: string;
  gpuCount: number;
  vramGb: number;
  cpuCores?: number;
  ramGb?: number;
  diskGb?: number;
  region?: string;
  /** Provider list price in USD/hour. Live data only — never fabricated. */
  pricePerHourUsd?: number;
  interruptible: boolean;
  reliability?: number;
}

export type GpuInstanceState = "PROVISIONING" | "RUNNING" | "STOPPED" | "FAILED" | "TERMINATED";

export interface CreateGpuInstanceInput {
  offerId: string;
  image: string;
  diskGb?: number;
  env?: Record<string, string>;
  ports?: number[];
  sshPublicKey?: string;
  onStartCommand?: string;
  label?: string;
}

export interface GpuInstance {
  provider: string;
  externalId: string;
  state: GpuInstanceState;
  gpuModel: string;
  gpuCount: number;
  image: string;
  publicIp?: string;
  sshHost?: string;
  sshPort?: number;
  ports?: Record<number, number>;
  startedAt?: Date;
}

export interface GpuMetrics {
  gpuUtilizationPct: number;
  memoryUsedGb: number;
  memoryTotalGb: number;
  temperatureC?: number;
  powerWatts?: number;
  collectedAt: Date;
}

export interface GPUProvider {
  readonly slug: string;
  searchOffers(query: GpuOfferQuery): Promise<GpuOffer[]>;
  createInstance(input: CreateGpuInstanceInput): Promise<GpuInstance>;
  getInstance(externalId: string): Promise<GpuInstance | null>;
  stopInstance(externalId: string): Promise<void>;
  restartInstance(externalId: string): Promise<void>;
  deleteInstance(externalId: string): Promise<void>;
  getLogs(externalId: string, opts?: { tail?: number }): Promise<string[]>;
  getMetrics(externalId: string): Promise<GpuMetrics | null>;
}

export class GpuCloudNotAvailableError extends Error {
  constructor(provider: string) {
    super(`GPU provider '${provider}' is not available yet. GPU Cloud is coming soon.`);
    this.name = "GpuCloudNotAvailableError";
  }
}
