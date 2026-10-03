import { BookmarkCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@inrent/db";
import { PageHeader } from "@/components/dashboard/ui";
import type { PlaygroundState } from "@/components/playground/playground";
import { safePublicModels } from "@/lib/catalog";
import { formatRelative } from "@/lib/format";
import { toPlaygroundModels } from "@/lib/playground-models";
import { getWorkspace } from "@/lib/session";
import { site } from "@/lib/site";
import { DashboardPlayground } from "./playground-client";

export const metadata: Metadata = { title: "Playground" };

function asState(payload: unknown): Partial<PlaygroundState> | undefined {
  if (!payload || typeof payload !== "object") return undefined;
  const p = payload as Record<string, unknown>;
  const messages = Array.isArray(p.messages)
    ? p.messages
        .filter((m): m is { role: "user" | "assistant"; content: string } => Boolean(m) && typeof m === "object" && ((m as { role?: unknown }).role === "user" || (m as { role?: unknown }).role === "assistant") && typeof (m as { content?: unknown }).content === "string")
        .slice(0, 200)
    : undefined;
  return {
    model: typeof p.model === "string" ? p.model : undefined,
    system: typeof p.system === "string" ? p.system : undefined,
    temperature: typeof p.temperature === "number" ? p.temperature : undefined,
    maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : undefined,
    topP: typeof p.topP === "number" ? p.topP : undefined,
    stream: typeof p.stream === "boolean" ? p.stream : undefined,
    tools: typeof p.tools === "string" ? p.tools : undefined,
    schema: typeof p.schema === "string" ? p.schema : undefined,
    messages,
  };
}

export default async function DashboardPlaygroundPage({ searchParams }: { searchParams: Promise<{ model?: string; share?: string; saved?: string }> }) {
  const sp = await searchParams;
  const ws = await getWorkspace();
  const [models, saved, loaded] = await Promise.all([
    safePublicModels(),
    prisma.savedPrompt.findMany({ where: { organizationId: ws.org.id, userId: ws.user.id, shareToken: null }, orderBy: { updatedAt: "desc" }, take: 8, select: { id: true, name: true, updatedAt: true } }),
    // Share tokens are unguessable (144 bits); any signed-in user holding the link may load it.
    sp.share
      ? prisma.savedPrompt.findUnique({ where: { shareToken: sp.share }, select: { payload: true } })
      : sp.saved && /^[0-9a-f-]{36}$/i.test(sp.saved)
        ? prisma.savedPrompt.findFirst({ where: { id: sp.saved, organizationId: ws.org.id }, select: { payload: true } })
        : null,
  ]);
  const initial = loaded ? asState(loaded.payload) : sp.model ? { model: sp.model } : undefined;
  return (
    <>
      <PageHeader
        title="Playground"
        description={`Requests run against ${ws.project.name} and are billed and logged like API calls.`}
        actions={
          saved.length ? (
            <details className="relative">
              <summary className="flex h-8 cursor-pointer list-none items-center gap-2 rounded-md border border-border-strong px-3 text-[13px] text-fg-muted hover:text-fg">
                <BookmarkCheck className="size-4" /> Saved ({saved.length})
              </summary>
              <ul className="panel absolute right-0 z-20 mt-1 w-64 rounded-lg p-1 shadow-xl">
                {saved.map((s) => (
                  <li key={s.id}>
                    <Link href={`/dashboard/playground?saved=${s.id}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[13px] text-fg-muted hover:bg-surface-2 hover:text-fg">
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-[11px] text-fg-subtle">{formatRelative(s.updatedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null
        }
      />
      {sp.share && !loaded ? <p className="mb-4 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-fg-muted">That shared link is invalid or was removed.</p> : null}
      <DashboardPlayground key={sp.share ?? sp.saved ?? sp.model ?? "new"} models={toPlaygroundModels(models)} apiBase={site.apiBaseUrl} initial={initial} canUse={ws.can("playground:use")} />
    </>
  );
}
