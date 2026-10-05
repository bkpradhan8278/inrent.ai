import type { Metadata, Viewport } from "next";
import { Funnel_Display, Geist, JetBrains_Mono } from "next/font/google";
import { CommandPalette } from "@/components/command-palette-host";
import { MotionProvider } from "@/components/motion";
import { ThemedToaster } from "@/components/theme";
import { getDocsNav } from "@/lib/docs-structure";
import { site } from "@/lib/site";
import { themeInitScript } from "@/lib/theme";
import "./globals.css";

const sans = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const display = Funnel_Display({ subsets: ["latin"], variable: "--font-funnel", display: "swap", weight: ["500", "600", "700"] });
// Code font: not preloaded (not needed for first paint; falls back to the system monospace).
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", preload: false });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "INRENT — One API. Every AI model.", template: "%s · INRENT" },
  description: site.description,
  applicationName: "INRENT",
  keywords: ["unified AI API", "OpenAI compatible API", "LLM API", "AI model API", "AI inference API", "LLM router", "AI gateway", "GPU cloud"],
  openGraph: {
    type: "website",
    siteName: "INRENT",
    title: "INRENT — One API. Every AI model.",
    description: site.description,
    url: site.url,
  },
  twitter: { card: "summary_large_image", title: "INRENT — One API. Every AI model.", description: site.description },
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  // No themeColor here: the theme init script (lib/theme.ts) owns <meta name="theme-color"> so it can
  // match the applied theme without React re-adding a server copy during hydration.
  colorScheme: "dark light",
  width: "device-width",
  initialScale: 1,
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", name: "INRENT", url: site.url, logo: `${site.url}/icon.svg` },
    { "@type": "WebSite", name: "INRENT", url: site.url },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const docs = getDocsNav().flatMap((s) => s.pages.map((p) => ({ title: p.title, href: p.href, section: s.title })));
  return (
    <html lang="en" data-theme="dark" className={`${sans.variable} ${display.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* Sets data-theme from the saved preference before first paint (no flash of the wrong theme). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-dvh bg-bg text-fg">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <CommandPalette docs={docs} />
        <ThemedToaster />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
