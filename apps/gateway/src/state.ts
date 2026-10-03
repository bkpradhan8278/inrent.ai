import { CircuitBreaker } from "./circuit";
import { CatalogCache } from "./pipeline/catalog";
import type { GatewayDeps } from "./types";

const BYOK_TTL_MS = 30_000;

/** Per-process gateway state: catalog snapshot, circuit breaker, short-lived BYOK cache. */
export class GatewayState {
  readonly catalog: CatalogCache;
  readonly circuit: CircuitBreaker;
  private readonly byok = new Map<string, { at: number; keys: Map<string, string> }>();

  constructor(private readonly deps: GatewayDeps) {
    this.catalog = new CatalogCache(deps);
    this.circuit = new CircuitBreaker(deps.now);
  }

  async byokKeys(organizationId: string): Promise<Map<string, string>> {
    const hit = this.byok.get(organizationId);
    if (hit && this.deps.now() - hit.at < BYOK_TTL_MS) return hit.keys;
    const keys = await this.deps.loadByokKeys(organizationId);
    this.byok.set(organizationId, { at: this.deps.now(), keys });
    if (this.byok.size > 10_000) this.byok.delete(this.byok.keys().next().value!);
    return keys;
  }
}
