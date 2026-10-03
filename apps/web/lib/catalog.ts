import "server-only";
import { listPublicModels, getPublicModel, listPublicProviders, type PublicModel } from "@inrent/services";

/**
 * Catalog reads for public pages. Failures (e.g. building without a database) degrade to an
 * empty catalog instead of failing the page; ISR fills it in at runtime.
 */
export async function safePublicModels(): Promise<PublicModel[]> {
  try {
    return await listPublicModels();
  } catch (e) {
    console.error("[catalog] unable to load models:", e instanceof Error ? e.message : e);
    return [];
  }
}

export async function safePublicModel(slug: string): Promise<PublicModel | null> {
  try {
    return await getPublicModel(slug);
  } catch (e) {
    console.error("[catalog] unable to load model:", e instanceof Error ? e.message : e);
    return null;
  }
}

export async function safePublicProviders() {
  try {
    return await listPublicProviders();
  } catch {
    return [];
  }
}

export type { PublicModel };
