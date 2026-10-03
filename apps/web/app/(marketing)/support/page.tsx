import { BookOpen, LifeBuoy, MessageSquare, ScrollText } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "@/components/marketing/forms";
import { PageHero } from "@/components/marketing/page-hero";
import { SectionHeading } from "@/components/ui/misc";
import { FAQ } from "@/lib/faq";

export const metadata: Metadata = { title: "Support & FAQ", description: "Documentation, frequently asked questions and how to contact the INRENT team.", alternates: { canonical: "/support" } };

export default function SupportPage() {
  const jsonLd = { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) };
  return (
    <>
      <PageHero eyebrow="Support" title="How can we help?" description="Most answers are in the docs. When you need a person, open a ticket — real people on our team read and reply to every message." />
      <section className="container-page grid gap-4 py-14 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: BookOpen, t: "Documentation", d: "Guides, API reference and examples.", href: "/docs" },
          { icon: ScrollText, t: "Error reference", d: "What each error means and how to fix it.", href: "/docs/errors" },
          { icon: LifeBuoy, t: "System status", d: "Live component status and incidents.", href: "/status" },
          { icon: MessageSquare, t: "Contact us", d: "Technical, billing, security or sales.", href: "#contact" },
        ].map((c) => (
          <Link key={c.t} href={c.href} className="panel group rounded-xl p-5 transition-colors hover:border-border-strong">
            <c.icon className="size-5 text-accent" />
            <div className="mt-3 font-medium text-fg">{c.t}</div>
            <div className="mt-1 text-sm text-fg-muted">{c.d}</div>
          </Link>
        ))}
      </section>
      <section id="faq" className="scroll-mt-20 border-y border-border bg-bg-elevated/40">
        <div className="container-page grid gap-10 py-20 lg:grid-cols-[0.7fr_1.3fr]">
          <SectionHeading eyebrow="FAQ" title="Frequently asked questions" />
          <div className="flex flex-col gap-2">
            {FAQ.map((f) => (
              <details key={f.q} className="group rounded-xl border border-border bg-surface px-5 py-4 open:bg-surface-2">
                <summary className="cursor-pointer list-none font-medium text-fg marker:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-fg-subtle transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-fg-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <section id="contact" className="container-page grid scroll-mt-20 gap-10 py-20 lg:grid-cols-[0.7fr_1.3fr]">
        <SectionHeading eyebrow="Contact" title="Open a ticket" description="Include request IDs (req_…) for API issues. For security reports see the security page." />
        <div className="panel rounded-2xl p-6 sm:p-8">
          <ContactForm />
        </div>
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </>
  );
}
