import { cn } from "@/lib/utils";

/** Abstract GPU node field — slow, deterministic pulses. Purely decorative; no availability implied. */
export function GpuGrid({ className }: { className?: string }) {
  const cells = Array.from({ length: 24 }, (_, i) => i);
  return (
    <div className={cn("relative grid grid-cols-6 gap-2.5", className)} aria-hidden>
      {cells.map((i) => {
        const lit = [2, 7, 9, 14, 16, 21].includes(i);
        return (
          <div
            key={i}
            className={cn(
              "relative aspect-square rounded-md border bg-gradient-to-b from-surface-2 to-bg-elevated",
              lit ? "border-amber/35" : "border-border",
            )}
          >
            <div className="absolute inset-[22%] rounded-[3px] border border-ink/[.06] bg-[repeating-linear-gradient(90deg,color-mix(in_oklab,var(--color-ink)_5%,transparent)_0_1px,transparent_1px_4px)]" />
            {lit ? <div className="absolute inset-0 animate-pulse-soft rounded-md bg-[radial-gradient(circle_at_50%_50%,color-mix(in_oklab,var(--color-amber)_22%,transparent),transparent_70%)]" style={{ animationDelay: `${(i % 5) * 0.6}s` }} /> : null}
          </div>
        );
      })}
    </div>
  );
}
