import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { footerNav, site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="relative border-t border-border bg-bg">
      <div className="container-page grid gap-12 py-16 md:grid-cols-[1.2fr_repeat(4,1fr)]">
        <div className="flex flex-col gap-4">
          <Logo />
          <p className="max-w-xs text-sm leading-relaxed text-fg-subtle">AI infrastructure, without the infrastructure. One API for leading AI models — with GPU compute on the roadmap.</p>
          <Link href="/status" className="inline-flex w-fit items-center gap-2 rounded-full border border-border px-3 py-1 text-xs text-fg-muted transition-colors hover:border-border-strong hover:text-fg">
            <span className="size-1.5 rounded-full bg-fg-subtle" aria-hidden />
            System status
          </Link>
        </div>
        {footerNav.map((col) => (
          <div key={col.title}>
            <h2 className="mb-4 font-mono text-[11px] uppercase tracking-[0.16em] text-fg-subtle">{col.title}</h2>
            <ul className="flex flex-col gap-2.5">
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="inline-flex items-center gap-2 text-sm text-fg-muted transition-colors hover:text-fg">
                    {l.label}
                    {l.badge ? <span className="rounded-full border border-border-strong px-1.5 text-[10px] text-fg-subtle">{l.badge}</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="container-page flex flex-col gap-3 py-6 text-xs text-fg-subtle sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} INRENT. All rights reserved.</p>
          <p>
            Model names, logos and trademarks belong to their respective owners and indicate integrations, not endorsement or partnership.{" "}
            <a href={`mailto:${site.supportEmail}`} className="text-fg-muted underline underline-offset-2 hover:text-fg">
              {site.supportEmail}
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
