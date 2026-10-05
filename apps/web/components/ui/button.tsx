import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary:
          "bg-accent text-accent-fg shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_40%,transparent),0_8px_24px_-10px_color-mix(in_oklab,var(--color-accent)_60%,transparent)] hover:bg-[#7ef5d2] hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-accent)_60%,transparent),0_10px_30px_-10px_color-mix(in_oklab,var(--color-accent)_75%,transparent)] light:shadow-[0_1px_2px_color-mix(in_oklab,var(--color-accent)_30%,transparent),0_6px_16px_-8px_color-mix(in_oklab,var(--color-accent)_45%,transparent)] light:hover:bg-accent-strong light:hover:shadow-[0_1px_2px_color-mix(in_oklab,var(--color-accent)_35%,transparent),0_8px_20px_-8px_color-mix(in_oklab,var(--color-accent)_55%,transparent)]",
        secondary: "border border-border-strong bg-surface-2 text-fg hover:border-ink/20 hover:bg-surface-3",
        outline: "border border-border-strong bg-transparent text-fg hover:bg-surface-2",
        ghost: "text-fg-muted hover:bg-surface-2 hover:text-fg",
        danger: "border border-danger/35 bg-danger-soft text-danger hover:bg-danger/18",
        link: "h-auto p-0 text-accent underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-9 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "size-9",
        "icon-sm": "size-8",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
