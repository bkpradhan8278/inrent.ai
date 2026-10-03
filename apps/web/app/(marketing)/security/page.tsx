import { Bug, Database, FileKey2, KeyRound, Lock, Network, ScrollText, ShieldCheck, Siren } from "lucide-react";
import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Security", description: "How INRENT protects API keys, provider credentials, payment data and customer content.", alternates: { canonical: "/security" } };

const CONTROLS = [
  { icon: KeyRound, t: "API keys", d: "256-bit random keys; only an HMAC-SHA256 digest (with a server-side pepper) is stored. Keys are shown once, can be scoped, limited, expired, rotated and revoked instantly." },
  { icon: FileKey2, t: "Secrets encryption", d: "Provider keys (BYOK), webhook secrets and MCP credentials are encrypted with AES-256-GCM bound to their organization, with key rotation support. Platform provider credentials live in the environment or a secret manager — never in the database or browser." },
  { icon: Lock, t: "Authentication & sessions", d: "Self-hosted authentication with secure, HTTP-only cookies, password hashing, email verification, rate-limited sign-in and OAuth (GitHub, Google)." },
  { icon: ShieldCheck, t: "Authorization", d: "Role-based access for organizations (Owner, Admin, Developer, Billing, Viewer) and the admin console. Every mutation checks membership and permission server-side." },
  { icon: Network, t: "Outbound safety", d: "Webhook and MCP destinations are validated and DNS-resolved; private, loopback, link-local and metadata addresses are rejected and redirects are not followed." },
  { icon: Database, t: "Data minimization", d: "Prompt and response logging off by default; configurable retention and zero-retention mode; IP addresses stored only as salted hashes." },
  { icon: ScrollText, t: "Audit logging", d: "Key, billing, membership, provider, pricing and admin changes are recorded with actor and time." },
  { icon: Siren, t: "Abuse prevention", d: "Per-IP, per-key and per-organization rate limits, failed-auth throttling, budgets and spend-spike alerts." },
];

export default function SecurityPage() {
  return (
    <>
      <PageHero eyebrow="Security" title="Security is part of the product." description="An overview of how INRENT protects keys, credentials, payments and customer content. We do not claim certifications we have not obtained." />
      <section className="container-page py-16">
        <div className="grid gap-4 sm:grid-cols-2">
          {CONTROLS.map((c) => (
            <div key={c.t} className="panel rounded-xl p-6">
              <c.icon className="size-5 text-accent" />
              <h2 className="mt-4 text-[15px] font-semibold text-fg">{c.t}</h2>
              <p className="mt-2 text-[13.5px] leading-relaxed text-fg-muted">{c.d}</p>
            </div>
          ))}
        </div>
        <div className="panel mt-10 flex flex-col gap-3 rounded-xl p-6 sm:flex-row sm:items-center">
          <Bug className="size-5 shrink-0 text-amber" />
          <p className="text-sm text-fg-muted">
            Found a vulnerability? Please report it privately to{" "}
            <a href={`mailto:${site.securityEmail}`} className="text-accent hover:underline">
              {site.securityEmail}
            </a>
            . We acknowledge reports promptly and ask that you give us reasonable time to fix issues before disclosure. See SECURITY.md in our repository for details.
          </p>
        </div>
        <p className="mt-6 text-xs text-fg-subtle">Certifications such as SOC 2, ISO 27001 or HIPAA are not currently held. Any future certification will be listed here only once obtained.</p>
      </section>
    </>
  );
}
