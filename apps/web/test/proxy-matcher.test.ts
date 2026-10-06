import { describe, expect, it } from "vitest";
import { config } from "@/proxy";

// Next compiles the matcher with path-to-regexp; anchoring the same source is an exact stand-in for
// this pattern (one custom group, no named parameters). Paths it does not match never reach the
// proxy, so section hosts cannot rewrite them (app.inrent.ai/brand/x.png → /dashboard/brand/x.png).
const runsProxy = (path: string) => new RegExp(`^${config.matcher[0]}$`).test(path);

describe("proxy matcher", () => {
  it("serves icons, the manifest and brand assets as static files on every host", () => {
    for (const path of [
      "/favicon.ico",
      "/icon.svg",
      "/apple-icon.png",
      "/manifest.webmanifest",
      "/brand/email-logo.png",
      "/brand/icon-maskable-512.png",
      "/brand/logo.svg",
      "/robots.txt",
      "/sitemap.xml",
    ]) {
      expect(runsProxy(path), path).toBe(false);
    }
  });

  it("still routes pages, including dotted page paths", () => {
    for (const path of ["/", "/keys", "/dashboard/keys", "/dashboard/logs/a.b", "/brand", "/opengraph-image"]) {
      expect(runsProxy(path), path).toBe(true);
    }
  });
});
