import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, badge, className }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; badge?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-[1.6rem] font-semibold tracking-tight text-fg">{title}</h1>
          {badge}
        </div>
        {description ? <p className="mt-1 max-w-2xl text-sm text-fg-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({ label, value, hint, icon: Icon, tone = "default", className }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "default" | "accent" | "danger" | "amber"; className?: string }) {
  return (
    <div className={cn("panel hairline-top relative overflow-hidden rounded-xl p-4", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12px] font-medium text-fg-subtle">{label}</span>
        {Icon ? <Icon className={cn("size-4", tone === "accent" ? "text-accent" : tone === "danger" ? "text-danger" : tone === "amber" ? "text-amber" : "text-fg-subtle")} /> : null}
      </div>
      <div className="mt-2 truncate font-display text-[1.55rem] font-semibold tabular-nums tracking-tight text-fg">{value}</div>
      {hint ? <div className="mt-1 truncate text-[12px] text-fg-subtle">{hint}</div> : null}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action, className }: { icon?: LucideIcon; title: string; description?: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-xl border border-dashed border-border-strong px-6 py-12 text-center", className)}>
      {Icon ? (
        <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-surface-2">
          <Icon className="size-5 text-fg-muted" />
        </div>
      ) : null}
      <div className="text-[15px] font-medium text-fg">{title}</div>
      {description ? <p className="mt-1 max-w-md text-sm text-fg-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function DemoDataBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <Tooltip content="This workspace contains generated sample traffic so the dashboard is explorable. It is not real usage.">
      <Badge variant="amber">Demo data</Badge>
    </Tooltip>
  );
}

export function Section({ title, description, actions, children, className, contentClassName }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; contentClassName?: string }) {
  return (
    <section className={cn("panel rounded-xl", className)}>
      <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-fg">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-fg-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}

export function StatusPill({ status }: { status: string }) {
  const s = status.toUpperCase();
  const variant = s === "SUCCESS" || s === "SUCCEEDED" || s === "ACTIVE" || s === "PAID" || s === "HEALTHY" || s === "RESOLVED" ? "success" : s === "ERROR" || s === "FAILED" || s === "REVOKED" || s === "DOWN" ? "danger" : s === "PENDING" || s === "DEGRADED" || s === "OPEN" ? "amber" : "neutral";
  return <Badge variant={variant}>{status.toLowerCase().replace(/_/g, " ")}</Badge>;
}

export function DenyNotice({ permission }: { permission?: string }) {
  if (!permission) return null;
  return (
    <div role="alert" className="mb-6 rounded-lg border border-amber/30 bg-amber-soft px-4 py-3 text-sm text-amber">
      Your role doesn&apos;t include <code className="font-mono">{permission}</code>. Ask an organization owner or admin for access.
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-accent underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}
