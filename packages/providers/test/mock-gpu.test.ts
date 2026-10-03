import { describe, expect, it } from "vitest";
import { createAdapter } from "../src/registry";
import { createGpuProvider, GpuCloudNotAvailableError, MockGPUProvider } from "../src";

describe("mock provider", () => {
  const mock = createAdapter({ slug: "inrent-mock", adapter: "MOCK", baseUrl: "mock://local?delay=0", apiKey: null }, { allowMock: true });

  it("is refused unless explicitly allowed", () => {
    expect(() => createAdapter({ slug: "m", adapter: "MOCK", baseUrl: "mock://local", apiKey: null }, { allowMock: false })).toThrow();
  });

  it("returns deterministic, clearly-labelled responses with usage", async () => {
    const out = await mock.chat({ model: "mock-echo", messages: [{ role: "user", content: "ping" }] }, { requestId: "r" });
    expect(out.choices[0]?.message.content).toContain("development mock");
    expect(out.usage?.total_tokens).toBeGreaterThan(0);
  });

  it("streams and simulates failures", async () => {
    const stream = await mock.chatStream({ model: "mock-echo", messages: [{ role: "user", content: "a b c" }] }, { requestId: "r" });
    let text = "";
    for await (const c of stream) text += c.choices[0]?.delta.content ?? "";
    expect(text).toContain("a b c");
    const failing = createAdapter({ slug: "f", adapter: "MOCK", baseUrl: "mock://local?fail=always&delay=0", apiKey: null }, { allowMock: true });
    await expect(failing.chat({ model: "x", messages: [{ role: "user", content: "x" }] }, { requestId: "r" })).rejects.toMatchObject({ retryable: true });
  });
});

describe("GPU abstraction", () => {
  it("mock provider supports the full lifecycle", async () => {
    const gpu = new MockGPUProvider();
    const offers = await gpu.searchOffers({ minVramGb: 80 });
    expect(offers.length).toBeGreaterThan(0);
    const inst = await gpu.createInstance({ offerId: offers[0]!.externalId, image: "vllm/vllm-openai" });
    expect(inst.state).toBe("RUNNING");
    await gpu.stopInstance(inst.externalId);
    expect((await gpu.getInstance(inst.externalId))?.state).toBe("STOPPED");
    await gpu.deleteInstance(inst.externalId);
    expect(await gpu.getInstance(inst.externalId)).toBeNull();
  });

  it("real vendors report coming soon instead of pretending", () => {
    expect(() => createGpuProvider("VAST", { allowMock: true })).toThrow(GpuCloudNotAvailableError);
    expect(() => createGpuProvider("MOCK", { allowMock: false })).toThrow(GpuCloudNotAvailableError);
  });
});
