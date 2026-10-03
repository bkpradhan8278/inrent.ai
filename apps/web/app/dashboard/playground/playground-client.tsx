"use client";

import { useRouter } from "next/navigation";
import { Playground, type PlaygroundModel, type PlaygroundState } from "@/components/playground/playground";
import { savePromptAction, sharePromptAction } from "../actions";

export function DashboardPlayground({ models, apiBase, initial, canUse }: { models: PlaygroundModel[]; apiBase: string; initial?: Partial<PlaygroundState>; canUse: boolean }) {
  const router = useRouter();
  return (
    <Playground
      models={models}
      apiBase={apiBase}
      signedIn={canUse}
      initial={initial}
      onSave={async (name, state) => {
        const r = await savePromptAction(name, JSON.parse(JSON.stringify(state)));
        if (r.ok) router.refresh();
        return r.ok ? { ok: true } : { ok: false, error: r.error };
      }}
      onShare={async (state) => {
        const r = await sharePromptAction(JSON.parse(JSON.stringify(state)));
        return r.ok ? { ok: true, url: r.data.url } : { ok: false, error: r.error };
      }}
    />
  );
}
