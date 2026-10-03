import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { LEGAL } from "@/lib/legal";

const doc = LEGAL.terms;

export const metadata: Metadata = { title: doc.title, description: doc.intro, alternates: { canonical: "/terms" } };

export default function Page() {
  return <LegalPage {...doc} />;
}
