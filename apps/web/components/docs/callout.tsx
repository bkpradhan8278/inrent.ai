import { CircleAlert, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES: Record<string, { icon: typeof Info; className: string; label: string }> = {
  note: { icon: Info, className: "border-info/30 bg-info/[.06] [&_svg]:text-info", label: "Note" },
  tip: { icon: Lightbulb, className: "border-accent/30 bg-accent-soft [&_svg]:text-accent", label: "Tip" },
  important: { icon: CircleAlert, className: "border-iris/30 bg-iris-soft [&_svg]:text-iris", label: "Important" },
  warning: { icon: TriangleAlert, className: "border-amber/30 bg-amber-soft [&_svg]:text-amber", label: "Warning" },
  caution: { icon: TriangleAlert, className: "border-danger/30 bg-danger-soft [&_svg]:text-danger", label: "Caution" },
};

export function Callout({ kind = "note", children }: { kind?: string; children: React.ReactNode }) {
  const style = STYLES[kind] ?? STYLES.note!;
  const Icon = style.icon;
  return (
    <div role="note" className={cn("my-5 flex gap-3 rounded-lg border px-4 py-3 text-[14px] [&_p]:my-1", style.className)}>
      <Icon className="mt-1 size-4 shrink-0" aria-label={style.label} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
