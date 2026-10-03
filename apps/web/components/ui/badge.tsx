import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4 [&_svg]:size-3",
  {
    variants: {
      variant: {
        neutral: "border-border-strong bg-surface-2 text-fg-muted",
        accent: "border-[rgb(92_235_192/0.3)] bg-accent-soft text-accent",
        iris: "border-[rgb(142_150_255/0.3)] bg-iris-soft text-iris",
        amber: "border-[rgb(245_180_85/0.3)] bg-amber-soft text-amber",
        success: "border-[rgb(74_222_156/0.3)] bg-success-soft text-success",
        danger: "border-[rgb(255_107_107/0.3)] bg-danger-soft text-danger",
        outline: "border-border-strong text-fg-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
