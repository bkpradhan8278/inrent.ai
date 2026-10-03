"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Renders fixed-size artwork (designed at width×height) and scales it uniformly to the
 * available width, so dense diagrams stay legible and never overflow on small screens.
 */
export function ScaleToFit({ width, height, children, className }: { width: number; height: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(Math.min(1, el.clientWidth / width));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  return (
    <div ref={ref} className={className} style={{ width: "100%", maxWidth: width, height: scale === null ? undefined : height * scale, aspectRatio: scale === null ? `${width} / ${height}` : undefined, overflow: "hidden", marginInline: "auto" }}>
      <div
        style={{
          width,
          height,
          transform: `scale(${scale ?? 1})`,
          transformOrigin: "top left",
          opacity: scale === null ? 0 : 1,
          transition: "opacity 0.3s ease",
        }}
      >
        {children}
      </div>
    </div>
  );
}
