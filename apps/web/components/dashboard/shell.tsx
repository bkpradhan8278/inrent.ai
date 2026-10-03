"use client";

import { Bell, Check, ChevronsUpDown, LogOut, Menu, Plus, Search, Shield, User } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/logo";
import { openCommandPalette } from "@/components/command-palette";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, SheetContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input, Label } from "@/components/ui/input";
import { Kbd } from "@/components/ui/misc";
import { signOut } from "@/lib/auth-client";
import { formatRelative } from "@/lib/format";
import { useResetOnChange } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { createOrganizationAction, markNotificationsReadAction, setEnvironmentAction, switchOrganizationAction, switchProjectAction } from "@/app/dashboard/actions";
import { ADMIN_LINK, DASH_NAV } from "./nav";

export interface ShellData {
  user: { name: string; email: string; image: string | null };
  isAdmin: boolean;
  orgs: Array<{ id: string; name: string; type: string; role: string }>;
  activeOrgId: string;
  projects: Array<{ id: string; name: string }>;
  activeProjectId: string;
  environment: string;
  balanceUsd: string;
  isDemo: boolean;
  notifications: Array<{ id: string; title: string; body: string; link: string | null; createdAt: string; read: boolean }>;
}

function SidebarNav({ isAdmin, onNavigate }: { isAdmin: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`));
  return (
    <nav aria-label="Dashboard" className="flex flex-col gap-5">
      {DASH_NAV.map((group, gi) => (
        <div key={gi}>
          {group.title ? <div className="mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-fg-subtle">{group.title}</div> : null}
          <ul className="flex flex-col gap-0.5">
            {group.items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "group flex h-8 items-center gap-2.5 rounded-md px-2.5 text-[13.5px] transition-colors",
                    isActive(item.href) ? "bg-surface-3 text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]" : "text-fg-muted hover:bg-surface-2 hover:text-fg",
                  )}
                >
                  <item.icon className={cn("size-4", isActive(item.href) ? "text-accent" : "text-fg-subtle group-hover:text-fg-muted")} />
                  {item.label}
                  {item.badge ? <span className="ml-auto rounded border border-border-strong px-1 text-[9.5px] text-fg-subtle">{item.badge}</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ))}
      {isAdmin ? (
        <Link href={ADMIN_LINK.href} onClick={onNavigate} className="flex h-8 items-center gap-2.5 rounded-md border border-[rgb(142_150_255/0.3)] bg-iris-soft px-2.5 text-[13.5px] text-iris">
          <Shield className="size-4" /> {ADMIN_LINK.label}
        </Link>
      ) : null}
    </nav>
  );
}

function WorkspaceSwitcher({ data }: { data: ShellData }) {
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const router = useRouter();
  const active = data.orgs.find((o) => o.id === data.activeOrgId);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger className="flex h-9 w-full items-center gap-2 rounded-md border border-border bg-surface px-2.5 text-left text-[13px] transition-colors hover:border-border-strong disabled:opacity-60" disabled={pending}>
          <span className="flex size-5 items-center justify-center rounded bg-gradient-to-br from-accent to-iris font-mono text-[10px] font-bold text-accent-fg">{active?.name.slice(0, 1).toUpperCase()}</span>
          <span className="min-w-0 flex-1 truncate text-fg">{active?.name}</span>
          <ChevronsUpDown className="size-3.5 text-fg-subtle" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          {data.orgs.map((o) => (
            <DropdownMenuItem
              key={o.id}
              onSelect={() =>
                start(async () => {
                  await switchOrganizationAction(o.id);
                  router.refresh();
                })
              }
            >
              <span className="min-w-0 flex-1 truncate">{o.name}</span>
              <span className="text-[10px] uppercase text-fg-subtle">{o.role.toLowerCase()}</span>
              {o.id === data.activeOrgId ? <Check className="text-accent" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setCreating(true)}>
            <Plus /> New team organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
            <DialogDescription>Team organizations have shared billing, members and roles.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              start(async () => {
                const r = await createOrganizationAction(name);
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("Organization created");
                  setCreating(false);
                  setName("");
                  router.refresh();
                }
              });
            }}
            className="grid gap-4"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="org-name">Name</Label>
              <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={64} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={pending}>
                Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Notifications({ items }: { items: ShellData["notifications"] }) {
  const unread = items.filter((n) => !n.read).length;
  const router = useRouter();
  return (
    <DropdownMenu
      onOpenChange={async (open) => {
        if (!open && unread) {
          await markNotificationsReadAction();
          router.refresh();
        }
      }}
    >
      <DropdownMenuTrigger className="relative inline-flex size-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-2 hover:text-fg" aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}>
        <Bell className="size-4" />
        {unread ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-accent ring-2 ring-bg" /> : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2 text-xs font-medium text-fg-muted">Notifications</div>
        {items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-fg-subtle">You&apos;re all caught up.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((n) => (
              <li key={n.id} className="border-b border-border last:border-0">
                <Link href={n.link ?? "/dashboard"} className="block px-3 py-2.5 hover:bg-surface-2">
                  <div className="flex items-center gap-2 text-sm text-fg">
                    {!n.read ? <span className="size-1.5 rounded-full bg-accent" /> : null}
                    {n.title}
                  </div>
                  <div className="mt-0.5 text-xs text-fg-muted">{n.body}</div>
                  <div className="mt-1 text-[10.5px] text-fg-subtle">{formatRelative(n.createdAt)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function DashboardShell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const pathname = usePathname();
  useResetOnChange(pathname, () => setMobileOpen(false));

  const sidebar = (
    <div className="flex h-full flex-col gap-5 p-3">
      <div className="px-1 pt-1">
        <Logo href="/dashboard" />
      </div>
      <WorkspaceSwitcher data={data} />
      <div className="flex-1 overflow-y-auto">
        <SidebarNav isAdmin={data.isAdmin} onNavigate={() => setMobileOpen(false)} />
      </div>
      <Link href="/dashboard/billing" className="rounded-lg border border-border bg-surface p-3 transition-colors hover:border-border-strong">
        <div className="text-[10.5px] uppercase tracking-wider text-fg-subtle">Credit balance</div>
        <div className="mt-0.5 font-display text-lg font-semibold text-fg">${data.balanceUsd}</div>
      </Link>
    </div>
  );

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="sticky top-0 hidden h-dvh border-r border-border bg-bg-elevated lg:block">{sidebar}</aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-[rgb(6_7_10/0.85)] px-3 backdrop-blur-xl sm:px-5">
          <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu />
              </Button>
            </DialogTrigger>
            <SheetContent aria-describedby={undefined} className="bg-bg-elevated">
              <DialogTitleSr />
              {sidebar}
            </SheetContent>
          </Dialog>
          <label className="sr-only" htmlFor="project-select">
            Project
          </label>
          <select
            id="project-select"
            value={data.activeProjectId}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await switchProjectAction(e.target.value);
                router.refresh();
              })
            }
            className="h-8 max-w-40 truncate rounded-md border border-border bg-surface px-2 text-[13px] text-fg focus-visible:outline-none sm:max-w-52"
          >
            {data.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="env-select">
            Environment
          </label>
          <select
            id="env-select"
            value={data.environment}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await setEnvironmentAction(e.target.value);
                router.refresh();
              })
            }
            className="hidden h-8 rounded-md border border-border bg-surface px-2 text-[13px] text-fg focus-visible:outline-none sm:block"
          >
            <option value="all">All environments</option>
            <option value="DEVELOPMENT">Development</option>
            <option value="STAGING">Staging</option>
            <option value="PRODUCTION">Production</option>
          </select>
          {data.isDemo ? <Badge variant="amber" className="hidden md:inline-flex">Demo workspace</Badge> : null}
          <div className="ml-auto flex items-center gap-1">
            <button type="button" onClick={() => openCommandPalette()} className="hidden h-8 items-center gap-2 rounded-md border border-border px-2.5 text-[12.5px] text-fg-subtle hover:text-fg-muted md:inline-flex">
              <Search className="size-3.5" /> Search <Kbd>⌘K</Kbd>
            </button>
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link href="/docs">Docs</Link>
            </Button>
            <Notifications items={data.notifications} />
            <DropdownMenu>
              <DropdownMenuTrigger className="ml-1 flex size-8 items-center justify-center overflow-hidden rounded-full border border-border-strong bg-surface-2 text-xs font-medium text-fg" aria-label="Account menu">
                {data.user.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={data.user.image} alt="" className="size-full object-cover" />
                ) : (
                  data.user.name.slice(0, 1).toUpperCase()
                )}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <div className="px-2 py-1.5">
                  <div className="truncate text-sm text-fg">{data.user.name}</div>
                  <div className="truncate text-xs text-fg-subtle">{data.user.email}</div>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href="/dashboard/settings">
                    <User /> Account settings
                  </Link>
                </DropdownMenuItem>
                {data.isAdmin ? (
                  <DropdownMenuItem asChild>
                    <Link href="/admin">
                      <Shield /> Admin Console
                    </Link>
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={async () => {
                    await signOut();
                    router.push("/");
                    router.refresh();
                  }}
                >
                  <LogOut /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main" className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}

function DialogTitleSr() {
  return <DialogTitle className="sr-only">Navigation</DialogTitle>;
}
