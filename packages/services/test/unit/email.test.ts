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
});

describe("csv export", () => {
  it("quotes values and neutralizes formula injection", () => {
    const csv = toCsv([{ a: "=HYPERLINK(1)", b: 'x,"y"', c: null }]);
    expect(csv).toBe("a,b,c\n'=HYPERLINK(1),\"x,\"\"y\"\"\",\n");
  });
});
