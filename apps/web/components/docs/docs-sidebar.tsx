"use client";

import { Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Nav = Array<{ title: string; pages: Array<{ title: string; href: string }> }>;

function NavList({ nav }: { nav: Nav }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Documentation" className="flex flex-col gap-6">
      {nav.map((section) => (
        <div key={section.title}>
          <div className="mb-2 px-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">{section.title}</div>
          <ul className="flex flex-col gap-0.5">
            {section.pages.map((p) => {
              const active = pathname === p.href;
              return (
                <li key={p.href}>
                  <Link
                    href={p.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative block rounded-md px-2 py-1.5 text-[13.5px] transition-colors",
                      active ? "bg-surface-2 text-fg before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-accent" : "text-fg-muted hover:text-fg",
                    )}
                  >
                    {p.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export function DocsSidebar({ nav, search }: { nav: Nav; search: React.ReactNode }) {
  return (
    <aside className="hidden lg:block">
      <div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-5 overflow-y-auto pb-10 pr-2">
        {search}
        <NavList nav={nav} />
      </div>
    </aside>
  );
}

export function DocsMobileNav({ nav, search }: { nav: Nav; search: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  return (
    <div className="flex items-center gap-2 lg:hidden">
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="secondary" size="sm">
            <Menu /> Docs menu
          </Button>
        </DialogTrigger>
        <SheetContent aria-describedby={undefined} className="overflow-y-auto p-5 pt-14">
          <NavList nav={nav} />
        </SheetContent>
      </Dialog>
      <div className="flex-1">{search}</div>
    </div>
  );
}
