import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic route protection: requests to the dashboard or admin console without a session
 * cookie are redirected to sign-in. Real authorization happens server-side in every page and
 * action — this only avoids rendering protected shells for signed-out visitors.
 */
export function proxy(request: NextRequest) {
  const cookie = getSessionCookie(request, { cookiePrefix: "inrent" });
  if (!cookie) {
    const url = new URL("/sign-in", request.url);
    url.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
