import type { Metadata } from "next";
import { ContactForm } from "@/components/marketing/forms";
import { PageHero } from "@/components/marketing/page-hero";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact", description: "Contact the INRENT team for support, sales, partnerships or security.", alternates: { canonical: "/contact" } };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the INRENT team" description="Support, sales, provider partnerships, press or security — we read everything." />
      <section className="container-page grid gap-10 py-16 lg:grid-cols-[0.7fr_1.3fr]">
        <div className="flex flex-col gap-4 text-sm text-fg-muted">
          <div>
            <div className="font-medium text-fg">Support</div>
            <a className="text-accent hover:underline" href={`mailto:${site.supportEmail}`}>
              {site.supportEmail}
            </a>
          </div>
          <div>
            <div className="font-medium text-fg">Sales & partnerships</div>
            <a className="text-accent hover:underline" href={`mailto:${site.salesEmail}`}>
              {site.salesEmail}
            </a>
          </div>
          <div>
            <div className="font-medium text-fg">Security</div>
            <a className="text-accent hover:underline" href={`mailto:${site.securityEmail}`}>
              {site.securityEmail}
            </a>
          </div>
        </div>
        <div className="panel rounded-2xl p-6 sm:p-8">
          <ContactForm defaultCategory={["sales", "technical", "billing", "security", "abuse"].includes(topic ?? "") ? topic : "general"} />
        </div>
      </section>
    </>
  );
}
