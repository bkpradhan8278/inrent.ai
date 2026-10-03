import { AnthropicAdapter } from "./adapters/anthropic";
import { MockAdapter } from "./adapters/mock";
import { OpenAICompatibleAdapter } from "./adapters/openaiCompatible";
import type { ProviderAdapter, ProviderConfig } from "./types";

export interface AdapterFactoryOptions {
  /** Allow the mock adapter (development and tests only). */
  allowMock: boolean;
}

/** Creates the adapter for a provider configuration. New providers plug in here. */
export function createAdapter(config: ProviderConfig, opts: AdapterFactoryOptions): ProviderAdapter {
  switch (config.adapter) {
    case "OPENAI_COMPATIBLE":
    case "LITELLM":
      return new OpenAICompatibleAdapter(config);
    case "ANTHROPIC":
      return new AnthropicAdapter(config);
    case "MOCK":
      if (!opts.allowMock) throw new Error(`Mock provider '${config.slug}' is not allowed in this environment`);
      return new MockAdapter(config);
    default: {
      const exhaustive: never = config.adapter;
      throw new Error(`Unknown adapter ${String(exhaustive)}`);
    }
  }
}

/**
 * Resolves a credential reference like "env:OPENAI_API_KEY" to its secret value.
 * Other schemes (vault:, aws-sm:, gcp-sm:) are resolved by a pluggable SecretResolver so the
 * gateway can integrate a secret manager without touching business logic.
 */
export type SecretResolver = (ref: string) => string | null | Promise<string | null>;

export const envSecretResolver: SecretResolver = (ref) => {
  if (!ref.startsWith("env:")) return null;
  const value = process.env[ref.slice(4)];
  return value && value.trim() ? value.trim() : null;
};
