import { FlaskConical } from "lucide-react";
import Link from "@/components/ui/link";
import { Button } from "@/components/ui/button";

export function PreviewGate({ feature }: { feature: string }) {
  return (
    <div className="panel hairline-top mx-auto max-w-xl rounded-2xl p-8 text-center">
      <div className="mx-auto flex size-11 items-center justify-center rounded-xl border border-iris/35 bg-iris-soft">
        <FlaskConical className="size-5 text-iris" />
      </div>
      <h2 className="mt-4 text-lg font-semibold text-fg">{feature} is in private preview</h2>
      <p className="mt-2 text-sm text-fg-muted">It isn&apos;t enabled for this organization yet. Request access and we&apos;ll turn it on when there&apos;s room in the preview.</p>
      <div className="mt-5 flex justify-center gap-2">
        <Button asChild size="sm">
          <Link href={`/dashboard/support?subject=${encodeURIComponent(`${feature} preview access`)}`}>Request access</Link>
        </Button>
        <Button asChild size="sm" variant="ghost">
          <Link href="/roadmap">Roadmap</Link>
        </Button>
      </div>
    </div>
  );
}
