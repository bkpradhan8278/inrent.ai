import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { CAPABILITIES } from "@inrent/core/catalog";
import type { PublicModel } from "@inrent/services";
import { BRAND_TINT, VendorMark } from "@/components/brand/icons";
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
  const tint = BRAND_TINT[model.vendor] ?? "142 150 255";
  return (
    <Link
      href={`/models/${model.slug}`}
      className={cn(
        "lift group relative flex h-full flex-col gap-4 overflow-hidden rounded-[18px] border border-white/[.08] bg-[linear-gradient(180deg,#10141b,#0b0d12)] p-5",
        className,
      )}
    >
      <div className="glow pointer-events-none absolute -right-16 -top-20 size-52 rounded-full opacity-25" style={{ background: `radial-gradient(closest-side, rgb(${tint} / .45), transparent)` }} aria-hidden />
      <div className="relative flex items-start gap-3">
        <VendorMark vendor={model.vendor} className="ico size-[46px] rounded-xl" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h3 className="truncate font-display text-[17px] font-semibold tracking-[-0.02em] text-fg">{model.displayName}</h3>
            <ArrowUpRight className="size-3.5 shrink-0 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
          </div>
          <div className="truncate font-mono text-[11.5px] text-fg-subtle">{model.slug}</div>
        </div>
      </div>
      <p className="relative line-clamp-2 text-[13.5px] leading-relaxed text-fg-muted">{model.description}</p>
      <div className="relative flex flex-wrap gap-1.5">
        {caps.map((c) => (
          <Badge key={c} variant="neutral">
            {CAPABILITIES[c as keyof typeof CAPABILITIES] ?? c}
          </Badge>
        ))}
        {model.openWeights ? <Badge variant="outline">Open weights</Badge> : null}
      </div>
      <div className="relative mt-auto flex flex-col gap-3 border-t border-white/[.06] pt-3 text-[12px]">
        <PriceLine pricing={model.pricing} />
        <div className="flex items-center justify-between gap-2">
          <AvailabilityBadge availability={model.availability} devOnly={model.isDevOnly} />
          {ctx ? <span className="font-mono text-fg-subtle">{ctx} context</span> : null}
        </div>
      </div>
    </Link>
  );
}
