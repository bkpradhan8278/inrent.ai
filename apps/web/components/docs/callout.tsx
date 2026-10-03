import { CircleAlert, Info, Lightbulb, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const STYLES: Record<string, { icon: typeof Info; className: string; label: string }> = {
  note: { icon: Info, className: "border-[rgb(111_168_255/0.3)] bg-[rgb(111_168_255/0.06)] [&_svg]:text-info", label: "Note" },
  tip: { icon: Lightbulb, className: "border-[rgb(92_235_192/0.3)] bg-accent-soft [&_svg]:text-accent", label: "Tip" },
  important: { icon: CircleAlert, className: "border-[rgb(142_150_255/0.3)] bg-iris-soft [&_svg]:text-iris", label: "Important" },
  warning: { icon: TriangleAlert, className: "border-[rgb(245_180_85/0.3)] bg-amber-soft [&_svg]:text-amber", label: "Warning" },
  caution: { icon: TriangleAlert, className: "border-[rgb(255_107_107/0.3)] bg-danger-soft [&_svg]:text-danger", label: "Caution" },
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
