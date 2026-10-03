import * as React from "react";
import { cn } from "@/lib/utils";

export function Separator({ className, vertical = false }: { className?: string; vertical?: boolean }) {
  return <div role="separator" aria-orientation={vertical ? "vertical" : "horizontal"} className={cn(vertical ? "h-full w-px" : "h-px w-full", "bg-border", className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-md bg-surface-2", className)} aria-hidden />;
}

export function Kbd({ className, ...props }: React.HTMLAttributes<HTMLElement>) {
  return (
    <kbd
      className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-surface-2 px-1 font-mono text-[10px] text-fg-muted", className)}
      {...props}
    />
  );
}

export function Eyebrow({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-accent", className)}>
      <span className="h-px w-6 bg-gradient-to-r from-transparent to-accent" aria-hidden />
      {children}
    </div>
  );
}

export function SectionHeading({ eyebrow, title, description, align = "left", className }: { eyebrow?: string; title: React.ReactNode; description?: React.ReactNode; align?: "left" | "center"; className?: string }) {
  return (
    <div className={cn("flex max-w-2xl flex-col gap-4", align === "center" && "mx-auto items-center text-center", className)}>
      {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
      <h2 className="text-display text-3xl text-fg sm:text-[2.6rem]">{title}</h2>
      {description ? <p className="text-[15px] leading-relaxed text-fg-muted sm:text-base">{description}</p> : null}
    </div>
  );
}
