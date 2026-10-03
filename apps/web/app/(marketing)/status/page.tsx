import type { Metadata } from "next";
import { PageHero } from "@/components/marketing/page-hero";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";
import { loadStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Status", description: "Current status of the INRENT API, gateway, model providers, billing and dashboard.", alternates: { canonical: "/status" } };

const LABEL: Record<string, { text: string; className: string; dot: string }> = {
  operational: { text: "Operational", className: "text-success", dot: "bg-success" },
  degraded: { text: "Degraded", className: "text-amber", dot: "bg-amber" },
  partial_outage: { text: "Partial outage", className: "text-amber", dot: "bg-amber" },
  major_outage: { text: "Major outage", className: "text-danger", dot: "bg-danger" },
  unknown: { text: "No data", className: "text-fg-subtle", dot: "bg-fg-subtle" },
  preview: { text: "Preview", className: "text-iris", dot: "bg-iris" },
  not_launched: { text: "Not launched", className: "text-fg-subtle", dot: "bg-fg-subtle" },
};

export default async function StatusPage() {
  const status = await loadStatus();
  const core = status.components.filter((c) => !["preview", "not_launched"].includes(c.status));
  const worst = core.some((c) => c.status === "major_outage") ? "major_outage" : core.some((c) => c.status === "partial_outage") ? "partial_outage" : core.some((c) => c.status === "degraded") ? "degraded" : core.some((c) => c.status === "unknown") ? "unknown" : "operational";
  const headline = { operational: "All systems operational", degraded: "Some systems degraded", partial_outage: "Partial outage", major_outage: "Major outage", unknown: "Some components have no recent data" }[worst];
  return (
    <>
      <PageHero eyebrow="Status" title={headline} description="Statuses are derived from live health checks and published incidents. When a component has no recent signal we say so rather than assume it is up.">
        <p className="font-mono text-xs text-fg-subtle">Updated {formatDateTime(status.generatedAt)}</p>
      </PageHero>
      <section className="container-page py-14">
        <ul className="panel divide-y divide-border overflow-hidden rounded-xl">
          {status.components.map((c) => {
            const l = LABEL[c.status] ?? LABEL.unknown!;
            return (
              <li key={c.id} className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-fg">{c.name}</div>
                  <div className="text-sm text-fg-subtle">{c.detail}</div>
                </div>
                <span className={cn("inline-flex items-center gap-2 text-sm", l.className)}>
                  <span className={cn("size-2 rounded-full", l.dot)} />
                  {l.text}
                </span>
              </li>
            );
          })}
        </ul>
        <h2 className="mt-14 text-lg font-semibold text-fg">Incidents (last 14 days)</h2>
        {status.incidents.length ? (
          <ul className="mt-4 flex flex-col gap-3">
            {status.incidents.map((i) => (
              <li key={i.id} className="panel rounded-xl p-5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-fg">{i.title}</span>
                  <Badge variant={i.resolvedAt ? "success" : "amber"}>{i.status.toLowerCase()}</Badge>
                  <span className="font-mono text-xs text-fg-subtle">{formatDateTime(i.startedAt)}</span>
                </div>
                <p className="mt-2 text-sm text-fg-muted">{i.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-fg-muted">No incidents reported in the last 14 days.</p>
        )}
        <p className="mt-10 text-xs text-fg-subtle">A public status site (status.inrent.ai) with history and subscriptions is planned.</p>
      </section>
    </>
  );
}
