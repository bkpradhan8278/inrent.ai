/** Client-safe formatters. Money values arrive from the server as decimal USD strings. */

export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat("en-US", opts).format(n);
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

export function formatUsdString(usd: string | number | null | undefined, opts: { precise?: boolean } = {}): string {
  if (usd === null || usd === undefined || usd === "") return "—";
  const n = Number(usd);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = opts.precise || (abs > 0 && abs < 0.01) ? 6 : 2;
  return `${n < 0 ? "-" : ""}$${abs.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: digits })}`;
}

export function formatPerMillion(price: string | null | undefined): string | null {
  if (price === null || price === undefined) return null;
  const [w = "0", f = ""] = price.split(".");
  const frac = f.replace(/0+$/, "");
  return frac ? `$${w}.${frac}` : `$${w}`;
}

export function formatDate(d: string | Date, opts: Intl.DateTimeFormatOptions = { dateStyle: "medium" }): string {
  return new Intl.DateTimeFormat("en-US", opts).format(typeof d === "string" ? new Date(d) : d);
}

export function formatDateTime(d: string | Date): string {
  return formatDate(d, { dateStyle: "medium", timeStyle: "medium" });
}

export function formatRelative(d: string | Date): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = (date.getTime() - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  const abs = Math.abs(diff);
  if (abs < 60) return rtf.format(Math.round(diff), "second");
  if (abs < 3600) return rtf.format(Math.round(diff / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), "hour");
  if (abs < 86400 * 30) return rtf.format(Math.round(diff / 86400), "day");
  return formatDate(date);
}

export function formatContext(tokens: number | null | undefined): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${+(tokens / 1_048_576).toFixed(tokens % 1_048_576 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1024)}K`;
  return String(tokens);
}

export function formatMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  return ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${Math.round(ms)}ms`;
}
