"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function ExportMenu({ kinds }: { kinds: Array<{ kind: "usage" | "requests" | "billing" | "invoices"; label: string }> }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm">
          <Download /> Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {kinds.map((k) => (
          <div key={k.kind}>
            <DropdownMenuLabel>{k.label}</DropdownMenuLabel>
            {(["csv", "json"] as const).map((f) => (
              <DropdownMenuItem key={f} asChild>
                <a href={`/api/export?kind=${k.kind}&format=${f}`} download>
                  {f.toUpperCase()}
                </a>
              </DropdownMenuItem>
            ))}
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
