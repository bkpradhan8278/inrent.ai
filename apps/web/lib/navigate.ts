import type { useRouter } from "next/navigation";
import { hrefFor } from "@/lib/hosts";

/**
 * Navigate to an internal path from client code. Within this host it is a client-side transition;
 * to another section's host (subdomain routing) it is a plain page load — the router would otherwise
 * try to fetch the other origin's RSC payload, which the CSP (connect-src 'self') blocks.
 */
export function navigate(router: ReturnType<typeof useRouter>, path: string, { replace = false, refresh = false } = {}) {
  const url = hrefFor(path);
  if (/^https?:\/\//.test(url) && new URL(url).origin !== window.location.origin) {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
    return;
  }
  if (replace) router.replace(url, { scroll: false });
  else router.push(url);
  if (refresh) router.refresh();
}
