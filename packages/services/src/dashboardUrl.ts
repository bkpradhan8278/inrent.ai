import { getServerEnv } from "./env";

/**
 * Public URL of a dashboard page for use in emails, e.g. dashboardUrl("/keys").
 *
 * Mirrors the section-host convention in apps/web/lib/hosts.ts (services cannot import from the web
 * app): with NEXT_PUBLIC_ROOT_DOMAIN set the dashboard lives on app.<root> without the /dashboard
 * prefix, otherwise it is /dashboard/<path> on APP_URL. Keep the two in step if hosts.ts changes.
 */
export function dashboardUrl(path: `/${string}`): string {
  const root = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "").trim().toLowerCase();
  const { origin, protocol } = new URL(getServerEnv().APP_URL);
  return root ? `${protocol}//app.${root}${path}` : `${origin}/dashboard${path}`;
}
