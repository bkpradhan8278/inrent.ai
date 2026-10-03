import { LogoMark } from "@/components/brand/logo";
import { ScaleToFit } from "./scale-to-fit";
import { cn } from "@/lib/utils";

/**
 * Animated request-flow diagram for the hero. Deterministic SVG animation (no JS, no fake
 * metrics): application → INRENT API → router → providers. Moving packets are hidden for
 * users who prefer reduced motion.
 */

const W = 560;
const H = 540;

const providers = [
  { name: "OpenAI", mono: "O", tint: "#9ce8cf", x: 74, y: 405 },
  { name: "Anthropic", mono: "A", tint: "#e8b48f", x: 211, y: 405 },
  { name: "Gemini", mono: "G", tint: "#8fb8ff", x: 349, y: 405 },
  { name: "DeepSeek", mono: "D", tint: "#8aa2ff", x: 486, y: 405 },
  { name: "Qwen", mono: "Q", tint: "#b59cff", x: 74, y: 482 },
  { name: "Mistral", mono: "M", tint: "#ffb27a", x: 211, y: 482 },
  { name: "GLM", mono: "Z", tint: "#7fd1ff", x: 349, y: 482 },
  { name: "vLLM", mono: "v", tint: "#5cebc0", x: 486, y: 482, note: "self-hosted" },
];

const ROUTER = { x: 280, y: 292 };

function curve(to: { x: number; y: number }) {
  const sy = ROUTER.y + 22;
  const ty = to.y - 22;
  const my = (sy + ty) / 2;
  return `M ${ROUTER.x} ${sy} C ${ROUTER.x} ${my}, ${to.x} ${my}, ${to.x} ${ty}`;
}

