import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
import { hrefFor, internalPath, sectionForHost, sectionOf, sectionOrigin } from "@/lib/hosts";

/**
 * Request routing (see lib/hosts.ts).
 *
 * One host: optimistic route protection only — /dashboard and /admin without a session cookie are
 * redirected to sign-in. Real authorization happens server-side in every page and action.
 *
 * Subdomains: each host serves its section. Section paths are rewritten to internal routes
 * (app.inrent.ai/keys → /dashboard/keys); paths that belong to another section are redirected to
 * that section's host, so old links and bookmarks keep working. Redirects are temporary (307) so
 * turning subdomains off never leaves browsers holding stale permanent redirects.
 */
const hasSession = (request: NextRequest) => Boolean(getSessionCookie(request, { cookiePrefix: "inrent" }));

function signIn(request: NextRequest, returnTo: string) {
  const url = new URL(hrefFor("/sign-in"), request.url);
  url.searchParams.set("next", returnTo);
  return NextResponse.redirect(url);
}

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const section = sectionForHost(request.headers.get("host"));

  if (section === null) {
    if (/^\/(dashboard|admin)(\/|$)/.test(pathname) && !hasSession(request)) return signIn(request, pathname + search);
    return NextResponse.next();
  }

  const target = sectionOf(pathname);

  if (section === "www" || section === "auth") {
    if (section === "auth" && pathname === "/") return NextResponse.redirect(hrefFor("/sign-in"), 307);
    if (target !== section) return NextResponse.redirect(hrefFor(pathname + search), 307);
    return NextResponse.next();
  }

  // app / admin / docs: an internal path for any section (including this one's own /dashboard/…)
  // is redirected to its canonical URL; anything else is a path inside this section.
  if (target !== "www") return NextResponse.redirect(hrefFor(pathname + search), 307);
  if (section !== "docs" && !hasSession(request)) return signIn(request, `${sectionOrigin(section)}${pathname}${search}`);
  const url = request.nextUrl.clone();
  url.pathname = internalPath(section, pathname);
  return NextResponse.rewrite(url);
}

export const config = {
  // Everything except API routes, Next internals and files (anything with an extension).
  matcher: ["/((?!api(?:/|$)|_next/|__nextjs|.*\\.[A-Za-z0-9]+$).*)"],
};
