import { ImageResponse } from "next/og";

export const alt = "INRENT — One API. Every AI model.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(ellipse at 30% 0%, rgba(92,235,192,0.18), transparent 60%), #06070a", color: "#eceef3", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          {/* The LogoMark art (components/brand/logo.tsx), inlined: next/og renders plain SVG, not components. */}
          <svg width="56" height="56" viewBox="0 0 32 32">
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
                <stop offset="0" stopColor="#7ff5d3" />
                <stop offset="0.55" stopColor="#5cebc0" />
                <stop offset="1" stopColor="#8e96ff" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="30" height="30" rx="8" fill="url(#g)" />
            <rect x="1.5" y="1.5" width="29" height="29" rx="7.5" fill="none" stroke="#ffffff" strokeOpacity="0.35" />
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
          <div style={{ fontSize: 30, letterSpacing: 8, fontWeight: 700 }}>INRENT</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>One API.</div>
          <div style={{ fontSize: 88, fontWeight: 700, letterSpacing: -3, lineHeight: 1, color: "#5cebc0" }}>Every AI model.</div>
        </div>
        <div style={{ fontSize: 26, color: "#a3aab7" }}>Unified AI API · routing & fallback · billing · observability · GPU Cloud coming</div>
      </div>
    ),
    size,
  );
}
