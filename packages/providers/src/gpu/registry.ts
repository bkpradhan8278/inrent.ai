import { MockGPUProvider } from "./mock";
import { GpuCloudNotAvailableError, type GPUProvider } from "./types";

export type GpuAdapterType = "MOCK" | "VAST" | "RUNPOD" | "LAMBDA" | "COREWEAVE" | "INRENT";

/**
 * Real vendor adapters are added once credentials and API contracts are configured; until
 * then requests fail with a clear "coming soon" error instead of pretending to work.
 */
export function createGpuProvider(adapter: GpuAdapterType, opts: { allowMock: boolean }): GPUProvider {
  if (adapter === "MOCK") {
    if (!opts.allowMock) throw new GpuCloudNotAvailableError("mock-gpu");
    return new MockGPUProvider();
  }
  throw new GpuCloudNotAvailableError(adapter.toLowerCase());
}
