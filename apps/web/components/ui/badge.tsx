import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border-strong bg-surface-2 text-fg-muted",
        accent: "border-accent/30 bg-accent-soft text-accent",
        iris: "border-iris/30 bg-iris-soft text-iris",
        amber: "border-amber/30 bg-amber-soft text-amber",
        success: "border-success/30 bg-success-soft text-success",
        danger: "border-danger/30 bg-danger-soft text-danger",
        outline: "border-border-strong text-fg-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
