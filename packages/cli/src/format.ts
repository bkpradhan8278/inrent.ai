import pc from "picocolors";

export interface Output {
  out: (s: string) => void;
  err: (s: string) => void;
  json: boolean;
  color: boolean;
}

export function colors(enabled: boolean) {
  return enabled ? pc : pc.createColors(false);
}

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, "g");
const visible = (s: string) => s.replace(ANSI, "").length;

/** Renders a left-aligned text table; columns listed in `right` are right-aligned. */
export function table(headers: string[], rows: string[][], opts: { right?: number[]; dim?: (s: string) => string } = {}): string {
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => visible(r[i] ?? ""))));
  const pad = (s: string, i: number) => {
    const fill = " ".repeat(Math.max(0, widths[i]! - visible(s)));
    return opts.right?.includes(i) ? fill + s : s + fill;
  };
  const head = headers.map((h, i) => pad(h, i)).join("  ").trimEnd();
  const lines = [opts.dim ? opts.dim(head) : head, ...rows.map((r) => headers.map((_, i) => pad(r[i] ?? "", i)).join("  ").trimEnd())];
  return lines.join("\n");
}

export function usd(v: string | null | undefined, digits = 2): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  const d = n !== 0 && Math.abs(n) < 0.01 ? 6 : digits;
  return `$${n.toFixed(d)}`;
}

export function perMillion(v: string | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const [w = "0", f = ""] = v.split(".");
  const frac = f.replace(/0+$/, "");
  return frac ? `$${w}.${frac}` : `$${w}`;
}

export function compact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function ms(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(2)}s` : `${Math.round(v)}ms`;
}

export function context(tokens: number | null | undefined): string {
  if (!tokens) return "—";
  if (tokens >= 1_000_000) return `${+(tokens / 1_048_576).toFixed(1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1024)}K`;
  return String(tokens);
}
