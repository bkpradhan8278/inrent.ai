"use client";

import type { PublicModel } from "@inrent/services";
import { useSession } from "@/lib/auth-client";
import { site } from "@/lib/site";
import { Playground } from "./playground";

export function MiniPlayground({ model }: { model: PublicModel }) {
  const { data: session } = useSession();
  return (
    <Playground
      compact
      signedIn={Boolean(session)}
      apiBase={site.apiBaseUrl}
      initial={{ model: model.slug, maxTokens: 256 }}
      models={[
        {
          slug: model.slug,
          name: model.displayName,
          availability: model.availability,
          inputPrice: model.pricing?.input ?? null,
          outputPrice: model.pricing?.output ?? null,
          supportsTools: model.capabilities.includes("tools"),
        },
      ]}
    />
  );
}