function Node({ x, y, className, children }: { x: number; y: number; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("absolute -translate-x-1/2 -translate-y-1/2", className)} style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

export function RoutingVisual({ className }: { className?: string }) {
  // Active routes cycle deterministically through providers to illustrate routing decisions.
  const active = [0, 2, 1, 6, 3, 7, 4, 5];
  const cycle = 2.4;
  const total = active.length * cycle;
  const slot = 1 / active.length;
  return (
    <figure className={cn("relative w-full", className)} aria-label="Diagram: your application calls the INRENT API, which routes each request to an eligible model provider">
      <ScaleToFit width={W} height={H}>
      <div className="relative h-full w-full">
        {/* glow */}
        <div className="pointer-events-none absolute left-1/2 top-[42%] h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent/10 blur-3xl" aria-hidden />
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <linearGradient id="rv-line" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5cebc0" stopOpacity="0.55" />
              <stop offset="1" stopColor="#8e96ff" stopOpacity="0.25" />
            </linearGradient>
            <radialGradient id="rv-packet">
              <stop offset="0" stopColor="#d8fff2" />
              <stop offset="0.4" stopColor="#5cebc0" />
              <stop offset="1" stopColor="#5cebc0" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* app → api → router spine */}
          <path id="rv-spine" d={`M 280 66 L 280 ${ROUTER.y - 22}`} stroke="url(#rv-line)" strokeWidth="1.2" fill="none" />
          <path d={`M 280 66 L 280 ${ROUTER.y - 22}`} stroke="#5cebc0" strokeOpacity="0.35" strokeWidth="1.2" fill="none" strokeDasharray="2 10" className="animate-flow" />

          {/* router → providers */}
          {providers.map((p, i) => (
            <path key={p.name} id={`rv-route-${i}`} d={curve(p)} stroke="rgb(255 255 255 / 0.09)" strokeWidth="1" fill="none" />
          ))}
          {/* future GPU Cloud route (dashed) */}
          <path d={`M ${ROUTER.x + 118} ${ROUTER.y} C ${ROUTER.x + 170} ${ROUTER.y}, 492 ${ROUTER.y - 20}, 492 ${ROUTER.y - 52}`} stroke="#f5b455" strokeOpacity="0.35" strokeWidth="1" strokeDasharray="3 5" fill="none" />

          {/* highlighted route per cycle — each route owns one slot of a repeating period */}
          {active.map((idx, k) => (
            <path key={`hl-${k}`} d={curve(providers[idx]!)} stroke="#5cebc0" strokeWidth="1.4" fill="none" opacity="0">
              <animate
                attributeName="opacity"
                values="0;0.85;0.85;0;0"
                keyTimes={`0;${(0.08 * slot).toFixed(4)};${(0.85 * slot).toFixed(4)};${slot.toFixed(4)};1`}
                dur={`${total}s`}
                begin={`${k * cycle}s`}
                repeatCount="indefinite"
              />
            </path>
          ))}

          <g className="motion-reduce:hidden">
            {/* packets down the spine */}
            {[0, 0.8, 1.6].map((d) => (
              <circle key={`s-${d}`} r="3.2" fill="url(#rv-packet)" opacity="0">
                <animate attributeName="opacity" values="1;1" dur="2.4s" begin={`${d}s`} repeatCount="indefinite" />
                <animateMotion dur="2.4s" begin={`${d}s`} repeatCount="indefinite">
                  <mpath href="#rv-spine" />
                </animateMotion>
              </circle>
            ))}
            {/* one packet per slot travels to the chosen provider */}
            {active.map((idx, k) => (
              <circle key={`p-${k}`} r="3.4" fill="url(#rv-packet)" opacity="0">
                <animate attributeName="opacity" values="1;1;0;0" keyTimes={`0;${(0.9 * slot).toFixed(4)};${slot.toFixed(4)};1`} dur={`${total}s`} begin={`${k * cycle + 0.15}s`} repeatCount="indefinite" />
                <animateMotion dur={`${total}s`} begin={`${k * cycle + 0.15}s`} repeatCount="indefinite" keyPoints="0;1;1" keyTimes={`0;${(0.8 * slot).toFixed(4)};1`} calcMode="linear">
                  <mpath href={`#rv-route-${idx}`} />
                </animateMotion>
              </circle>
            ))}
          </g>
        </svg>

        <Node x={280} y={42}>
          <div className="glass flex items-center gap-3 rounded-lg px-3.5 py-2.5 shadow-lg">
            <div className="flex size-7 items-center justify-center rounded-md border border-border-strong bg-surface-2 font-mono text-[11px] text-fg-muted">{"{ }"}</div>
            <div className="leading-tight">
              <div className="text-[12.5px] font-medium text-fg">Your application</div>
              <div className="font-mono text-[10.5px] text-fg-subtle">POST /v1/chat/completions</div>
            </div>
          </div>
        </Node>

        <Node x={280} y={168}>
          <div className="panel hairline-top w-[330px] overflow-hidden rounded-xl px-4 py-3.5 shadow-glow">
            <div className="flex items-center gap-2.5">
              <LogoMark className="size-6" />
              <div className="text-[13.5px] font-semibold tracking-wide text-fg">INRENT API</div>
              <span className="ml-auto font-mono text-[10px] text-accent">api.inrent.ai/v1</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {["Auth", "Rate limits", "Credits", "Policy", "Logs"].map((c) => (
                <span key={c} className="rounded border border-border bg-bg-elevated px-1.5 py-0.5 font-mono text-[10px] text-fg-muted">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </Node>

        <Node x={ROUTER.x} y={ROUTER.y}>
          <div className="glass flex items-center gap-2.5 rounded-full px-3.5 py-2 shadow-lg">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-50 motion-reduce:hidden" />
              <span className="relative inline-flex size-2 rounded-full bg-accent" />
            </span>
            <span className="text-[12px] font-medium text-fg">Router</span>
            <span className="font-mono text-[10.5px] text-fg-subtle">balanced · fallback</span>
          </div>
        </Node>

        <Node x={492} y={ROUTER.y - 66}>
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-[rgb(245_180_85/0.4)] bg-bg/80 px-2 py-1">
            <span className="font-mono text-[10px] text-amber">GPU Cloud</span>
            <span className="rounded-full bg-amber-soft px-1.5 text-[9px] text-amber">soon</span>
          </div>
        </Node>

        {providers.map((p) => (
          <Node key={p.name} x={p.x} y={p.y}>
            <div className="flex w-[118px] items-center gap-2 rounded-lg border border-border bg-surface/90 px-2 py-1.5 shadow-md backdrop-blur">
              <span className="flex size-5 shrink-0 items-center justify-center rounded font-mono text-[10px] font-semibold" style={{ color: p.tint, background: `${p.tint}1a`, border: `1px solid ${p.tint}33` }}>
                {p.mono}
              </span>
              <span className="truncate text-[11px] text-fg-muted">{p.name}</span>
            </div>
          </Node>
        ))}
      </div>
      </ScaleToFit>
      <figcaption className="mt-2 text-center font-mono text-[10.5px] text-fg-subtle">Illustrative request flow · availability depends on each provider&apos;s configuration</figcaption>
    </figure>
  );
}
