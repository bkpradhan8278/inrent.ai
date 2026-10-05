import Link from "@/components/ui/link";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main id="main" className="relative flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="bg-grid pointer-events-none absolute inset-0" aria-hidden />
      <LogoMark className="relative size-10" />
      <div className="relative font-mono text-sm text-accent">404</div>
      <h1 className="text-display relative text-4xl text-fg">This route doesn&apos;t resolve.</h1>
      <p className="relative max-w-md text-fg-muted">The page you&apos;re looking for doesn&apos;t exist or has moved.</p>
      <div className="relative flex gap-3">
        <Button asChild>
          <Link href="/">Back home</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/docs">Documentation</Link>
        </Button>
      </div>
    </main>
  );
}
