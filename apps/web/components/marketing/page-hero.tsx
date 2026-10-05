import { Eyebrow } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

export function PageHero({ eyebrow, title, description, children, className, tone = "accent" }: { eyebrow: string; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode; className?: string; tone?: "accent" | "amber" }) {
  return (
    <section className={cn("relative overflow-hidden border-b border-border", className)}>
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <div
        className={cn(
          "pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full",
          tone === "amber" ? "bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-amber)_12%,transparent),transparent)]" : "bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-accent)_10%,transparent),transparent)]",
        )}
        aria-hidden
      />
      <div className="container-page relative flex flex-col gap-5 py-20 sm:py-24">
        <Eyebrow className={tone === "amber" ? "text-amber [&>span]:to-amber" : undefined}>{eyebrow}</Eyebrow>
        <h1 className="text-display max-w-3xl text-4xl text-fg sm:text-6xl">{title}</h1>
        {description ? <p className="max-w-2xl text-[16px] leading-relaxed text-fg-muted">{description}</p> : null}
        {children}
      </div>
    </section>
  );
}
