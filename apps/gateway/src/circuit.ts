/**
 * Per-instance circuit breaker. When a provider fails repeatedly in a short window it is
 * treated as DOWN for routing (so traffic shifts to fallbacks immediately), then probed
 * again after a cool-down. The worker's health checks provide the durable view.
 */

const WINDOW_MS = 60_000;
const MIN_FAILURES = 5;
const FAILURE_RATIO = 0.5;
const OPEN_MS = 30_000;

interface State {
  events: Array<{ at: number; ok: boolean }>;
  openUntil: number;
}

export class CircuitBreaker {
  private readonly states = new Map<string, State>();
  constructor(private readonly now: () => number = Date.now) {}

  private state(provider: string): State {
    let s = this.states.get(provider);
    if (!s) {
      s = { events: [], openUntil: 0 };
      this.states.set(provider, s);
    }
    const cutoff = this.now() - WINDOW_MS;
    while (s.events.length && s.events[0]!.at < cutoff) s.events.shift();
    return s;
  }

  record(provider: string, ok: boolean): void {
    const s = this.state(provider);
    s.events.push({ at: this.now(), ok });
    if (s.events.length > 500) s.events.splice(0, s.events.length - 500);
    if (!ok) {
      const failures = s.events.filter((e) => !e.ok).length;
      if (failures >= MIN_FAILURES && failures / s.events.length >= FAILURE_RATIO) s.openUntil = this.now() + OPEN_MS;
    } else if (s.openUntil && this.now() >= s.openUntil) {
      s.openUntil = 0;
    }
  }

  isOpen(provider: string): boolean {
    return this.state(provider).openUntil > this.now();
  }
}
