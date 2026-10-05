import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/theme";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-dvh flex-col overflow-x-clip">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <div className="pointer-events-none absolute left-1/2 top-0 h-[480px] w-[760px] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,color-mix(in_oklab,var(--color-accent)_10%,transparent),transparent)]" aria-hidden />
      <header className="container-page relative flex h-16 items-center justify-between">
        <Logo />
        <div className="flex items-center gap-3">
          <Link href="/docs" className="text-sm text-fg-muted hover:text-fg">
            Docs
          </Link>
          <ThemeToggle />
        </div>
      </header>
      <main id="main" className="relative flex flex-1 items-center justify-center px-4 py-10">
        {children}
      </main>
      <footer className="relative py-6 text-center text-xs text-fg-subtle">
        By continuing you agree to the{" "}
        <Link href="/terms" className="underline hover:text-fg-muted">
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" className="underline hover:text-fg-muted">
          Privacy Policy
        </Link>
        .
      </footer>
    </div>
  );
}
