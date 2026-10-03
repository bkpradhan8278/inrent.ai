import path from "node:path";
import type { NextConfig } from "next";

const monorepoRoot = path.resolve(process.cwd(), "../..");

// Local development keeps a single .env at the repository root.
try {
  process.loadEnvFile(path.join(monorepoRoot, ".env"));
} catch {
  /* no root .env (CI/production supply real environment variables) */
}

const isDev = process.env.NODE_ENV !== "production";
// HTTPS-only directives apply when the app is served over https (not for local production builds on http://localhost).
const servedOverHttps = (process.env.NEXT_PUBLIC_APP_URL ?? "https://inrent.ai").startsWith("https://");
const apiOrigin = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.inrent.ai/v1").origin;
  } catch {
    return "https://api.inrent.ai";
  }
})();

/**
 * Content Security Policy. Scripts are limited to our origin (inline allowed for Next.js
 * bootstrapping; a nonce-based policy is a documented hardening step). Framing is denied.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""} https://checkout.razorpay.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin} https://api.razorpay.com${isDev ? " ws: http://localhost:*" : ""}`,
  "frame-src https://checkout.razorpay.com https://api.razorpay.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  ...(servedOverHttps && !isDev ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(self)" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(servedOverHttps && !isDev ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }] : []),
];

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: monorepoRoot,
  turbopack: { root: monorepoRoot },
  poweredByHeader: false,
  reactStrictMode: true,
  outputFileTracingIncludes: { "/docs/**": ["./content/docs/**"] },
  transpilePackages: ["@inrent/core", "@inrent/db", "@inrent/services", "@inrent/providers", "@inrent/observability"],
  serverExternalPackages: ["@prisma/client", ".prisma/client", "ioredis", "bullmq", "pino", "stripe", "@opentelemetry/sdk-node"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async redirects() {
    return [
      { source: "/api", destination: "/docs/api-reference", permanent: false },
      { source: "/faq", destination: "/support#faq", permanent: false },
      { source: "/login", destination: "/sign-in", permanent: false },
      { source: "/signup", destination: "/sign-up", permanent: false },
    ];
  },
};

export default nextConfig;
