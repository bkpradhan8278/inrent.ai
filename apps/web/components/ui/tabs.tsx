"use client";

import { Tabs as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = Primitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Primitive.List>) {
  return <Primitive.List className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elevated p-1 light:bg-surface-2", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-fg-subtle transition-colors hover:text-fg data-[state=active]:bg-surface-3 data-[state=active]:text-fg data-[state=active]:shadow-[0_1px_0_color-mix(in_oklab,var(--color-ink)_6%,transparent)_inset] light:data-[state=active]:bg-surface light:data-[state=active]:shadow-[0_1px_2px_color-mix(in_oklab,var(--color-ink)_10%,transparent),0_0_0_1px_var(--color-border)]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
