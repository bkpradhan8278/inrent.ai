import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * INRENT mark: a single origin node fanning out to three destinations —
 * "one API, every model". Drawn on a mint→iris tile.
 */
export function LogoMark({ className, title = "INRENT" }: { className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cn("size-7", className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id="inrent-tile" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#7ff5d3" />
          <stop offset="0.55" stopColor="#5cebc0" />
          <stop offset="1" stopColor="#8e96ff" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#inrent-tile)" />
      <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="rgb(255 255 255 / 0.35)" />
      <g fill="none" stroke="#03140e" strokeWidth="2.1" strokeLinecap="round">
        <path d="M10.5 16 C15 16 15.5 9.5 21 9.5" />
        <path d="M10.5 16 H21" />
        <path d="M10.5 16 C15 16 15.5 22.5 21 22.5" />
      </g>
      <circle cx="9.5" cy="16" r="3" fill="#03140e" />
      <circle cx="22.5" cy="9.5" r="2" fill="#03140e" />
      <circle cx="22.5" cy="16" r="2" fill="#03140e" />
      <circle cx="22.5" cy="22.5" r="2" fill="#03140e" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)} aria-label="INRENT home">
      <LogoMark className="transition-transform duration-300 group-hover:rotate-[-6deg]" />
      <span className="font-display text-[15px] font-semibold tracking-[0.16em] text-fg">INRENT</span>
    </Link>
  );
}
