import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function AdminSearch({ action, q, placeholder, children }: { action: string; q?: string; placeholder: string; children?: React.ReactNode }) {
  return (
    <form action={action} className="mb-4 flex flex-col gap-2 sm:flex-row">
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
        <Input name="q" defaultValue={q} placeholder={placeholder} className="pl-9" aria-label="Search" />
      </div>
      {children}
      <Button type="submit" variant="secondary">
        Search
      </Button>
    </form>
  );
}

export function Pager({ basePath, page, hasMore, params = {} }: { basePath: string; page: number; hasMore: boolean; params?: Record<string, string | undefined> }) {
  const href = (p: number) => `${basePath}?${new URLSearchParams(Object.entries({ ...params, page: String(p) }).filter((e): e is [string, string] => Boolean(e[1]))).toString()}`;
  if (page <= 1 && !hasMore) return null;
  return (
    <div className="mt-4 flex justify-end gap-2">
      {page > 1 ? (
        <Button asChild variant="ghost" size="sm">
          <a href={href(page - 1)}>← Previous</a>
        </Button>
      ) : null}
      {hasMore ? (
        <Button asChild variant="secondary" size="sm">
          <a href={href(page + 1)}>Next →</a>
        </Button>
      ) : null}
    </div>
  );
}
