import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return { name: "INRENT", short_name: "INRENT", description: "One API. Every AI model.", start_url: "/", display: "standalone", background_color: "#06070a", theme_color: "#06070a", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }] };
}
