export const CAPABILITIES = {
  chat: "Chat",
  reasoning: "Reasoning",
  coding: "Coding",
  embedding: "Embeddings",
  tools: "Tool calling",
  structured_output: "Structured output",
  json_mode: "JSON mode",
  streaming: "Streaming",
  vision: "Vision",
  image_generation: "Image generation",
  audio: "Audio",
} as const;

export type Capability = keyof typeof CAPABILITIES;

export const MODALITIES = {
  text: "Text",
  image: "Image",
  audio: "Audio",
  video: "Video",
  embedding: "Embedding",
} as const;

export const MODEL_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Available",
  BETA: "Beta",
  PREVIEW: "Preview",
  DEPRECATED: "Deprecated",
  DISABLED: "Disabled",
};

export const VERIFICATION_LABEL: Record<string, string> = {
  VERIFIED: "Verified",
  NEEDS_REVIEW: "Needs review",
  RESTRICTED: "Restricted",
  DISABLED: "Disabled",
};

export function formatContextLength(tokens: number | null | undefined): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${+(tokens / 1_048_576).toFixed(tokens % 1_048_576 === 0 ? 0 : 1)}M`;
  if (tokens >= 1000) return `${Math.round(tokens / 1024)}K`;
  return String(tokens);
}

export const AUTO_MODEL_SLUG = "inrent/auto";

/** Splits "vendor/model" slugs; model ids may contain further slashes. */
export function splitModelSlug(slug: string): { vendor: string; name: string } {
  const idx = slug.indexOf("/");
  return idx === -1 ? { vendor: "", name: slug } : { vendor: slug.slice(0, idx), name: slug.slice(idx + 1) };
}
