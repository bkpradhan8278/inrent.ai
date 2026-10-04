import type { ReactNode } from "react";
import Image from "next/image";

export function GitHubIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" /></svg>;
}

export function GoogleIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden="true"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.15.8 3.87 1.49l2.64-2.54C16.84 3.2 14.65 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.66 0 9.41-3.98 9.41-9.58 0-.64-.07-1.13-.16-1.62H12Z" /><path fill="#34A853" d="M3.33 7.44l3.21 2.36C7.4 7.7 9.5 6.2 12 6.2c1.88 0 3.15.8 3.87 1.49l2.64-2.54C16.84 3.2 14.65 2.2 12 2.2 8.24 2.2 4.99 4.36 3.33 7.44Z" /><path fill="#FBBC05" d="M12 21.8c2.59 0 4.77-.86 6.36-2.33l-2.94-2.41c-.79.55-1.85.94-3.42.94-3.82 0-5.25-2.68-5.5-4.08l-3.2 2.47C4.95 19.6 8.2 21.8 12 21.8Z" /><path fill="#4285F4" d="M21.41 12.22c0-.64-.07-1.13-.16-1.62H12v3.9h5.5c-.27 1.39-1.08 2.47-2.08 3.15l2.94 2.41c1.72-1.59 3.05-3.92 3.05-7.84Z" /></svg>;
}

const VENDOR_COLORS: Record<string, string> = {
  openai: "#74c7ad",
  anthropic: "#d58b5b",
  google: "#8ab4f8",
  deepseek: "#6aa8ff",
  qwen: "#8d7cff",
  zai: "#5aa9ff",
  mistral: "#ff9a55",
  meta: "#168bff",
  xai: "#e7e9ee",
  moonshotai: "#7c8cff",
  inrent: "#5cebc0",
  vllm: "#5cebc0",
  cohere: "#ff7759",
  groq: "#f55036",
};

const VENDOR_ASSETS: Record<string, string> = {
  openai: "openai.png",
  anthropic: "anthropic.png",
  google: "gemini.png",
  deepseek: "deepseek.png",
  qwen: "qwen.png",
  zai: "zai.png",
  mistral: "mistral.png",
  meta: "meta.png",
  moonshotai: "moonshotai.png",
  cohere: "cohere.png",
  groq: "groq.png",
};

function Mark({ children, className }: { children: ReactNode; className?: string }) {
  return <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">{children}</svg>;
}

function VendorGlyph({ vendor }: { vendor: string }) {
  switch (vendor) {
    case "openai":
      return <Mark className="size-[58%] text-current"><path d="M16 3.7a6.2 6.2 0 0 1 5.8 4l1.4.8a6.3 6.3 0 0 1 3.1 7.6 6.2 6.2 0 0 1-3.1 8.2 6.2 6.2 0 0 1-7.6 3.3 6.2 6.2 0 0 1-7.4-3.3 6.2 6.2 0 0 1-3-8.1 6.2 6.2 0 0 1 3-7.7A6.2 6.2 0 0 1 16 3.7Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/><path d="m11.4 8.4 9.2 5.2v8.2M8.1 14.3l7.9-4.6 7 4M11.5 23.6l.1-8.8 7.1-4.1m5.8 8.3-7.8 4.7-7.1-4m3.1 8.1v-9.4l7.3-4.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Mark>;
    case "anthropic":
      return <Mark className="size-[58%]"><path d="M16 3 18.7 12.5 27.2 7.4 21.8 15.1 31 16l-9.2 1.4 5.3 8.1-8.2-5.2L16 30l-2.6-9.7-8.1 5.4 5-8.5L1 16l9.3-1.2-5.1-7.8 8.2 5.1L16 3Z" fill="currentColor"/></Mark>;
    case "google":
      return <Mark className="size-[60%]"><path d="M16 3 18.8 12.8 29 16l-10.2 3.2L16 29l-3.2-9.8L3 16l9.8-3.2L16 3Z" fill="currentColor"/><path d="m25.5 3 .9 3.1 3.1.9-3.1 1-.9 3.1-1-3.1-3.1-1 3.1-.9 1-3.1Z" fill="currentColor"/></Mark>;
    case "deepseek":
      return <Mark className="size-[62%]"><path d="M5 18c2.3-7.8 7.1-12 12.7-10.8 4.6 1 7 5.2 8.4 9.3 1.2 3.5-1.2 6.8-4.7 6.8H10.8C7 23.3 4 21.4 5 18Z" fill="currentColor" opacity=".9"/><path d="M11 18c2.1-1.4 4.2-1.5 6.5.1M19.4 13.5h.1" stroke="#0b1019" strokeWidth="2.2" strokeLinecap="round"/></Mark>;
    case "qwen":
      return <Mark className="size-[61%]"><path d="M7 7h13a5 5 0 0 1 0 10H12a5 5 0 0 0 0 10h13" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/><path d="M7 7v7" stroke="currentColor" strokeWidth="4" strokeLinecap="round"/></Mark>;
    case "meta":
      return <Mark className="size-[67%]"><path d="M4 21c3-10 6-15 10-15 6 0 10 20 14 20 2 0 3-2 3-5 0-9-4-15-9-15-4 0-8 6-12 15-2 4-4 6-6 6-3 0-5-3-5-8 0-5 2-8 5-8" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"/></Mark>;
    case "mistral":
      return <Mark className="size-[60%]"><path d="M5 6h22v5H5zM5 13.5h15v5H5zM5 21h22v5H5z" fill="currentColor"/><path d="M21 13.5h6v5h-6z" fill="currentColor" opacity=".65"/></Mark>;
    case "zai":
      return <Mark className="size-[61%]"><path d="M6 8h20L9 24h17" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/></Mark>;
    case "inrent":
      return <Mark className="size-[58%]"><path d="M16 4 28 11v10l-12 7L4 21V11l12-7Z" stroke="currentColor" strokeWidth="2.5"/><path d="M10 16h12M16 10v12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></Mark>;
    default: {
      const letter = vendor === "xai" ? "x" : vendor.slice(0, 1).toUpperCase();
      return <span className="font-display text-[18px] font-semibold leading-none" aria-hidden="true">{letter}</span>;
    }
  }
}

