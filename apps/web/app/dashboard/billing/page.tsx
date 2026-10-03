import { CheckCircle2, Receipt, XCircle } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { currentPeriod } from "@inrent/services";
import { configuredPaymentProviders, CREDIT_PRESETS_USD } from "@inrent/services/payments";
import { ExportMenu } from "@/components/dashboard/export-menu";
import { EmptyState, PageHeader, Section, StatusPill } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { usd } from "@/lib/dashboard";
import { formatDate, formatDateTime } from "@/lib/format";
import { requireOrgPermission } from "@/lib/session";
import { BuyCredits, SpendControlsForm } from "./billing-client";

export const metadata: Metadata = { title: "Billing" };

const TX_LABEL: Record<string, string> = { PURCHASE: "Purchase", USAGE: "Usage", REFUND: "Refund", ADJUSTMENT: "Adjustment", PROMO: "Promotional", AUTO_RECHARGE: "Auto-recharge" };

export default async function BillingPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const { payment } = await searchParams;
  const ws = await requireOrgPermission("billing:read");
  const org = ws.org;
  const [txns, payments, invoices, monthSpend, usageToday] = await Promise.all([
    prisma.creditTransaction.findMany({ where: { organizationId: org.id, type: { not: "USAGE" } }, orderBy: { createdAt: "desc" }, take: 25 }),
    prisma.payment.findMany({ where: { organizationId: org.id, NOT: { providerPaymentId: { startsWith: "pending:" } } }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.invoice.findMany({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" }, take: 24 }),
    prisma.spendCounter.findFirst({ where: { scope: "org", scopeId: org.id, period: currentPeriod() } }),
    prisma.creditTransaction.aggregate({ where: { organizationId: org.id, type: "USAGE", createdAt: { gte: new Date(new Date().setUTCHours(0, 0, 0, 0)) } }, _sum: { amountNano: true } }),
  ]);
  const balance = org.creditBalance?.balanceNano ?? 0n;
  const providers = configuredPaymentProviders();
  const canManage = ws.can("billing:manage");

  return (
    <>
      <PageHeader title="Billing" description="Prepaid credits in USD. Usage is charged per request at the listed model price; nothing is billed after the fact." actions={<ExportMenu kinds={[{ kind: "billing", label: "Credit ledger" }, { kind: "invoices", label: "Invoices" }]} />} />

      {payment === "success" ? (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-[rgb(74_222_156/0.3)] bg-success-soft p-4 text-sm">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
          <div>
            <div className="font-medium text-fg">Payment received</div>
            <p className="text-fg-muted">Credits are added as soon as the payment provider confirms the charge — usually within a few seconds. Refresh if the balance hasn&apos;t updated yet.</p>
          </div>
        </div>
      ) : payment === "cancelled" ? (
        <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-border-strong bg-surface p-4 text-sm">
          <XCircle className="mt-0.5 size-4 shrink-0 text-fg-subtle" />
          <p className="text-fg-muted">Checkout was cancelled. You were not charged.</p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <section className="panel hairline-top relative overflow-hidden rounded-xl p-6">
          <div className="pointer-events-none absolute -right-10 -top-16 size-48 rounded-full bg-accent/10 blur-3xl" aria-hidden />
          <div className="text-[13px] text-fg-subtle">Credit balance</div>
          <div className={`mt-2 font-display text-4xl font-semibold tabular-nums tracking-tight ${balance <= 0n ? "text-danger" : "text-fg"}`}>${usd(balance)}</div>
          <dl className="mt-5 grid grid-cols-2 gap-4 text-[13px]">
            <div>
              <dt className="text-fg-subtle">This month</dt>
              <dd className="mt-0.5 font-mono text-fg">${usd(monthSpend?.spentNano ?? 0n)}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Today</dt>
              <dd className="mt-0.5 font-mono text-fg">${usd(-(usageToday._sum.amountNano ?? 0n))}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Plan</dt>
              <dd className="mt-0.5 text-fg">{org.plan?.name ?? "Free"}</dd>
            </div>
            <div>
              <dt className="text-fg-subtle">Auto-recharge</dt>
              <dd className="mt-0.5 text-fg">{org.autoRechargeEnabled ? <Badge variant="accent">On</Badge> : <Badge>Off</Badge>}</dd>
            </div>
          </dl>
          {org.isDemo ? <p className="mt-4 text-xs text-amber">Demo workspace: the starting balance is promotional demo credit.</p> : null}
        </section>

        <Section title="Add credits" description="Choose an amount. You'll be redirected to a secure checkout." className="xl:col-span-2">
          {canManage ? <BuyCredits presets={[...CREDIT_PRESETS_USD]} providers={providers} /> : <p className="text-sm text-fg-muted">Only owners, admins and billing members can add credits.</p>}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Spend controls" description="Caps, alerts and automatic top-ups.">
          <SpendControlsForm
            disabled={!canManage}
            autoRechargeAvailable={providers.includes("STRIPE")}
            initial={{
              monthlyCapUsd: org.monthlySpendCapNano !== null ? usd(org.monthlySpendCapNano) : "",
              lowBalanceUsd: org.lowBalanceThresholdNano !== null ? usd(org.lowBalanceThresholdNano) : "",
              autoRecharge: org.autoRechargeEnabled,
              thresholdUsd: org.autoRechargeThresholdNano !== null ? usd(org.autoRechargeThresholdNano) : "5.00",
              amountUsd: org.autoRechargeAmountNano !== null ? usd(org.autoRechargeAmountNano) : "25.00",
            }}
          />
        </Section>
        <Section title="Credit activity" description="Purchases, refunds, promotions and adjustments. Per-request usage is in Logs." contentClassName="p-0">
          {txns.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Type</TH>
                  <TH>Description</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {txns.map((t) => (
                  <TR key={t.id}>
                    <TD className="whitespace-nowrap text-[12.5px]" title={formatDateTime(t.createdAt)}>
                      {formatDate(t.createdAt)}
                    </TD>
                    <TD>
                      <Badge variant={t.amountNano >= 0n ? "accent" : "neutral"}>{TX_LABEL[t.type] ?? t.type}</Badge>
                    </TD>
                    <TD className="max-w-64 truncate text-[12.5px]">{t.description}</TD>
                    <TD className={`text-right font-mono tabular-nums ${t.amountNano >= 0n ? "text-accent" : "text-fg"}`}>
                      {t.amountNano >= 0n ? "+" : "−"}${usd(t.amountNano < 0n ? -t.amountNano : t.amountNano)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">No credit activity yet.</p>
          )}
        </Section>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="Payments" contentClassName="p-0">
          {payments.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Provider</TH>
                  <TH className="text-right">Charged</TH>
                  <TH className="text-right">Credits</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD className="whitespace-nowrap text-[12.5px]">{formatDate(p.createdAt)}</TD>
                    <TD className="text-[12.5px]">
                      {p.provider === "STRIPE" ? "Stripe" : "Razorpay"}
                      {p.isAutoRecharge ? <Badge variant="outline" className="ml-1.5">auto</Badge> : null}
                    </TD>
                    <TD className="text-right font-mono tabular-nums">
                      {(p.amountCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })} {p.currency.toUpperCase()}
                    </TD>
                    <TD className="text-right font-mono tabular-nums text-fg">${usd(p.creditsNano)}</TD>
                    <TD title={p.failureReason ?? undefined}>
                      <StatusPill status={p.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <p className="px-5 py-8 text-center text-sm text-fg-subtle">No payments yet.</p>
          )}
        </Section>
        <Section title="Invoices" contentClassName={invoices.length ? "p-0" : undefined}>
          {invoices.length ? (
            <Table>
              <THead>
                <TR>
                  <TH>Number</TH>
                  <TH>Period</TH>
                  <TH className="text-right">Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {invoices.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-mono text-[12.5px] text-fg">{i.externalUrl ? <a href={i.externalUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">{i.number}</a> : i.number}</TD>
                    <TD className="whitespace-nowrap text-[12.5px]">
                      {formatDate(i.periodStart)} – {formatDate(i.periodEnd)}
                    </TD>
                    <TD className="text-right font-mono tabular-nums">
                      {(i.amountCents / 100).toFixed(2)} {i.currency.toUpperCase()}
                    </TD>
                    <TD>
                      <StatusPill status={i.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          ) : (
            <EmptyState icon={Receipt} title="No invoices yet" description="Payment receipts are emailed by the payment provider. Monthly invoices for enterprise contracts appear here." className="border-0 py-6" />
          )}
        </Section>
      </div>
    </>
  );
}
