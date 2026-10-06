import { describe, expect, it } from "vitest";
import { renderEmail } from "../../src/email";
import { toCsv } from "../../src/account";

describe("email rendering", () => {
  it("escapes user-controlled content", () => {
    const { html, text } = renderEmail({ title: "<script>x</script>", intro: "Hi & bye", action: { label: "Go", url: "https://inrent.ai/a?b=1&c=2" } });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(text).toContain("https://inrent.ai/a?b=1&c=2");
  });

  it("escapes every dynamic field of the extended layout", () => {
    const xss = "<img src=x onerror=alert(1)>";
    const { html } = renderEmail({
      title: xss,
      intro: xss,
      preheader: xss,
      body: [xss],
      code: { value: xss, label: xss },
      details: [{ label: xss, value: xss }],
      steps: [{ title: xss, body: xss }],
      action: { label: xss, url: 'https://inrent.ai/a?x="onmouseover="alert(1)' },
      note: xss,
      footer: xss,
      links: [{ label: xss, url: 'https://inrent.ai/?q="><b>' }],
    });
    // The only images are the layout's own logo; no injected tag survives.
    expect(html.replace(/<img src="https:\/\/[^"]+\/brand\/email-logo\.png"[^>]*>/g, "")).not.toContain("<img");
    expect(html).not.toContain('"onmouseover="');
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("rejects non-http(s) action URLs and drops non-http(s) footer links", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "ftp://inrent.ai/x", "//inrent.ai/x", "not a url", "https://inrent.ai/a b", ""]) {
      expect(() => renderEmail({ title: "T", intro: "I", action: { label: "Go", url } })).toThrow(/http/);
    }
    const { html, text } = renderEmail({
      title: "T",
      intro: "I",
      links: [
        { label: "Bad", url: "javascript:alert(1)" },
        { label: "Good", url: "https://inrent.ai/docs" },
      ],
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://inrent.ai/docs"');
    expect(text).not.toContain("Bad:");
  });

  it("renders the one-time code, details, steps and CTA in both html and text", () => {
    const { html, text } = renderEmail({
      title: "T",
      intro: "I",
      code: { value: "482913", label: "Code" },
      details: [{ label: "Ref", value: "abc" }],
      steps: [{ title: "First", body: "Do it" }],
      action: { label: "Open", url: "https://inrent.ai/x" },
    });
    for (const out of [html, text]) {
      expect(out).toContain("482913");
      expect(out).toContain("First");
      expect(out).toContain("https://inrent.ai/x");
    }
    expect(text).toContain("Ref: abc");
    expect(html).toContain("Button not working?");
  });

  it("keeps the legacy call shape working and derives footer links from APP_URL", () => {
    const prev = process.env.APP_URL;
    process.env.APP_URL = "https://example.test/";
    try {
      const { html, text } = renderEmail({ title: "T", intro: "I", footer: "custom footer" });
      expect(html).toContain("custom footer");
      expect(html).toContain('href="https://example.test"');
      expect(html).toContain('href="https://example.test/docs"');
      expect(text).toContain("Docs: https://example.test/docs");
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });

  it("shows the hosted PNG logo beside the text wordmark, from an absolute APP_URL origin", () => {
    const prev = process.env.APP_URL;
    try {
      process.env.APP_URL = ""; // unset/invalid falls back to the production origin
      const { html: fallback } = renderEmail({ title: "T", intro: "I" });
      expect(fallback).toContain('<img src="https://inrent.ai/brand/email-logo.png" width="32" height="32" alt="INRENT"');

      process.env.APP_URL = "https://example.test/";
      const { html, text } = renderEmail({ title: "T", intro: "I", action: { label: "Go", url: "https://inrent.ai/x" } });
      const logos = html.match(/<img [^>]*>/g) ?? [];
      // Header (32px, alt text) and footer (20px, decorative); never relative, inline-data or SVG.
      expect(logos).toHaveLength(2);
      for (const img of logos) {
        expect(img).toContain('src="https://example.test/brand/email-logo.png"');
        expect(img).toContain("display:block");
        expect(img).toContain("border:0");
      }
      expect(logos[0]).toContain('width="32" height="32" alt="INRENT"');
      expect(logos[1]).toContain('alt=""');
      expect(html).not.toMatch(/src="(?!https?:\/\/)|data:image|\.svg/);
      // The text wordmark stays for clients that block images, and the plain-text part has no image.
      expect(html).toMatch(/letter-spacing:4px;color:#0d1117">INRENT<\/span>/);
      expect(text).not.toContain("email-logo");
      expect(text.startsWith("T\n\nI")).toBe(true);

      process.env.APP_URL = 'https://example.test/"onerror="alert(1)';
      expect(renderEmail({ title: "T", intro: "I" }).html).not.toContain('"onerror="');
    } finally {
      if (prev === undefined) delete process.env.APP_URL;
      else process.env.APP_URL = prev;
    }
  });

  it("has a hidden preheader, 600px width and color-scheme hints", () => {
    const { html } = renderEmail({ title: "T", intro: "Preview me" });
    expect(html).toContain("display:none");
    expect(html).toContain("Preview me");
    expect(html).toContain('width="600"');
    expect(html).toContain('name="color-scheme"');
    expect(html).toContain("You received this email because of activity on your INRENT account.");
  });
});

describe("csv export", () => {
  it("quotes values and neutralizes formula injection", () => {
    const csv = toCsv([{ a: "=HYPERLINK(1)", b: 'x,"y"', c: null }]);
    expect(csv).toBe("a,b,c\n'=HYPERLINK(1),\"x,\"\"y\"\"\",\n");
  });
});

describe("sendTemplateEmail subject", () => {
  it("strips line breaks so a name cannot inject headers", async () => {
    const sent: string[] = [];
    const realFetch = globalThis.fetch;
    const { sendTemplateEmail, resetEmailProviderForTests } = await import("../../src/email");
    process.env.EMAIL_PROVIDER = "resend";
    process.env.RESEND_API_KEY = "re_test";
    resetEmailProviderForTests();
    globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
      sent.push(JSON.parse(init?.body ?? "{}").subject);
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      await sendTemplateEmail("a@example.com", { subject: "Hi\r\nBcc: evil@example.com", title: "t", intro: "i" });
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.EMAIL_PROVIDER;
      delete process.env.RESEND_API_KEY;
      resetEmailProviderForTests();
    }
    expect(sent[0]).toBe("Hi Bcc: evil@example.com");
  });
});
