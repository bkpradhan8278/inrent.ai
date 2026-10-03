"use client";

import { Tabs as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export const Tabs = Primitive.Root;

export function TabsList({ className, ...props }: React.ComponentProps<typeof Primitive.List>) {
  return <Primitive.List className={cn("inline-flex items-center gap-1 rounded-lg border border-border bg-bg-elevated p-1", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof Primitive.Trigger>) {
  return (
    <Primitive.Trigger
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium text-fg-subtle transition-colors hover:text-fg data-[state=active]:bg-surface-3 data-[state=active]:text-fg data-[state=active]:shadow-[0_1px_0_rgb(255_255_255/0.06)_inset]",
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: React.ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Content className={cn("focus-visible:outline-none", className)} {...props} />;
}
