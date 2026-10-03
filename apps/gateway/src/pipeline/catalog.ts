import type { ServingModel } from "@inrent/services";
import type { GatewayDeps } from "../types";

const TTL_MS = Number(process.env.GATEWAY_CATALOG_TTL_MS ?? 10_000);

/** In-memory catalog snapshot, refreshed every few seconds (admin changes apply quickly). */
export class CatalogCache {
  private snapshot: { at: number; bySlug: Map<string, ServingModel>; all: ServingModel[] } | null = null;
  private loading: Promise<void> | null = null;

  constructor(private readonly deps: Pick<GatewayDeps, "loadCatalog" | "now">) {}

  private async refresh() {
    const all = await this.deps.loadCatalog();
    this.snapshot = { at: this.deps.now(), all, bySlug: new Map(all.map((m) => [m.slug, m])) };
  }

  async get(): Promise<{ bySlug: Map<string, ServingModel>; all: ServingModel[] }> {
    if (!this.snapshot || this.deps.now() - this.snapshot.at > TTL_MS) {
      this.loading ??= this.refresh().finally(() => {
        this.loading = null;
      });
      if (!this.snapshot) await this.loading;
      else void this.loading.catch(() => undefined); // serve stale while refreshing
    }
    return this.snapshot!;
  }

  invalidate() {
    this.snapshot = null;
  }
}
