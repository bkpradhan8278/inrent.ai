/**
 * Subdomain routing.
 *
 * With NEXT_PUBLIC_ROOT_DOMAIN set (e.g. "inrent.ai"; locally "inrent.localhost:3000"), the web app
 * serves each section on its own host:
 *
 *   inrent.ai        marketing, models, pricing, legal          (internal paths: everything else)
 *   app.inrent.ai    developer dashboard                         (internal: /dashboard/*)
 *   admin.inrent.ai  admin console                               (internal: /admin/*)
 *   docs.inrent.ai   documentation                               (internal: /docs/*)
 *   auth.inrent.ai   sign in, sign up, password reset, invites   (internal: /sign-in, /sign-up, ...)
 *
 * Code keeps using internal paths ("/dashboard/keys"); `hrefFor` turns them into public URLs
 * ("https://app.inrent.ai/keys") and proxy.ts maps requests back. Without NEXT_PUBLIC_ROOT_DOMAIN
 * everything stays on one host by path and `hrefFor` returns its input unchanged.
 */
export type Section = "www" | "app" | "admin" | "docs" | "auth";

const ROOT = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
export const subdomainsEnabled = ROOT !== "";

const PROTOCOL = (process.env.NEXT_PUBLIC_APP_URL ?? "https://inrent.ai").startsWith("http://") ? "http:" : "https:";

/** Cookie Domain shared by every section (the root host without its port), or undefined on one host. */
export const cookieDomain: string | undefined = subdomainsEnabled ? ROOT.replace(/:\d+$/, "") : undefined;

const PREFIX: Partial<Record<Section, string>> = { app: "/dashboard", admin: "/admin", docs: "/docs" };
const AUTH_PATHS = ["/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/invite"];

function under(path: string, prefix: string) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

/** Which section an internal path belongs to. */
export function sectionOf(internalPath: string): Section {
  if (under(internalPath, "/dashboard")) return "app";
  if (under(internalPath, "/admin")) return "admin";
  if (under(internalPath, "/docs")) return "docs";
  if (AUTH_PATHS.some((p) => under(internalPath, p))) return "auth";
  return "www";
}

export function sectionHost(section: Section): string {
  return section === "www" ? ROOT : `${section}.${ROOT}`;
}

export function sectionOrigin(section: Section): string {
  return `${PROTOCOL}//${sectionHost(section)}`;
}

/** Every origin the app is served from (for auth trusted origins and redirect allow-lists). */
export function allOrigins(): string[] {
  return subdomainsEnabled ? (["www", "app", "admin", "docs", "auth"] as const).map(sectionOrigin) : [];
}

/** Internal path → path on its section host: /dashboard/keys → /keys, /docs → /. */
function publicPath(section: Section, internalPath: string): string {
  const prefix = PREFIX[section];
  if (!prefix) return internalPath;
  const rest = internalPath.slice(prefix.length);
  return rest === "" ? "/" : rest;
}

/** Section host path → internal path: on app, /keys → /dashboard/keys. */
export function internalPath(section: Section, path: string): string {
  const prefix = PREFIX[section];
  if (!prefix) return path;
  return path === "/" ? prefix : `${prefix}${path}`;
}

/** The section served by a request Host header, or null for an unknown host (served by path, as on one host). */
export function sectionForHost(host: string | null): Section | null {
  if (!subdomainsEnabled || !host) return null;
  const h = host.toLowerCase();
  if (h === ROOT || h === `www.${ROOT}`) return "www";
  for (const s of ["app", "admin", "docs", "auth"] as const) if (h === `${s}.${ROOT}`) return s;
  return null;
}

/**
 * Public URL for an internal app path (may carry ?query and #hash). Absolute when subdomains are
 * on, so links work from any section; unchanged for external URLs, anchors and single-host mode.
 */
export function hrefFor(path: string): string {
  if (!subdomainsEnabled || !path.startsWith("/") || path.startsWith("//")) return path;
  const cut = path.search(/[?#]/);
  const pathname = cut === -1 ? path : path.slice(0, cut);
  const rest = cut === -1 ? "" : path.slice(cut);
  const section = sectionOf(pathname);
  return `${sectionOrigin(section)}${publicPath(section, pathname)}${rest}`;
}

/** Absolute URL for an internal path, for emails, share links, sitemaps and canonical URLs. */
export function absoluteUrl(path: string): string {
  const url = hrefFor(path);
  return url.startsWith("/") ? `${(process.env.NEXT_PUBLIC_APP_URL ?? "https://inrent.ai").replace(/\/$/, "")}${url}` : url;
}

/**
 * Visible pathname → internal pathname inside a section, for active-state checks: on app.inrent.ai
 * the pathname "/keys" is "/dashboard/keys"; on a single host it is already internal.
 */
export function toInternalPath(section: "app" | "admin" | "docs", pathname: string): string {
  const prefix = PREFIX[section]!;
  return under(pathname, prefix) ? pathname : internalPath(section, pathname);
}

/**
 * Post-login redirect target: same-site relative paths (mapped to their section) or absolute URLs on
 * one of our own origins. Anything else falls back, so `next` can never become an open redirect.
 */
export function safeRedirect(raw: string | null | undefined, fallback = "/dashboard"): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\")) return hrefFor(raw);
  if (raw && subdomainsEnabled) {
    try {
      const u = new URL(raw);
      if (allOrigins().includes(u.origin)) return u.toString();
    } catch {
      /* not a URL */
    }
  }
  return hrefFor(fallback);
}
