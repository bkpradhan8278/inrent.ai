"use client";

import { ChevronDown, Menu, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "@/components/brand/logo";
import { openCommandPalette } from "@/lib/command-events";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Kbd } from "@/components/ui/misc";
import { useSession } from "@/lib/auth-client";
import { mainNav } from "@/lib/site";
import { useResetOnChange } from "@/lib/hooks";
import { cn } from "@/lib/utils";

export function SiteHeader() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = useSession();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled ? "border-border bg-[rgb(6_7_10/0.78)] backdrop-blur-xl" : "border-transparent bg-transparent",
      )}
    >
      <div className="container-page flex h-16 items-center gap-6">
        <Logo />
        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {mainNav.map((item) =>
            "items" in item ? (
              <DropdownMenu key={item.label}>
                <DropdownMenuTrigger className="inline-flex h-8 items-center gap-1 rounded-md px-3 text-[13.5px] text-fg-muted transition-colors hover:text-fg data-[state=open]:text-fg">
                  {item.label}
                  <ChevronDown className="size-3.5 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80 p-1.5">
                  {item.items.map((sub) => (
                    <DropdownMenuItem key={sub.href} asChild className="flex-col items-start gap-0.5 px-3 py-2.5">
                      <Link href={sub.href}>
                        <span className="text-[13.5px] font-medium text-fg">{sub.label}</span>
                        {sub.description ? <span className="text-xs text-fg-subtle">{sub.description}</span> : null}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-3 text-[13.5px] transition-colors hover:text-fg",
                  pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`)) ? "text-fg" : "text-fg-muted",
                )}
              >
                {item.label}
                {item.href === "/gpu" ? <span className="ml-1.5 size-1.5 rounded-full bg-amber" aria-label="coming soon" /> : null}
              </Link>
            ),
          )}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCommandPalette()}
            className="hidden h-8 items-center gap-2 rounded-md border border-border bg-surface/60 pl-2.5 pr-1.5 text-[13px] text-fg-subtle transition-colors hover:border-border-strong hover:text-fg-muted md:inline-flex"
            aria-label="Open command palette"
          >
            <Search className="size-3.5" />
            Search
            <Kbd className="ml-3">⌘K</Kbd>
          </button>
          {session ? (
            <Button asChild size="sm">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
                <Link href="/sign-in">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/sign-up">Get started</Link>
              </Button>
            </>
          )}
          <MobileNav signedIn={Boolean(session)} />
        </div>
      </div>
    </header>
  );
}

function MobileNav({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useResetOnChange(pathname, () => setOpen(false));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu">
          <Menu />
        </Button>
      </DialogTrigger>
      <SheetContent side="right" aria-describedby={undefined}>
        <div className="flex h-16 items-center border-b border-border px-5">
          <Logo />
        </div>
        <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 py-4">
          {mainNav.map((item) =>
            "items" in item ? (
              <div key={item.label} className="mt-4">
                <div className="px-3 pb-1 text-[11px] uppercase tracking-wider text-fg-subtle">{item.label}</div>
                {item.items.map((sub) => (
                  <Link key={sub.href} href={sub.href} className="block rounded-md px-3 py-2 text-[15px] text-fg-muted hover:bg-surface-2 hover:text-fg">
                    {sub.label}
                  </Link>
                ))}
              </div>
            ) : (
              <Link key={item.href} href={item.href} className="block rounded-md px-3 py-2 text-[15px] text-fg hover:bg-surface-2">
                {item.label}
              </Link>
            ),
          )}
        </nav>
        <div className="flex flex-col gap-2 border-t border-border p-4">
          {signedIn ? (
            <Button asChild>
              <Link href="/dashboard">Open dashboard</Link>
            </Button>
          ) : (
            <>
              <Button asChild>
                <Link href="/sign-up">Get started</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link href="/sign-in">Sign in</Link>
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Dialog>
  );
}
