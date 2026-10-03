import type {
  CreateGpuInstanceInput,
  GPUProvider,
  GpuInstance,
  GpuMetrics,
  GpuOffer,
  GpuOfferQuery,
} from "./types";

/**
 * In-memory GPU provider for developing the orchestrator and UI. Offers are synthetic,
 * labelled as mock and never displayed publicly as real availability or pricing.
 */
export class MockGPUProvider implements GPUProvider {
  readonly slug = "mock-gpu";
  private readonly instances = new Map<string, GpuInstance>();
  private seq = 0;

  private readonly offers: GpuOffer[] = [
    { provider: this.slug, externalId: "mock-offer-1", gpuModel: "MOCK-24GB", gpuCount: 1, vramGb: 24, cpuCores: 8, ramGb: 32, diskGb: 100, region: "mock-region", interruptible: false },
    { provider: this.slug, externalId: "mock-offer-2", gpuModel: "MOCK-80GB", gpuCount: 1, vramGb: 80, cpuCores: 16, ramGb: 128, diskGb: 500, region: "mock-region", interruptible: false },
    { provider: this.slug, externalId: "mock-offer-3", gpuModel: "MOCK-80GB", gpuCount: 8, vramGb: 80, cpuCores: 128, ramGb: 1024, diskGb: 2000, region: "mock-region", interruptible: true },
  ];

  async searchOffers(query: GpuOfferQuery): Promise<GpuOffer[]> {
    return this.offers
      .filter((o) => !query.gpuModel || o.gpuModel === query.gpuModel)
      .filter((o) => !query.minGpuCount || o.gpuCount >= query.minGpuCount)
      .filter((o) => !query.minVramGb || o.vramGb >= query.minVramGb)
      .filter((o) => query.interruptible === undefined || o.interruptible === query.interruptible)
      .slice(0, query.limit ?? 50);
  }

  async createInstance(input: CreateGpuInstanceInput): Promise<GpuInstance> {
    const offer = this.offers.find((o) => o.externalId === input.offerId);
    if (!offer) throw new Error(`Unknown offer ${input.offerId}`);
    const instance: GpuInstance = {
      provider: this.slug,
      externalId: `mock-instance-${++this.seq}`,
      state: "RUNNING",
      gpuModel: offer.gpuModel,
      gpuCount: offer.gpuCount,
      image: input.image,
      sshHost: "127.0.0.1",
      sshPort: 22000 + this.seq,
      startedAt: new Date(),
    };
    this.instances.set(instance.externalId, instance);
    return instance;
  }

  async getInstance(externalId: string): Promise<GpuInstance | null> {
    return this.instances.get(externalId) ?? null;
  }

  private setState(externalId: string, state: GpuInstance["state"]) {
    const i = this.instances.get(externalId);
    if (!i) throw new Error(`Unknown instance ${externalId}`);
    i.state = state;
  }

  async stopInstance(externalId: string) {
    this.setState(externalId, "STOPPED");
  }

  async restartInstance(externalId: string) {
    this.setState(externalId, "RUNNING");
  }

  async deleteInstance(externalId: string) {
    this.setState(externalId, "TERMINATED");
    this.instances.delete(externalId);
  }

  async getLogs(externalId: string): Promise<string[]> {
    const i = this.instances.get(externalId);
    return i ? [`[mock] instance ${externalId} running ${i.image}`] : [];
  }

  async getMetrics(externalId: string): Promise<GpuMetrics | null> {
    if (!this.instances.has(externalId)) return null;
    return { gpuUtilizationPct: 0, memoryUsedGb: 0, memoryTotalGb: 24, collectedAt: new Date() };
  }
}
