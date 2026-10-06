import type { MetadataRoute } from "next";

// Raster icons come from scripts/generate-brand-assets.mjs; Android needs PNGs to install the app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "INRENT",
    short_name: "INRENT",
    description: "One API. Every AI model.",
    start_url: "/",
    display: "standalone",
    background_color: "#06070a",
    theme_color: "#06070a",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