/** Recognizable provider mark in a subtle, brand-tinted tile. */
export function VendorMark({ vendor, className }: { vendor: string; className?: string }) {
  const color = VENDOR_COLORS[vendor] ?? "#a3aab7";
  return (
    <span
      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgb(255_255_255/0.08)] ${className ?? ""}`}
      style={{ color, borderColor: `${color}44`, background: `linear-gradient(145deg, ${color}24, ${color}08 72%)` }}
      aria-hidden="true"
    >
      {VENDOR_ASSETS[vendor] ? <Image src={`/brands/${VENDOR_ASSETS[vendor]}`} width={40} height={40} alt="" className="size-[68%] object-contain" /> : <VendorGlyph vendor={vendor} />}
    </span>
  );
}

const MCP_COLORS: Record<string, string> = {
  github: "#f0f6fc",
  slack: "#e01e5a",
  notion: "#f5f5f5",
  google_drive: "#34a853",
  postgres: "#699eca",
  filesystem: "#a88cff",
  custom: "#5cebc0",
};

const MCP_ASSETS: Record<string, string> = {
  GITHUB: "github.svg",
  SLACK: "slack.svg",
  NOTION: "notion.svg",
  GOOGLE_DRIVE: "google_drive.svg",
  POSTGRES: "postgres.svg",
};

function McpGlyph({ kind }: { kind: string }) {
  if (kind === "FILESYSTEM") return <Mark className="size-[62%]"><path d="M4 9a2 2 0 0 1 2-2h8l3 3h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/><path d="M4 13h24" stroke="currentColor" strokeWidth="2.2"/></Mark>;
  return <Mark className="size-[62%]"><circle cx="7" cy="16" r="3" stroke="currentColor" strokeWidth="2.2"/><circle cx="24" cy="8" r="3" stroke="currentColor" strokeWidth="2.2"/><circle cx="24" cy="24" r="3" stroke="currentColor" strokeWidth="2.2"/><path d="m10 15 11-6M10 17l11 6" stroke="currentColor" strokeWidth="2.2"/></Mark>;
}

/** Integration logo for the MCP catalog and registered server lists. */
export function McpMark({ kind, className }: { kind: string; className?: string }) {
  const color = MCP_COLORS[kind.toLowerCase()] ?? "#5cebc0";
  return <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl border shadow-[inset_0_1px_0_rgb(255_255_255/0.1)] ${className ?? ""}`} style={{ color, borderColor: `${color}44`, background: `linear-gradient(145deg, ${color}20, ${color}07 72%)` }} aria-hidden="true">{MCP_ASSETS[kind] ? <Image src={`/brands/${MCP_ASSETS[kind]}`} width={30} height={30} alt="" className="size-[66%] object-contain" /> : <McpGlyph kind={kind} />}</span>;
}
