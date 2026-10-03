"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="font-mono text-sm text-danger">Something went wrong</div>
      <h1 className="text-display text-3xl text-fg">We couldn&apos;t load this page.</h1>
      <p className="max-w-md text-sm text-fg-muted">The error has been logged{error.digest ? ` (reference ${error.digest})` : ""}. Try again, or check the status page if it keeps happening.</p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
