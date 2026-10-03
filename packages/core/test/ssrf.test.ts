import { describe, expect, it } from "vitest";
import { assertPublicUrl, isPrivateAddress, parseOutboundUrl, UnsafeUrlError } from "../src/server";

describe("SSRF guard", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "::1",
    "::",
    "fc00::1",
    "fe80::1",
    "::ffff:127.0.0.1",
    "::ffff:169.254.169.254",
  ])("treats %s as private", (ip) => {
    expect(isPrivateAddress(ip)).toBe(true);
  });

  it.each(["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111"])("treats %s as public", (ip) => {
    expect(isPrivateAddress(ip)).toBe(false);
  });

  it.each([
    "http://example.com/hook",
    "https://localhost/hook",
    "https://127.0.0.1/hook",
    "https://[::1]/hook",
    "https://169.254.169.254/latest/meta-data",
    "https://user:pass@example.com/",
    "https://example.com:22/",
    "https://metadata.google.internal/",
    "https://intranet/",
    "file:///etc/passwd",
    "gopher://example.com",
    "not a url",
  ])("rejects %s", (url) => {
    expect(() => parseOutboundUrl(url)).toThrow(UnsafeUrlError);
  });

  it("accepts public https urls", () => {
    expect(parseOutboundUrl("https://hooks.example.com/inrent").hostname).toBe("hooks.example.com");
  });

  it("rejects hostnames that resolve to private addresses (DNS rebinding style)", async () => {
    await expect(
      assertPublicUrl("https://evil.example.com/", { resolver: async () => ["93.184.216.34", "10.0.0.5"] }),
    ).rejects.toThrow(UnsafeUrlError);
    await expect(
      assertPublicUrl("https://ok.example.com/", { resolver: async () => ["93.184.216.34"] }),
    ).resolves.toMatchObject({ addresses: ["93.184.216.34"] });
  });

  it("allows http/private only when explicitly enabled for development", () => {
    expect(parseOutboundUrl("http://localhost:8080/hook", { allowHttp: true, allowPrivateNetwork: true }).port).toBe("8080");
  });
});
