import { Check } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow, SectionHeading } from "@/components/ui/misc";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { safePublicModels } from "@/lib/catalog";
import { formatCompact, formatPerMillion } from "@/lib/format";
import { safePlans } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Pricing",
  description: "Pay-as-you-go AI API pricing with prepaid credits. Plans for developers, teams and enterprises.",
  alternates: { canonical: "/pricing" },
};

const FAQ = [
  { q: "How is usage billed?", a: "Each request is charged from your prepaid credit balance using the model's published per-token price, calculated on the server from the tokens the provider reports. Every request shows its cost in the response headers and request logs." },
  { q: "What is the platform fee?", a: "Published model prices already include the INRENT platform fee. There are no hidden per-request fees for platform-funded usage." },
  { q: "What about bring-your-own-key requests?", a: "When a request runs on your own provider key, the provider bills you directly. INRENT records usage for analytics; any BYOK fee is shown in your billing settings before it applies." },
  { q: "Do credits expire?", a: "Credit terms, including any expiry, are set out in the Terms of Service. You can see every credit and charge in Billing → Transactions." },
  { q: "Can I set spending limits?", a: "Yes — monthly organization caps, project budgets and per-key spend limits. Requests that would exceed a limit are rejected with a clear error instead of being charged." },
  { q: "Is auto-recharge on by default?", a: "No. Auto-recharge only runs if you explicitly enable it and set a threshold and amount." },
];

export default async function PricingPage() {
  const [plans, models] = await Promise.all([safePlans(), safePublicModels()]);
  const priced = models.filter((m) => m.pricing && (m.pricing.input || m.pricing.output));
  return (
    <div className="relative">
      <div className="bg-grid pointer-events-none absolute inset-x-0 top-0 h-[480px]" aria-hidden />
      <div className="container-page relative py-16">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <Eyebrow>Pricing</Eyebrow>
          <h1 className="text-display text-5xl text-fg sm:text-6xl">Pay for what you use.</h1>
          <p className="text-fg-muted">Prepaid credits, per-token pricing per model, and spend controls at every level. Start free, scale with your usage.</p>
        </div>

        {plans.length ? (
          <div className="mt-14 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            {plans.map((p) => {
              const price = p.contactSales ? "Custom" : p.priceMonthlyCents === 0 ? (p.isPayAsYouGo ? "Usage" : "$0") : p.priceMonthlyCents ? `$${(p.priceMonthlyCents / 100).toFixed(0)}` : "—";
              return (
                <div key={p.id} className={cn("panel relative flex flex-col rounded-2xl p-6", p.highlighted && "border-accent/45 shadow-glow")}>
                  {p.highlighted ? <Badge variant="accent" className="absolute -top-2.5 left-6">Most popular</Badge> : null}
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-fg">{p.name}</h2>
                    {!p.available ? <Badge variant="outline">Coming soon</Badge> : null}
                  </div>
                  <p className="mt-1 min-h-10 text-[13px] text-fg-muted">{p.description}</p>
                  <div className="mt-5 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-semibold tracking-tight text-fg">{price}</span>
                    {p.priceMonthlyCents && p.priceMonthlyCents > 0 ? <span className="text-sm text-fg-subtle">/ month</span> : p.isPayAsYouGo && p.priceMonthlyCents === 0 ? <span className="text-sm text-fg-subtle">+ $0 / month</span> : null}
                  </div>
                  {p.priceMonthlyCents === null && !p.contactSales ? <p className="mt-1 text-xs text-fg-subtle">Price announced at launch</p> : null}
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-lg border border-border bg-bg-elevated p-3 text-center">
                    <div>
                      <div className="font-mono text-sm text-fg">{formatCompact(p.rpmLimit)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">req / min</div>
                    </div>
                    <div>
                      <div className="font-mono text-sm text-fg">{formatCompact(p.tpmLimit)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-fg-subtle">tokens / min</div>
                    </div>
                  </div>
                  <ul className="mt-5 flex flex-1 flex-col gap-2.5">
                    {p.features.map((f) => (
                      <li key={f} className="flex gap-2.5 text-[13px] text-fg-muted">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-accent" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="mt-6" variant={p.highlighted ? "primary" : "secondary"}>
                    {p.contactSales ? <Link href="/contact?topic=sales">Contact sales</Link> : !p.available ? <Link href="/contact?topic=sales">Get notified</Link> : <Link href="/sign-up">Get started</Link>}
                  </Button>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-14 text-center text-sm text-fg-subtle">Plans are loading — please refresh.</p>
        )}
        <p className="mt-6 text-center text-xs text-fg-subtle">Limits shown are defaults per plan and can be raised on request. Subscriptions and invoicing for Pro and Team are on the roadmap; today all plans bill usage from prepaid credits.</p>

        <section className="mt-24 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="Credits" title="How credits work" description="Buy credits in any amount from $5. Every request is metered on the server and deducted from your balance — never estimated in the browser." />
          <div className="grid gap-3 sm:grid-cols-2">
            {[
              ["Top up", "Choose $5, $10, $25, $50, $100 or a custom amount. Payments are processed by Stripe (Razorpay for India where enabled)."],
              ["Metered per token", "Input, output and cached tokens are charged at the model's published rate. Costs are exact to a billionth of a dollar."],
              ["Spend controls", "Organization caps, project budgets and key limits stop spending before it happens."],
              ["Auto-recharge (opt-in)", "Set a threshold and amount; we only charge your saved card when you have explicitly enabled it."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-xl border border-border bg-surface p-5">
                <h3 className="text-sm font-semibold text-fg">{t}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-fg-muted">{d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-24">
          <SectionHeading eyebrow="Model pricing" title="Per-model prices" description="Prices per 1M tokens, including the platform fee. Only verified prices are listed." />
          <div className="panel mt-8 overflow-hidden rounded-xl">
            {priced.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Model</TH>
                    <TH>Input</TH>
                    <TH>Output</TH>
                    <TH>Cached input</TH>
                  </TR>
                </THead>
                <TBody>
                  {priced.map((m) => (
                    <TR key={m.slug}>
                      <TD>
                        <Link href={`/models/${m.slug}`} className="text-fg hover:text-accent">
                          {m.displayName}
                        </Link>
                        {m.isDevOnly ? (
                          <Badge variant="amber" className="ml-2">
                            Dev mock
                          </Badge>
                        ) : null}
                        <div className="font-mono text-[11px] text-fg-subtle">{m.slug}</div>
                      </TD>
                      <TD className="font-mono">{formatPerMillion(m.pricing?.input) ?? "—"}</TD>
                      <TD className="font-mono">{formatPerMillion(m.pricing?.output) ?? "—"}</TD>
                      <TD className="font-mono">{formatPerMillion(m.pricing?.cachedInput) ?? "—"}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="p-8 text-center text-sm text-fg-muted">
                No prices are published yet. Prices appear here once verified. Models can already be used with your own provider keys where supported — see{" "}
                <Link href="/models" className="text-accent hover:underline">
                  the catalog
                </Link>
                .
              </p>
            )}
          </div>
        </section>

        <section className="mt-24 grid gap-10 lg:grid-cols-[0.8fr_1.2fr]">
          <SectionHeading eyebrow="FAQ" title="Billing questions" />
          <dl className="divide-y divide-border rounded-xl border border-border">
            {FAQ.map((f) => (
              <div key={f.q} className="p-5">
                <dt className="text-[15px] font-medium text-fg">{f.q}</dt>
                <dd className="mt-2 text-sm leading-relaxed text-fg-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
