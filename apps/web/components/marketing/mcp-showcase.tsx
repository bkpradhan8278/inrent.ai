"use client";

import { FolderOpen } from "lucide-react";
import { useState } from "react";
import { BrandLogo } from "@/components/brand/icons";
import { cn } from "@/lib/utils";

/** Interactive preview of MCP tool approvals. Local UI state only — illustrative, not a live server. */

const TOOLS = [
  { id: "gh", brand: "github", name: "github.create_issue", note: "Needs an owner or admin", kind: "write" },
  { id: "no", brand: "notion", name: "notion.search", note: "Approved by Owner", kind: "read" },
  { id: "pg", brand: "postgres", name: "postgres.query", note: "Read-only SQL", kind: "read" },
  { id: "sl", brand: "slack", name: "slack.post_message", note: "Needs an owner or admin", kind: "write" },
] as const;

export function McpToolApprovals() {
  const [on, setOn] = useState<Record<string, boolean>>({ gh: false, no: true, pg: true, sl: false });
  const count = Object.values(on).filter(Boolean).length;
  return (
    <div className="overflow-hidden rounded-2xl border border-ink/[.08] bg-[linear-gradient(180deg,var(--color-card),var(--color-bg-elevated))]">
      <div className="flex items-center justify-between border-b border-ink/[.06] px-4 py-3 text-[13px]">
        <span className="font-semibold text-fg">Tool approvals</span>
        <span className="font-mono text-[11px] text-fg-subtle" aria-live="polite">
          {count} of {TOOLS.length} enabled
        </span>
      </div>
      {TOOLS.map((t) => {
        const enabled = !!on[t.id];
        return (
          <div key={t.id} className="flex items-center gap-3 border-b border-ink/[.05] px-4 py-[11px]">
            <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-ink/[.08] bg-bg">
              <BrandLogo brand={t.brand} size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-mono text-[13px] text-fg">{t.name}</div>
              <div className="text-[12px] text-fg-subtle">{t.note}</div>
            </div>
            <span className={cn("shrink-0 rounded-md px-2 py-[3px] font-mono text-[11px]", t.kind === "write" ? "bg-amber-soft text-amber" : "bg-accent/10 text-accent")}>{t.kind}</span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={`${enabled ? "Disable" : "Enable"} ${t.name}`}
              onClick={() => setOn((s) => ({ ...s, [t.id]: !s[t.id] }))}
              className={cn("relative h-[26px] w-11 shrink-0 rounded-full border transition-colors", enabled ? "border-accent/60 bg-accent" : "border-ink/[.12] bg-surface-3")}
            >
              <span className={cn("absolute top-[3px] size-[18px] rounded-full transition-[left,background] duration-300", enabled ? "left-[22px] bg-accent-fg" : "left-[3px] bg-fg-subtle")} />
            </button>
          </div>
        );
      })}
      <div className="px-4 py-2.5 text-[12px] text-fg-subtle">Control plane today · gateway-side tool execution is coming soon.</div>
    </div>
  );
}

const NODES = [
  { brand: "github", name: "GitHub", x: 50, y: 13.5, d: "0s", line: "M280 230 L280 62", c: "iris", pd: "0s" },
  { brand: "slack", name: "Slack", x: 82.5, y: 31.7, d: "-1.5s", line: "M280 230 L462 146", c: "iris", pd: ".6s" },
  { brand: "notion", name: "Notion", x: 82.5, y: 68.3, d: "-3s", line: "M280 230 L462 314", c: "accent", pd: "1.3s" },
  { brand: "postgres", name: "Postgres", x: 50, y: 86.5, d: "-4.5s", line: "M280 230 L280 398", c: "accent", pd: ".3s" },
  { brand: "google-drive", name: "Google Drive", x: 17.5, y: 68.3, d: "-2.2s", line: "M280 230 L98 314", c: "iris", pd: "1.7s" },
  { brand: "", name: "Filesystem", x: 17.5, y: 31.7, d: "-3.7s", line: "M280 230 L98 146", c: "accent", pd: "1s" },
];

export function McpHub() {
  return (
    <div className="mx-auto w-full max-w-[580px] [container-type:inline-size]">
      <div className="relative aspect-[560/460] w-full text-[2.857cqw]" role="img" aria-label="INRENT MCP hub connected to GitHub, Slack, Notion, Postgres, Google Drive and filesystem servers">
        <svg viewBox="0 0 560 460" className="absolute inset-0 size-full overflow-visible" aria-hidden>
          <ellipse cx="280" cy="230" rx="210" ry="168" fill="none" className="stroke-ink/5" strokeDasharray="2 6" />
          <ellipse cx="280" cy="230" rx="120" ry="96" fill="none" className="stroke-iris/12" />
          {NODES.map((n) => (
            <path key={`l-${n.name}`} d={n.line} className="stroke-ink/10" fill="none" />
          ))}
          {NODES.map((n) => (
            <path key={`p-${n.name}`} className={cn("pk-on", n.c === "accent" ? "stroke-accent" : "stroke-[#a8afff] light:stroke-iris")} d={n.line} strokeWidth="2.4" strokeLinecap="round" fill="none" style={{ animationDuration: "2.2s", animationDelay: n.pd }} />
          ))}
        </svg>
        <div className="absolute left-1/2 top-1/2 aspect-square w-[22%] -translate-x-1/2 -translate-y-1/2">
          <span className="ping-ring absolute inset-0 rounded-[28%] border border-iris/60" />
          <span className="ping-ring absolute inset-0 rounded-[28%] border border-accent/50 [animation-delay:1.3s]" />
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-[.3em] rounded-[28%] border border-iris/45 bg-[radial-gradient(circle_at_30%_20%,rgb(142_150_255/.3),var(--color-tile)_72%)] shadow-[0_0_0_6px_rgba(142,150,255,.06),0_30px_60px_-20px_rgba(142,150,255,.6)]">
            <BrandLogo brand="mcp" size={40} className="size-[42%]!" />
            <span className="font-mono text-[.5em] tracking-[.08em] text-[#c9cdff] light:text-iris">INRENT MCP</span>
          </div>
        </div>
        {NODES.map((n) => (
          <div key={n.name} className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: `${n.x}%`, top: `${n.y}%` }}>
            <div className="flex animate-float flex-col items-center gap-[.35em]" style={{ animationDelay: n.d }}>
              <span
                className={cn(
                  "inline-flex size-[3.3em] items-center justify-center rounded-[.9em] border shadow-[0_16px_32px_-14px_rgba(0,0,0,.9)] light:shadow-[0_12px_26px_-16px_rgb(15_23_42/.3)]",
                  n.brand ? "border-ink/[.12] bg-surface" : "border-[rgb(169_151_255/.4)] bg-[radial-gradient(circle_at_30%_20%,rgb(169_151_255/.35),var(--color-surface)_70%)] text-[#c4b8ff] light:text-iris",
                )}
              >
                {n.brand ? <BrandLogo brand={n.brand} size={28} className="size-[1.75em]!" /> : <FolderOpen className="size-[1.6em]" strokeWidth={1.8} />}
              </span>
              <span className="text-[.62em] text-[#c3c8d2] light:text-fg-muted">{n.name}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
