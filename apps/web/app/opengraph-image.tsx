import { ImageResponse } from "next/og";

export const alt = "INRENT — One API. Every AI model.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "radial-gradient(ellipse at 30% 0%, rgba(92,235,192,0.18), transparent 60%), #06070a", color: "#eceef3", fontFamily: "sans-serif" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: "linear-gradient(135deg,#7ff5d3,#5cebc0 55%,#8e96ff)", display: "flex" }} />
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
