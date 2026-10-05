/**
 * Colour theme preference. Stored in a cookie (not localStorage) so one choice carries across
 * every INRENT subdomain when subdomain routing is on (cookie domain from lib/hosts.ts).
 */
export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_COOKIE = "inrent-theme";
export const DEFAULT_THEME: ThemePreference = "dark";
/** Browser toolbar colour (meta theme-color) per applied theme: the page background. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { dark: "#06070a", light: "#f6f7f9" };

/**
 * Runs in <head> before first paint, so the page never flashes the wrong palette. Keep it small
 * and dependency-free; it mirrors readThemePreference/resolveTheme below.
 */
export const themeInitScript = `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=(light|dark|system)(?:;|$)/);var p=m?m[1]:"${DEFAULT_THEME}";var t=p==="system"?(window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"):p;document.documentElement.setAttribute("data-theme",t);var c=document.querySelector('meta[name="theme-color"]');if(!c){c=document.createElement("meta");c.name="theme-color";document.head.appendChild(c);}c.setAttribute("content",t==="light"?"${THEME_COLOR.light}":"${THEME_COLOR.dark}");}catch(e){}})();`;

export function readThemePreference(cookie: string): ThemePreference {
  const m = new RegExp(`(?:^|; )${THEME_COOKIE}=(light|dark|system)(?:;|$)`).exec(cookie);
  return (m?.[1] as ThemePreference | undefined) ?? DEFAULT_THEME;
}

export function resolveTheme(pref: ThemePreference, prefersLight: boolean): ResolvedTheme {
  return pref === "system" ? (prefersLight ? "light" : "dark") : pref;
}

export function themeCookie(pref: ThemePreference, domain?: string): string {
  return `${THEME_COOKIE}=${pref}; Path=/; Max-Age=31536000; SameSite=Lax${domain ? `; Domain=${domain}` : ""}`;
}
