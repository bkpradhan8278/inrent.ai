import { Badge } from "@/components/ui/badge";

/** Static, clearly-labelled example dashboard — not live data. */
export function ObservabilityPreview() {
  const points = [12, 18, 15, 22, 28, 24, 31, 36, 33, 41, 38, 46, 52, 49, 58, 63, 60, 68];
  const max = 70;
  const w = 520;
  const h = 140;
  const step = w / (points.length - 1);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(1)} ${(h - (p / max) * h).toFixed(1)}`).join(" ");
  const area = `${line} L ${w} ${h} L 0 ${h} Z`;
  const tiles = [
    { label: "Requests", value: "48.2K" },
    { label: "Tokens", value: "61.9M" },
    { label: "p50 latency", value: "412 ms" },
    { label: "Error rate", value: "0.21%" },
  ];
  return (
    <div className="panel relative overflow-hidden rounded-2xl">
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm text-fg">
          <span className="size-1.5 rounded-full bg-accent" /> Usage · last 30 days
        </div>
        <Badge variant="amber">Example data</Badge>
      </div>
      <div className="grid grid-cols-2 gap-px bg-border sm:grid-cols-4">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-5 py-4">
            <div className="text-[11px] uppercase tracking-wider text-fg-subtle">{t.label}</div>
            <div className="mt-1 font-display text-xl font-semibold text-fg">{t.value}</div>
          </div>
        ))}
      </div>
      <div className="px-5 pb-5 pt-6">
        <svg viewBox={`0 0 ${w} ${h}`} className="h-36 w-full" preserveAspectRatio="none" aria-hidden>
          <defs>
            <linearGradient id="obs-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5cebc0" stopOpacity="0.28" />
              <stop offset="1" stopColor="#5cebc0" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((f) => (
            <line key={f} x1="0" x2={w} y1={h * f} y2={h * f} stroke="rgb(255 255 255 / 0.05)" />
          ))}
          <path d={area} fill="url(#obs-area)" />
          <path d={line} fill="none" stroke="#5cebc0" strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
        </svg>
        <div className="mt-4 grid gap-2 text-[12px] sm:grid-cols-3">
          {[
            { k: "provider_a", v: "61%" },
            { k: "provider_b", v: "27%" },
            { k: "self_hosted", v: "12%" },
          ].map((r) => (
            <div key={r.k} className="flex items-center justify-between rounded-md border border-border bg-bg-elevated px-3 py-2 font-mono">
              <span className="text-fg-subtle">{r.k}</span>
              <span className="text-fg-muted">{r.v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
