import Link from "next/link";
import { cn } from "@/lib/utils";

/** Server-rendered segmented control that sets `?days=` while keeping other params. */
export function RangeTabs({ days, basePath, params = {}, options = [7, 30, 90] }: { days: number; basePath: string; params?: Record<string, string | undefined>; options?: number[] }) {
  return (
    <div role="tablist" aria-label="Time range" className="inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5">
      {options.map((d) => {
        const q = new URLSearchParams(Object.entries({ ...params, days: String(d) }).filter((e): e is [string, string] => Boolean(e[1])));
        return (
          <Link
            key={d}
            role="tab"
            aria-selected={d === days}
            href={`${basePath}?${q.toString()}`}
            scroll={false}
            className={cn("rounded px-2.5 py-1 text-[12px] font-medium transition-colors", d === days ? "bg-surface-3 text-fg" : "text-fg-subtle hover:text-fg-muted")}
          >
            {d}d
          </Link>
        );
      })}
    </div>
  );
}
