"use client";

import { Switch as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Switch({ className, ...props }: React.ComponentProps<typeof Primitive.Root>) {
  return (
    <Primitive.Root
      className={cn(
        "peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border border-border-strong bg-surface-3 transition-colors data-[state=checked]:border-[rgb(92_235_192/0.5)] data-[state=checked]:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    >
      <Primitive.Thumb className="pointer-events-none block size-4 translate-x-0.5 rounded-full bg-fg shadow transition-transform data-[state=checked]:translate-x-[17px] data-[state=checked]:bg-accent-fg" />
    </Primitive.Root>
  );
}
