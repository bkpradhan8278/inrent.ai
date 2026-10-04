/** Public site configuration. Endpoints come from the environment, never hard-coded in UI. */
export const site = {
  name: "INRENT",
  tagline: "One API. Every AI model.",
  description:
    "INRENT is a developer-first AI API platform: one OpenAI-compatible API for leading AI models, with unified billing, routing, observability and infrastructure.",
  url: process.env.NEXT_PUBLIC_APP_URL ?? "https://inrent.ai",
  apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "https://api.inrent.ai/v1",
  statusUrl: "/status",
  github: "https://github.com/bkpradhan8278/inrent.ai",
  supportEmail: "support@inrent.ai",
  securityEmail: "security@inrent.ai",
  salesEmail: "sales@inrent.ai",
} as const;

export type NavLink = { label: string; href: string; description?: string; badge?: string };

export const mainNav: Array<NavLink | { label: string; items: NavLink[] }> = [
  { label: "Models", href: "/models" },
  { label: "API", href: "/docs/api-reference" },
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
  { label: "Playground", href: "/playground" },
  { label: "GPU Cloud", href: "/gpu" },
  {
    label: "Solutions",
    items: [
      { label: "Unified AI API", href: "/solutions/unified-ai-api", description: "One integration for many model providers." },
      { label: "OpenAI-compatible API", href: "/solutions/openai-compatible-api", description: "Change the base URL, keep your code." },
      { label: "LLM routing & fallback", href: "/solutions/llm-routing", description: "Cost, latency and availability-aware routing." },
      { label: "AI agents & MCP", href: "/mcp", description: "Connect models to tools with guardrails." },
      { label: "Enterprise", href: "/enterprise", description: "Controls, budgets and dedicated options." },
    ],
  },
  {
    label: "Resources",
    items: [
      { label: "OpenAI Developers", href: "https://developers.openai.com/api/docs/", description: "Official OpenAI API docs and developer guides." },
      { label: "Changelog", href: "/changelog", description: "What shipped and when." },
      { label: "Roadmap", href: "/roadmap", description: "Where INRENT is going." },
      { label: "Status", href: "/status", description: "Live component status." },
      { label: "Support", href: "/support", description: "Docs, FAQ and contact." },
      { label: "Security", href: "/security", description: "How we protect your data." },
    ],
  },
];

export const footerNav: Array<{ title: string; links: NavLink[] }> = [
  {
    title: "Products",
    links: [
      { label: "API", href: "/docs/api-reference" },
      { label: "Models", href: "/models" },
      { label: "Playground", href: "/playground" },
      { label: "GPU Cloud", href: "/gpu", badge: "Soon" },
      { label: "MCP", href: "/mcp" },
      { label: "Agents", href: "/agents", badge: "Preview" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Docs", href: "/docs" },
      { label: "API Reference", href: "/docs/api-reference" },
      { label: "SDKs", href: "/docs/sdks" },
      { label: "CLI", href: "/docs/cli" },
      { label: "OpenAI Developers", href: "https://developers.openai.com/api/docs/" },
      { label: "GitHub", href: site.github },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Contact", href: "/contact" },
      { label: "Security", href: "/security" },
      { label: "Status", href: "/status" },
      { label: "Changelog", href: "/changelog" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Terms", href: "/terms" },
      { label: "Privacy", href: "/privacy" },
      { label: "Acceptable Use", href: "/acceptable-use" },
      { label: "Cookies", href: "/cookies" },
      { label: "DPA", href: "/dpa" },
    ],
  },
];
