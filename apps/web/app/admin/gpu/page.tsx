import { Cpu } from "lucide-react";
import type { Metadata } from "next";
import { prisma } from "@inrent/db";
import { EmptyState, PageHeader, Section } from "@/components/dashboard/ui";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatDate, formatNumber } from "@/lib/format";
import { requireAdmin } from "@/lib/session";

export const metadata: Metadata = { title: "GPU & waitlist" };

export default async function AdminGpu() {
  const admin = await requireAdmin("gpu:read");
  const canWaitlist = admin.can("waitlist:read");
  const [providers, byProduct, byGpu, entries] = await Promise.all([
    prisma.gpuProvider.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { offers: true, instances: true } } } }),
    canWaitlist ? prisma.waitlistEntry.groupBy({ by: ["product"], _count: true }) : [],
    canWaitlist ? prisma.waitlistEntry.groupBy({ by: ["gpuType"], _count: true, _sum: { expectedHours: true }, where: { product: "GPU_CLOUD" }, orderBy: { _count: { gpuType: "desc" } } }) : [],
    canWaitlist ? prisma.waitlistEntry.findMany({ orderBy: { createdAt: "desc" }, take: 50 }) : [],
  ]);
  return (
    <>
      <PageHeader title="GPU Cloud & waitlist" badge={<Badge variant="amber">Not launched</Badge>} description="GPU Cloud is on the roadmap. Provider adapters exist behind the GPUProvider interface but no real capacity is offered or shown to customers until contracts and adapters are live." />
      <Section title="GPU providers" contentClassName={providers.length ? "p-0" : undefined}>
        {providers.length ? (
          <Table>
            <THead>
              <TR>
                <TH>Provider</TH>
                <TH>Adapter</TH>
                <TH>Credential</TH>
                <TH>Offers</TH>
                <TH>Instances</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {providers.map((p) => (
                <TR key={p.id}>
                  <TD className="text-fg">{p.name}</TD>
                  <TD className="font-mono text-[12px]">{p.adapter.toLowerCase()}</TD>
                  <TD className="font-mono text-[12px]">{p.credentialRef ?? "—"}</TD>
                  <TD className="tabular-nums">{p._count.offers}</TD>
                  <TD className="tabular-nums">{p._count.instances}</TD>
                  <TD>{p.enabled ? <Badge variant="accent">enabled</Badge> : <Badge>disabled</Badge>}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        ) : (
          <EmptyState icon={Cpu} title="No GPU providers configured" description="Add providers once agreements are in place. Real adapters (RunPod, Lambda, Vast.ai, CoreWeave, etc.) throw GpuCloudNotAvailableError until implemented." className="border-0 py-6" />
        )}
      </Section>
      {canWaitlist ? (
        <>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <Section title="Waitlist by product">
              <ul className="grid gap-2 text-sm">
                {byProduct.length ? (
                  byProduct.map((b) => (
                    <li key={b.product} className="flex justify-between">
                      <span className="text-fg-muted">{b.product.toLowerCase().replace("_", " ")}</span>
                      <span className="font-mono text-fg">{formatNumber(b._count)}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-fg-subtle">No sign-ups yet.</li>
                )}
              </ul>
            </Section>
            <Section title="GPU demand signal" description="Requested GPU type and expected monthly hours">
              <ul className="grid gap-2 text-sm">
                {byGpu.length ? (
                  byGpu.map((g) => (
                    <li key={g.gpuType ?? "none"} className="flex justify-between gap-3">
                      <span className="text-fg-muted">{g.gpuType ?? "Not sure"}</span>
                      <span className="font-mono text-fg">
                        {formatNumber(g._count)} · {formatNumber(g._sum.expectedHours ?? 0)} h
                      </span>
                    </li>
                  ))
                ) : (
                  <li className="text-fg-subtle">No GPU sign-ups yet.</li>
                )}
              </ul>
            </Section>
          </div>
          <Section title="Recent sign-ups" className="mt-6" contentClassName={entries.length ? "p-0" : undefined}>
            {entries.length ? (
              <Table>
                <THead>
                  <TR>
                    <TH>Email</TH>
                    <TH>Product</TH>
                    <TH>Company</TH>
                    <TH>GPU</TH>
                    <TH>Use case</TH>
                    <TH>Date</TH>
                  </TR>
                </THead>
                <TBody>
                  {entries.map((e) => (
                    <TR key={e.id}>
                      <TD className="text-fg">{e.email}</TD>
                      <TD className="text-[12px]">{e.product.toLowerCase().replace("_", " ")}</TD>
                      <TD className="text-[12.5px]">{e.company ?? "—"}</TD>
                      <TD className="text-[12.5px]">{e.gpuType ?? "—"}</TD>
                      <TD className="max-w-64 truncate text-[12.5px]" title={e.useCase ?? undefined}>
                        {e.useCase ?? "—"}
                      </TD>
                      <TD className="whitespace-nowrap text-[12px]">{formatDate(e.createdAt)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            ) : (
              <p className="text-sm text-fg-subtle">No sign-ups yet.</p>
            )}
          </Section>
        </>
      ) : null}
    </>
  );
}
