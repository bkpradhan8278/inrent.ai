const VENDOR_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  deepseek: "DeepSeek",
  qwen: "Qwen",
  zai: "Z.ai",
  mistral: "Mistral",
  meta: "Meta",
  xai: "xAI",
  moonshotai: "Moonshot AI",
  cohere: "Cohere",
  inrent: "INRENT (dev)",
};

export function vendorName(vendor: string): string {
  return VENDOR_NAMES[vendor] ?? vendor.charAt(0).toUpperCase() + vendor.slice(1);
}
