import NextLink from "next/link";
import type { ComponentProps } from "react";
import { hrefFor } from "@/lib/hosts";

/**
 * next/link that maps internal paths ("/dashboard/keys") to their section's public URL when
 * subdomain routing is on (see lib/hosts.ts). Same-origin absolute URLs still navigate client-side;
 * cross-section links become full page loads.
 */
export default function Link({ href, ...props }: ComponentProps<typeof NextLink>) {
  return <NextLink href={typeof href === "string" ? hrefFor(href) : href} {...props} />;
}
