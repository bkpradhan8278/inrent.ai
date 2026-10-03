"use client";

import { Activity, ArrowLeft, BarChart3, Boxes, Building2, Cpu, CreditCard, Flag, LayoutDashboard, LifeBuoy, Menu, ScrollText, Server, ShieldCheck, Users, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogTitle, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { useResetOnChange } from "@/lib/hooks";
import { cn } from "@/lib/utils";

interface Item {
  label: string;
  href: string;
  icon: LucideIcon;
  permission: string;
}

const NAV: Array<{ title?: string; items: Item[] }> = [
  { items: [{ label: "Overview", href: "/admin", icon: LayoutDashboard, permission: "admin:access" }] },
  {
    title: "Customers",
    items: [
      { label: "Users", href: "/admin/users", icon: Users, permission: "users:read" },
      { label: "Organizations", href: "/admin/organizations", icon: Building2, permission: "orgs:read" },
      { label: "Support tickets", href: "/admin/support", icon: LifeBuoy, permission: "tickets:read" },
    ],
  },
  {
    title: "Catalog",
    items: [
      { label: "Providers", href: "/admin/providers", icon: Server, permission: "providers:read" },
      { label: "Models & pricing", href: "/admin/models", icon: Boxes, permission: "models:read" },
      { label: "GPU & waitlist", href: "/admin/gpu", icon: Cpu, permission: "gpu:read" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Requests", href: "/admin/requests", icon: ScrollText, permission: "requests:read" },
      { label: "Revenue", href: "/admin/revenue", icon: BarChart3, permission: "revenue:read" },
      { label: "Billing", href: "/admin/billing", icon: CreditCard, permission: "billing:read" },
      { label: "System health", href: "/admin/system", icon: Activity, permission: "health:read" },
      { label: "Feature flags", href: "/admin/flags", icon: Flag, permission: "flags:read" },
      { label: "Audit log", href: "/admin/audit", icon: ShieldCheck, permission: "audit:read" },
    ],
  },
];

export function AdminShell({ role, permissions, user, children }: { role: string; permissions: string[]; user: { name: string; email: string }; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useResetOnChange(pathname, () => setOpen(false));
  const active = (href: string) => (href === "/admin" ? pathname === href : pathname.startsWith(href));

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-3">
      <div className="flex items-center gap-2 px-1 pt-1">
        <Logo href="/admin" />
        <Badge variant="iris">Admin</Badge>
      </div>
      <nav aria-label="Admin" className="flex flex-1 flex-col gap-5 overflow-y-auto">
        {NAV.map((g, i) => {
          const items = g.items.filter((it) => permissions.includes(it.permission));
          if (!items.length) return null;
          return (
            <div key={i}>
              {g.title ? <div className="mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{g.title}</div> : null}
              <ul className="flex flex-col gap-0.5">
                {items.map((it) => (
                  <li key={it.href}>
                    <Link href={it.href} aria-current={active(it.href) ? "page" : undefined} className={cn("group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors", active(it.href) ? "bg-surface-3 text-fg" : "text-fg-muted hover:bg-surface-2 hover:text-fg")}>
                      <it.icon className={cn("size-4", active(it.href) ? "text-iris" : "text-fg-subtle")} />
                      {it.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="rounded-lg border border-border bg-surface p-3 text-[12px]">
        <div className="truncate text-fg">{user.name}</div>
        <div className="truncate text-fg-subtle">{user.email}</div>
        <div className="mt-1.5">
          <Badge variant="outline">{role.toLowerCase().replace("_", " ")}</Badge>
        </div>
      </div>
      <Link href="/dashboard" className="flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
        <ArrowLeft className="size-4" /> Back to dashboard
      </Link>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-bg-elevated lg:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-[rgb(6_7_10/0.85)] px-3 backdrop-blur-xl sm:px-5">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </DialogTrigger>
            <SheetContent aria-describedby={undefined} className="bg-bg-elevated">
              <DialogTitle className="sr-only">Admin navigation</DialogTitle>
              {sidebar}
            </SheetContent>
          </Dialog>
          <span className="text-[13px] text-fg-muted">INRENT Admin Console</span>
          <span className="ml-auto hidden text-[12px] text-fg-subtle sm:block">All admin actions are audit-logged.</span>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
