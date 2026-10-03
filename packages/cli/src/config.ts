import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface CliConfig {
  api_key?: string;
  base_url?: string;
  default_model?: string;
}

export const SETTABLE_KEYS = ["base_url", "default_model"] as const;
export type SettableKey = (typeof SETTABLE_KEYS)[number];

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  if (env.INRENT_CONFIG) return env.INRENT_CONFIG;
  const base = env.XDG_CONFIG_HOME || (process.platform === "win32" && env.APPDATA ? env.APPDATA : join(homedir(), ".config"));
  return join(base, "inrent", "config.json");
}

export function loadConfig(path: string): CliConfig {
  if (!existsSync(path)) return {};
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as CliConfig) : {};
  } catch {
    return {};
  }
}

/** Writes atomically with owner-only permissions (directory 0700, file 0600). */
export function saveConfig(path: string, config: CliConfig) {
  const dir = dirname(path);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, path);
  try {
    chmodSync(path, 0o600);
  } catch {
    /* non-POSIX filesystems */
  }
}

export function maskKey(key: string | undefined): string {
  if (!key) return "(not set)";
  return key.length > 18 ? `${key.slice(0, 14)}…${key.slice(-4)}` : "••••";
}

export interface ResolvedSettings {
  apiKey: string | undefined;
  apiKeySource: "flag" | "env" | "config" | "none";
  baseURL: string;
  defaultModel: string;
}

/** Precedence: command-line flag → environment → config file → defaults. */
export function resolveSettings(flags: { apiKey?: string; baseUrl?: string }, env: NodeJS.ProcessEnv, config: CliConfig): ResolvedSettings {
  const apiKey = flags.apiKey ?? env.INRENT_API_KEY ?? config.api_key;
  return {
    apiKey,
    apiKeySource: flags.apiKey ? "flag" : env.INRENT_API_KEY ? "env" : config.api_key ? "config" : "none",
    baseURL: (flags.baseUrl ?? env.INRENT_BASE_URL ?? config.base_url ?? "https://api.inrent.ai/v1").replace(/\/+$/, ""),
    defaultModel: config.default_model ?? "inrent/auto",
  };
}
