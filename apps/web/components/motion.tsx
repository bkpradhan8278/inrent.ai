"use client";

import { domAnimation, LazyMotion, m, MotionConfig, useInView, animate } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";

/** Loads the small animation feature set lazily and honours prefers-reduced-motion. */
export function MotionProvider({ children }: { children: ReactNode }) {
  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}

/** Fades content up as it scrolls into view (once). */
export function Reveal({ children, delay = 0, className, y = 14 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </m.div>
  );
}

/** Animated counter for illustrative numbers (never presented as live metrics). */
export function CountUp({ to, decimals = 0, prefix = "", suffix = "", className }: { to: number; decimals?: number; prefix?: string; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!inView) return;
    const controls = animate(0, to, { duration: 1.4, ease: [0.22, 1, 0.36, 1], onUpdate: setValue });
    return () => controls.stop();
  }, [inView, to]);
  return (
    <span ref={ref} className={className}>
      {prefix}
      {value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
      {suffix}
    </span>
  );
}

export { m };
