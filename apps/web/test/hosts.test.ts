import { afterEach, describe, expect, it, vi } from "vitest";

// lib/hosts reads its configuration when the module loads, so each mode imports a fresh copy.
async function load(rootDomain: string, appUrl: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", rootDomain);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", appUrl);
  return import("@/lib/hosts");
}

afterEach(() => vi.unstubAllEnvs());

describe("single host (no root domain)", () => {
  it("leaves paths unchanged and maps redirects to relative paths", async () => {
    const h = await load("", "http://localhost:3000");
    expect(h.subdomainsEnabled).toBe(false);
    expect(h.cookieDomain).toBeUndefined();
    expect(h.hrefFor("/dashboard/keys?x=1")).toBe("/dashboard/keys?x=1");
    expect(h.sectionForHost("localhost:3000")).toBeNull();
    expect(h.safeRedirect("/dashboard/usage")).toBe("/dashboard/usage");
    expect(h.safeRedirect("https://evil.example/")).toBe("/dashboard");
    // URL parsing strips tabs/newlines and reads "\" as "/": "/\t/evil.example" would become //evil.example.
    for (const bad of ["/\t/evil.example", "/\n/evil.example", "/ /evil.example", "/\\evil.example"]) expect(h.safeRedirect(bad)).toBe("/dashboard");
    expect(h.absoluteUrl("/invite/abc")).toBe("http://localhost:3000/invite/abc");
  });
});

describe("subdomain routing", () => {
  const ROOT = "inrent.ai";

  it("maps internal paths to their section host", async () => {
    const h = await load(ROOT, "https://inrent.ai");
    expect(h.hrefFor("/")).toBe("https://inrent.ai/");
    expect(h.hrefFor("/models/openai/gpt-4.1")).toBe("https://inrent.ai/models/openai/gpt-4.1");
    expect(h.hrefFor("/dashboard")).toBe("https://app.inrent.ai/");
    expect(h.hrefFor("/dashboard/keys?create=1#top")).toBe("https://app.inrent.ai/keys?create=1#top");
    expect(h.hrefFor("/admin/users")).toBe("https://admin.inrent.ai/users");
    expect(h.hrefFor("/docs")).toBe("https://docs.inrent.ai/");
    expect(h.hrefFor("/docs/quickstart")).toBe("https://docs.inrent.ai/quickstart");
    expect(h.hrefFor("/sign-in?next=%2Fdashboard")).toBe("https://auth.inrent.ai/sign-in?next=%2Fdashboard");
    expect(h.hrefFor("/invite/tok")).toBe("https://auth.inrent.ai/invite/tok");
    // Not internal paths: untouched.
    expect(h.hrefFor("#faq")).toBe("#faq");
    expect(h.hrefFor("mailto:a@b.c")).toBe("mailto:a@b.c");
    expect(h.hrefFor("//cdn.example/x")).toBe("//cdn.example/x");
  });

  it("only treats exact prefixes as sections", async () => {
    const h = await load(ROOT, "https://inrent.ai");
    expect(h.sectionOf("/dashboardx")).toBe("www");
    expect(h.sectionOf("/docs-old")).toBe("www");
    expect(h.sectionOf("/sign-in")).toBe("auth");
  });

  it("resolves request hosts and back-maps section paths", async () => {
    const h = await load(ROOT, "https://inrent.ai");
    expect(h.sectionForHost("inrent.ai")).toBe("www");
    expect(h.sectionForHost("www.inrent.ai")).toBe("www");
    expect(h.sectionForHost("APP.inrent.ai")).toBe("app");
    expect(h.sectionForHost("evil.inrent.ai")).toBeNull();
    expect(h.sectionForHost("inrent.ai.evil.com")).toBeNull();
    expect(h.internalPath("app", "/")).toBe("/dashboard");
    expect(h.internalPath("docs", "/quickstart")).toBe("/docs/quickstart");
    expect(h.toInternalPath("app", "/keys")).toBe("/dashboard/keys");
    expect(h.toInternalPath("app", "/dashboard/keys")).toBe("/dashboard/keys");
    expect(h.toInternalPath("docs", "/")).toBe("/docs");
  });

  it("shares cookies on the root domain without the port", async () => {
    const h = await load("inrent.localhost:3000", "http://inrent.localhost:3000");
    expect(h.cookieDomain).toBe("inrent.localhost");
    expect(h.hrefFor("/dashboard")).toBe("http://app.inrent.localhost:3000/");
    expect(h.allOrigins()).toContain("http://auth.inrent.localhost:3000");
  });

  it("never turns ?next= into an open redirect", async () => {
    const h = await load(ROOT, "https://inrent.ai");
    expect(h.safeRedirect("https://app.inrent.ai/keys")).toBe("https://app.inrent.ai/keys");
    expect(h.safeRedirect("/dashboard/usage")).toBe("https://app.inrent.ai/usage");
    for (const bad of ["https://evil.example/", "https://app.inrent.ai.evil.com/", "//evil.example", "/\\evil.example", "javascript:alert(1)", "http://app.inrent.ai/keys", "", null]) {
      expect(h.safeRedirect(bad)).toBe("https://app.inrent.ai/");
    }
  });
});
