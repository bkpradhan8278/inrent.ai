"use client";

import { useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

type Line = { kind: "cmd" | "out" | "ok" | "dim"; text: string };

const SCRIPT: Line[] = [
  { kind: "cmd", text: "npm install -g @inrent/cli" },
  { kind: "dim", text: "added 1 package" },
  { kind: "cmd", text: "inrent login" },
  { kind: "ok", text: "✓ API key saved to ~/.config/inrent/config.json (0600)" },
  { kind: "cmd", text: "inrent models search llama" },
  { kind: "out", text: "MODEL                         PROVIDERS   CONTEXT   STATUS" },
  { kind: "out", text: "meta/llama-3.3-70b-instruct   4           128K      byok" },
  { kind: "cmd", text: 'inrent test --model inrent/auto "Say hello"' },
  { kind: "out", text: "Hello! How can I help you today?" },
  { kind: "dim", text: "request_id=req_01J…  provider=…  fallbacks=0" },
  { kind: "cmd", text: "inrent gpu search" },
  { kind: "dim", text: "GPU Cloud is coming soon. Join the waitlist at inrent.ai/gpu" },
];

/** Deterministic typing animation of an example CLI session. */
export function Terminal() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const [visible, setVisible] = useState<number>(0);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!inView) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(SCRIPT.length);
      return;
    }
    let cancelled = false;
    (async () => {
      for (let i = 0; i < SCRIPT.length && !cancelled; i++) {
        const line = SCRIPT[i]!;
        if (line.kind === "cmd") {
          for (let c = 1; c <= line.text.length && !cancelled; c++) {
            setTyped(line.text.slice(0, c));
            await new Promise((r) => setTimeout(r, 22));
          }
          await new Promise((r) => setTimeout(r, 260));
        } else {
          await new Promise((r) => setTimeout(r, 140));
        }
        setTyped("");
        setVisible(i + 1);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inView]);

  const next = SCRIPT[visible];
  return (
    <div ref={ref} className="panel overflow-hidden rounded-xl">
      <div className="flex h-9 items-center gap-1.5 border-b border-border px-3.5">
        <span className="size-2.5 rounded-full bg-[#ff5f57]/80" />
        <span className="size-2.5 rounded-full bg-[#febc2e]/80" />
        <span className="size-2.5 rounded-full bg-[#28c840]/80" />
        <span className="ml-3 font-mono text-[11px] text-fg-subtle">example session</span>
      </div>
      <div className="h-[300px] overflow-x-auto overflow-y-hidden bg-[#07090c] p-4 font-mono text-[12.5px] leading-[1.75]" aria-label="Example INRENT CLI session" role="img">
        {SCRIPT.slice(0, visible).map((l, i) => (
          <div key={i} className={l.kind === "cmd" ? "text-fg" : l.kind === "ok" ? "text-accent" : l.kind === "dim" ? "text-fg-subtle" : "whitespace-pre text-fg-muted"}>
            {l.kind === "cmd" ? <span className="mr-2 text-accent">$</span> : null}
            {l.text}
          </div>
        ))}
        {next?.kind === "cmd" ? (
          <div className="text-fg">
            <span className="mr-2 text-accent">$</span>
            {typed}
            <span className="ml-0.5 inline-block h-4 w-[7px] translate-y-[3px] animate-blink bg-accent" />
          </div>
        ) : visible >= SCRIPT.length ? (
          <div>
            <span className="mr-2 text-accent">$</span>
            <span className="inline-block h-4 w-[7px] translate-y-[3px] animate-blink bg-accent" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
