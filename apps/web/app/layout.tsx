import type { Metadata, Viewport } from "next";
import { Inter, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { CommandPalette } from "@/components/command-palette-host";
import { MotionProvider } from "@/components/motion";
import { getDocsNav } from "@/lib/docs-structure";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const interTight = Inter_Tight({ subsets: ["latin"], variable: "--font-inter-tight", display: "swap", weight: ["500", "600", "700"] });
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
  themeColor: "#06070a",
  colorScheme: "dark",
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
    <html lang="en" className={`${inter.variable} ${interTight.variable} ${mono.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh bg-bg text-fg">
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
          Skip to content
        </a>
        <MotionProvider>{children}</MotionProvider>
        <CommandPalette docs={docs} />
        <Toaster theme="dark" position="bottom-right" toastOptions={{ classNames: { toast: "!bg-surface-2 !border-border-strong !text-fg" } }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      </body>
    </html>
  );
}
