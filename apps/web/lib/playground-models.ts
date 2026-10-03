import type { PublicModel } from "@inrent/services";
import type { PlaygroundModel } from "@/components/playground/playground";

export function toPlaygroundModels(models: PublicModel[]): PlaygroundModel[] {
  const chat = models.filter((m) => m.capabilities.includes("chat"));
  const order = { platform: 0, byok: 1, unavailable: 2 } as const;
  return [
    { slug: "inrent/auto", name: "INRENT Auto (router)", availability: chat.some((m) => m.availability === "platform") ? "platform" : "unavailable", inputPrice: null, outputPrice: null, supportsTools: true },
    ...chat
      .sort((a, b) => order[a.availability] - order[b.availability] || a.displayName.localeCompare(b.displayName))
      .map((m) => ({
        slug: m.slug,
        name: m.displayName,
        availability: m.availability,
        inputPrice: m.pricing?.input ?? null,
        outputPrice: m.pricing?.output ?? null,
        supportsTools: m.capabilities.includes("tools"),
      })),
  ];
}
