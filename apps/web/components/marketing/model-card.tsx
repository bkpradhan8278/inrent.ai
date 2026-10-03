import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CAPABILITIES } from "@inrent/core";
import type { PublicModel } from "@inrent/services";
import { VendorMark } from "@/components/brand/icons";
import { Badge } from "@/components/ui/badge";
import { formatContext, formatPerMillion } from "@/lib/format";
import { cn } from "@/lib/utils";

export function AvailabilityBadge({ availability, devOnly }: { availability: PublicModel["availability"]; devOnly?: boolean }) {
  if (devOnly) return <Badge variant="amber">Dev mock</Badge>;
  if (availability === "platform")
    return (
      <Badge variant="accent">
        <span className="size-1.5 rounded-full bg-accent" /> Available
      </Badge>
    );
  if (availability === "byok") return <Badge variant="iris">Bring your own key</Badge>;
  return <Badge variant="outline">Not yet enabled</Badge>;
}

export function PriceLine({ pricing }: { pricing: PublicModel["pricing"] }) {
  if (!pricing || (pricing.input === null && pricing.output === null)) {
    return <span className="text-fg-subtle">Pricing published once verified</span>;
  }
  return (
    <span className="font-mono text-fg-muted">
      <span className="text-fg">{formatPerMillion(pricing.input) ?? "—"}</span> in · <span className="text-fg">{formatPerMillion(pricing.output) ?? "—"}</span> out
      <span className="text-fg-subtle"> /1M</span>
    </span>
  );
}

export function ModelCard({ model, className }: { model: PublicModel; className?: string }) {
  const caps = model.capabilities.filter((c) => c !== "chat" && c !== "streaming").slice(0, 4);
  const ctx = formatContext(model.contextLength);
  return (
    <Link
      href={`/models/${model.slug}`}
      className={cn(
        "panel group relative flex h-full flex-col gap-4 rounded-xl p-5 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-[0_20px_50px_-24px_rgb(92_235_192/0.35)]",
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <VendorMark vendor={model.vendor} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate text-[15px] font-semibold text-fg">{model.displayName}</h3>
            <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="truncate font-mono text-[11.5px] text-fg-subtle">{model.slug}</div>
        </div>
      </div>
      <p className="line-clamp-2 text-[13.5px] leading-relaxed text-fg-muted">{model.description}</p>
      <div className="flex flex-wrap gap-1.5">
        {caps.map((c) => (
          <Badge key={c} variant="neutral">
            {CAPABILITIES[c as keyof typeof CAPABILITIES] ?? c}
          </Badge>
        ))}
        {model.openWeights ? <Badge variant="outline">Open weights</Badge> : null}
      </div>
      <div className="mt-auto flex flex-col gap-3 border-t border-border pt-3 text-[12px]">
        <PriceLine pricing={model.pricing} />
        <div className="flex items-center justify-between gap-2">
          <AvailabilityBadge availability={model.availability} devOnly={model.isDevOnly} />
          {ctx ? <span className="font-mono text-fg-subtle">{ctx} context</span> : null}
        </div>
      </div>
    </Link>
  );
}
