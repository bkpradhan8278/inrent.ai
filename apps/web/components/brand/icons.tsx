import { cn } from "@/lib/utils";

/** Third-party marks used only on their own sign-in buttons, per their brand guidelines. */
export function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a10.9 10.9 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.8 1.19 1.83 1.19 3.09 0 4.42-2.69 5.39-5.26 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

export function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.66 4.1-5.5 4.1-3.31 0-6-2.74-6-6.2s2.69-6.2 6-6.2c1.88 0 3.15.8 3.87 1.49l2.64-2.54C16.84 3.2 14.65 2.2 12 2.2 6.6 2.2 2.2 6.6 2.2 12s4.4 9.8 9.8 9.8c5.66 0 9.41-3.98 9.41-9.58 0-.64-.07-1.13-.16-1.62H12Z" />
      <path fill="#34A853" d="M3.33 7.44l3.21 2.36C7.4 7.7 9.5 6.2 12 6.2c1.88 0 3.15.8 3.87 1.49l2.64-2.54C16.84 3.2 14.65 2.2 12 2.2 8.24 2.2 4.99 4.36 3.33 7.44Z" />
      <path fill="#FBBC05" d="M12 21.8c2.59 0 4.77-.86 6.36-2.33l-2.94-2.41c-.79.55-1.85.94-3.42.94-3.82 0-5.25-2.68-5.5-4.08l-3.2 2.47C4.95 19.6 8.2 21.8 12 21.8Z" />
      <path fill="#4285F4" d="M21.41 12.22c0-.64-.07-1.13-.16-1.62H12v3.9h5.5c-.27 1.39-1.08 2.47-2.08 3.15l2.94 2.41c1.72-1.59 3.05-3.92 3.05-7.84Z" />
    </svg>
  );
}

const VENDOR_TINT: Record<string, string> = {
  openai: "#9ce8cf",
  anthropic: "#e8b48f",
  google: "#8fb8ff",
  deepseek: "#8aa2ff",
  qwen: "#b59cff",
  zai: "#7fd1ff",
  mistral: "#ffb27a",
  meta: "#7fb2ff",
  xai: "#d6d9e0",
  moonshotai: "#c9b8ff",
  vllm: "#f5b455",
  inrent: "#5cebc0",
  cohere: "#ff9fb0",
  groq: "#ff9a7a",
};

/**
 * Vendor/provider → logo file in /public/brands (see ATTRIBUTION.md there). Logos are used only to
 * identify the vendor of a model or integration; they are trademarks of their respective owners.
 */
export const BRAND_LOGOS: Record<string, string> = {
  openai: "/brands/openai.png",
  anthropic: "/brands/anthropic.png",
  google: "/brands/gemini.png",
  gemini: "/brands/gemini.png",
  deepseek: "/brands/deepseek.png",
  qwen: "/brands/qwen.png",
  zai: "/brands/zai.png",
  mistral: "/brands/mistral.png",
  meta: "/brands/meta.png",
  xai: "/brands/xai.png",
  moonshotai: "/brands/moonshot.png",
  vllm: "/brands/vllm.png",
  cohere: "/brands/cohere.png",
  groq: "/brands/groq.png",
  github: "/brands/github.png",
  mcp: "/brands/mcp.png",
  slack: "/brands/slack.svg",
  notion: "/brands/notion.svg",
  postgres: "/brands/postgres.svg",
  "google-drive": "/brands/google-drive.svg",
};

/**
 * Logos drawn in white for dark backgrounds. In light mode they render black (the `logo-mono` rule
 * in globals.css), matching the dark-on-light versions these brands publish.
 */
const MONO_LOGOS = new Set(["openai", "anthropic", "xai", "zai", "groq", "moonshotai", "github", "mcp", "notion"]);

function logoClass(brand: string) {
  return MONO_LOGOS.has(brand) ? "logo-mono" : undefined;
}

/** Soft brand tint used for card glows and logo tiles. */
export const BRAND_TINT: Record<string, string> = {
  anthropic: "217 119 87",
  openai: "236 238 243",
  google: "71 150 227",
  deepseek: "77 107 254",
  meta: "0 129 251",
  qwen: "97 92 237",
  zai: "160 170 190",
  mistral: "250 82 15",
  xai: "220 222 228",
  moonshotai: "160 140 255",
  vllm: "245 180 85",
  cohere: "255 119 89",
  groq: "245 80 54",
  inrent: "92 235 192",
};

/** Plain logo image (no tile), for inline use in rows and chips. */
export function BrandLogo({ brand, size = 20, className }: { brand: string; size?: number; className?: string }) {
  const src = BRAND_LOGOS[brand];
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element -- tiny static brand marks; the optimizer adds nothing here.
  return <img src={src} alt="" width={size} height={size} loading="lazy" decoding="async" className={cn(logoClass(brand), className)} style={{ width: size, height: size, objectFit: "contain" }} aria-hidden />;
}

/** Vendor mark: the vendor's logo on a tinted tile, or a neutral monogram when we have no logo. */
export function VendorMark({ vendor, className }: { vendor: string; className?: string }) {
  const tint = VENDOR_TINT[vendor] ?? "#a3aab7";
  const src = BRAND_LOGOS[vendor];
  if (src) {
    return (
      <span
        className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border-strong overflow-hidden bg-[linear-gradient(180deg,var(--color-surface-3),var(--color-surface))]", className)}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static brand marks */}
        <img src={src} alt="" loading="lazy" decoding="async" className={cn("size-[64%] object-contain", logoClass(vendor))} />
      </span>
    );
  }
  const label = vendor === "zai" ? "Z" : vendor === "xai" ? "x" : vendor.slice(0, 1).toUpperCase();
  return (
    <span
      className={cn("inline-flex size-8 shrink-0 items-center justify-center rounded-md border font-mono text-[13px] font-semibold", className)}
      style={{ color: `color-mix(in oklab, ${tint} 62%, var(--color-fg))`, borderColor: `${tint}55`, background: `linear-gradient(180deg, ${tint}26, ${tint}0a)` }}
      aria-hidden
    >
      {label}
    </span>
  );
}
