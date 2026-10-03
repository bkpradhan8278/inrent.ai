import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LEGAL } from "@/lib/legal";

const ROOT = path.join(__dirname, "..");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name.startsWith(".")) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|md)$/.test(e.name)) out.push(p);
  }
  return out;
}

const sources = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components")), ...walk(path.join(ROOT, "lib"))];

describe("product honesty guards", () => {
  it("legal pages are rendered with a visible legal-review notice", () => {
    const page = fs.readFileSync(path.join(ROOT, "components/marketing/legal-page.tsx"), "utf8");
    expect(page).toContain("requires legal review");
    expect(Object.keys(LEGAL).length).toBeGreaterThanOrEqual(5);
  });

  it("no per-token model prices are hard-coded in UI code", () => {
    // Prices must come from the database. Matches things like "$3 / 1M", "$0.15 per million tokens".
    const pattern = /\$\s?\d+(\.\d+)?\s*(\/|per)\s*(1M|1 ?million|million|M tokens)/i;
    const offenders = sources.filter((f) => pattern.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });

  it("does not claim certifications the company does not hold", () => {
    const claim = /\b(SOC ?2|ISO ?27001|HIPAA)\b[^.\n]{0,40}\b(certified|compliant|attested)\b/i;
    const offenders = sources.filter((f) => claim.test(fs.readFileSync(f, "utf8"))).map((f) => path.relative(ROOT, f));
    expect(offenders).toEqual([]);
  });
});
