"use client";

import { Tooltip as Primitive } from "radix-ui";
import * as React from "react";
import { cn } from "@/lib/utils";

export function Tooltip({ content, children, side = "top" }: { content: React.ReactNode; children: React.ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Primitive.Provider delayDuration={200}>
      <Primitive.Root>
        <Primitive.Trigger asChild>{children}</Primitive.Trigger>
        <Primitive.Portal>
          <Primitive.Content
            side={side}
            sideOffset={6}
            className={cn("z-50 max-w-xs rounded-md border border-border-strong bg-surface-3 px-2.5 py-1.5 text-xs text-fg shadow-lg data-[state=delayed-open]:animate-fade-in")}
          >
            {content}
          </Primitive.Content>
        </Primitive.Portal>
      </Primitive.Root>
    </Primitive.Provider>
  );
}
