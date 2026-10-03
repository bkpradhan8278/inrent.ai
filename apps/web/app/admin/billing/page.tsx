import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { configuredPaymentProviders } from "@inrent/services/payments";
import { PageHeader, Section, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usd } from "@/lib/dashboard";
import { formatDateTime } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "Billing" };

export default async function AdminBilling() {
  await requireAdmin("billing:read");
  const [payments, adjustments, events, liability] = await Promise.all([
    prisma.payment.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { organization: { select: { name: true } } } }),
    prisma.creditTransaction.findMany({ where: { type: { in: ["ADJUSTMENT", "REFUND", "PROMO"] } }, orderBy: { createdAt: "desc" }, take: 30, include: { organization: { select: { name: true } } } }),
    prisma.paymentEvent.findMany({ orderBy: { processedAt: "desc" }, take: 20 }),
    prisma.creditBalance.aggregate({ _sum: { balanceNano: true } }),
  ]);
  const providers = configuredPaymentProviders();
  return (
    <>
      <PageHeader
        title="Billing operations"
        description="Payments, webhook events and manual ledger entries. To refund a card payment, issue it in the payment provider and record a matching REFUND or negative ADJUSTMENT on the organization."
        badge={providers.length ? <Badge variant="success">{providers.join(" · ")}</Badge> : <Badge variant="amber">No payment provider configured</Badge>}
      />
      <div className="mb-6 panel rounded-xl p-5">
        <div className="text-[13px] text-fg-subtle">Outstanding prepaid credit (all organizations)</div>
        <div className="mt-1 font-display text-3xl font-semibold text-fg">${usd(liability._sum.balanceNano ?? 0n)}</div>
        <p className="mt-1 text-[12.5px] text-fg-muted">Customer credit liability, including promotional and demo credit.</p>
      </div>
      <Section title="Payments" contentClassName="p-0">
        {payments.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Time</TH>
                <TH>Organization</TH>
                <TH>Provider</TH>
                <TH className="text-right">Charged</TH>
                <TH className="text-right">Credits</TH>
                <TH>Status</TH>
                <TH>Reference</TH>
              </TR>
            </THead>
            <TBody>
              {payments.map((p) => (
                <TR key={p.id}>
                  <TD className="whitespace-nowrap text-[12px]">{formatDateTime(p.createdAt)}</TD>
                  <TD className="max-w-40 truncate">{p.organization.name}</TD>
                  <TD className="text-[12.5px]">
                    {p.provider.toLowerCase()}
                    {p.isAutoRecharge ? <Badge variant="outline" className="ml-1.5">auto</Badge> : null}
                  </TD>
                  <TD className="text-right font-mono tabular-nums">
                    {(p.amountCents / 100).toFixed(2)} {p.currency.toUpperCase()}
                  </TD>
                  <TD className="text-right font-mono tabular-nums text-fg">${usd(p.creditsNano)}</TD>
                  <TD title={p.failureReason ?? undefined}>
                    <StatusPill status={p.status} />
                  </TD>
                  <TD className="max-w-44 truncate font-mono text-[11px] text-fg-subtle">{p.providerPaymentId}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <p className="px-5 py-6 text-sm text-fg-subtle">No payments yet.</p>
        )}
      </Section>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Manual ledger entries" contentClassName="p-0">
          {adjustments.length ? (
            <ul className="divide-y divide-border">
              {adjustments.map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-[12.5px]">
                  <Badge variant={t.amountNano >= 0n ? "accent" : "danger"}>{t.type.toLowerCase()}</Badge>
                  <span className="text-fg">{t.organization.name}</span>
                  <span className="min-w-0 flex-1 truncate text-fg-subtle">{t.description}</span>
                  <span className="font-mono text-fg">
                    {t.amountNano >= 0n ? "+" : "−"}${usd(t.amountNano < 0n ? -t.amountNano : t.amountNano)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-fg-subtle">No manual entries.</p>
          )}
        </Section>
        <Section title="Payment webhook events" description="Deduplicated by provider event ID" contentClassName="p-0">
          {events.length ? (
            <ul className="divide-y divide-border">
              {events.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-x-3 px-5 py-2.5 text-[12.5px]">
                  <span className="font-mono text-fg">{e.type}</span>
                  <span className="text-fg-subtle">{e.provider.toLowerCase()}</span>
                  <span className="ml-auto text-fg-subtle">{formatDateTime(e.processedAt)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-6 text-sm text-fg-subtle">No webhook events received.</p>
          )}
        </Section>
      </div>
    </>
  );
}
