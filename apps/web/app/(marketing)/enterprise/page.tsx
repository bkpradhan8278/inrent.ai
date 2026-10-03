import { Building2, FileLock2, KeyRound, Lock, Network, ScrollText, ServerCog, ShieldCheck, Wallet } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/forms";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SectionHeading } from "@/components/ui/misc";

export const metadata: Metadata = {
  title: "Enterprise",
  description: "INRENT for enterprises: spend controls, RBAC, audit logs, data controls and dedicated infrastructure options. Designed for enterprise security.",
  alternates: { canonical: "/enterprise" },
};

const ITEMS = [
  { icon: Wallet, title: "Spend controls", body: "Organization caps, project budgets, per-key limits and member budgets.", state: "available" },
  { icon: KeyRound, title: "RBAC", body: "Owner, Admin, Developer, Billing and Viewer roles with least-privilege defaults.", state: "available" },
  { icon: ScrollText, title: "Audit logs", body: "Every key, billing, membership and admin action is recorded and exportable.", state: "available" },
  { icon: FileLock2, title: "Data controls", body: "Prompt and response logging off by default, configurable retention and zero-retention mode.", state: "available" },
  { icon: Network, title: "Custom routing", body: "Pin providers, regions and fallback order per organization or request.", state: "available" },
  { icon: Lock, title: "SSO & SCIM", body: "SAML/OIDC single sign-on and automated provisioning.", state: "roadmap" },
  { icon: ServerCog, title: "Dedicated deployments", body: "Dedicated gateway capacity and self-hosted model endpoints.", state: "roadmap" },
  { icon: Building2, title: "Data residency & private networking", body: "Regional processing and private connectivity options.", state: "roadmap" },
  { icon: ShieldCheck, title: "Contracts & SLA", body: "Custom terms, DPAs and service levels agreed per customer.", state: "contract" },
];

export default function EnterprisePage() {
  return (
    <>
      <PageHero eyebrow="Enterprise" title="AI infrastructure your security team can sign off on." description="Designed for enterprise security: controls for spend, access, data and routing — with dedicated options as you scale. We describe what exists today and what is on the roadmap.">
        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="#contact">Talk to us</a>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/security">Security overview</Link>
          </Button>
        </div>
      </PageHero>
      <section className="container-page py-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((i) => (
            <div key={i.title} className="panel flex flex-col gap-3 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <i.icon className="size-5 text-accent" />
                {i.state === "available" ? <Badge variant="accent">Available</Badge> : i.state === "roadmap" ? <Badge variant="outline">Roadmap</Badge> : <Badge variant="iris">By agreement</Badge>}
              </div>
              <h3 className="text-[15px] font-semibold text-fg">{i.title}</h3>
              <p className="text-[13.5px] leading-relaxed text-fg-muted">{i.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-xs text-fg-subtle">INRENT does not currently hold third-party certifications such as SOC 2 or ISO 27001. We will publish any certification only after it is obtained.</p>
      </section>
      <section id="contact" className="scroll-mt-20 border-t border-border bg-bg-elevated/40">
        <div className="container-page grid gap-12 py-20 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="Contact" title="Tell us about your workload" description="Volumes, models, regions, compliance needs — a person on our team will reply." />
          <div className="panel rounded-2xl p-6 sm:p-8">
            <ContactForm defaultCategory="sales" />
          </div>
        </div>
      </section>
    </>
  );
}
