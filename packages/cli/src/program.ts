import { Command, CommanderError, Option } from "commander";
import { Inrent, InrentError, type ChatMessage, type Model } from "@inrent/sdk";
import { configPath as defaultConfigPath, loadConfig, maskKey, resolveSettings, saveConfig, SETTABLE_KEYS, type CliConfig, type SettableKey } from "./config";
import { colors, compact, context, ms, perMillion, table, usd } from "./format";
import type { Io } from "./io";

export const CLI_VERSION = "0.1.0";
const WAITLIST_URL = "https://inrent.ai/gpu";
const KEY_PATTERN = /^sk-inrent-(dev|stg|prod)-[A-Za-z0-9]{20,}$/;

export interface CliDeps {
  io: Io;
  env: NodeJS.ProcessEnv;
  configPath?: string;
  fetch?: (input: string, init?: RequestInit) => Promise<Response>;
}

/** Exit with a code after printing a message (used instead of process.exit for testability). */
class CliExit extends Error {
  constructor(readonly code: number) {
    super(`exit ${code}`);
  }
}

interface GlobalOpts {
  json?: boolean;
  apiKey?: string;
  baseUrl?: string;
  color?: boolean;
}

export async function run(argv: string[], deps: CliDeps): Promise<number> {
  const { io, env } = deps;
  const cfgPath = deps.configPath ?? defaultConfigPath(env);
  const program = new Command();

  program
    .name("inrent")
    .description("INRENT command-line interface — models, keys, usage and test requests.")
    .version(CLI_VERSION, "-v, --version")
    .option("--json", "machine-readable JSON output")
    .option("--api-key <key>", "API key (overrides INRENT_API_KEY and saved credentials)")
    .option("--base-url <url>", "API base URL (overrides INRENT_BASE_URL)")
    .option("--no-color", "disable colors")
    .showHelpAfterError()
    .exitOverride()
    .configureOutput({ writeOut: io.stdout, writeErr: io.stderr });

  const g = (cmd: Command) => cmd.optsWithGlobals<GlobalOpts>();
  const c = (cmd: Command) => colors(g(cmd).color !== false && !env.NO_COLOR && io.interactive);
  const config = () => loadConfig(cfgPath);
  const settings = (cmd: Command) => resolveSettings({ apiKey: g(cmd).apiKey, baseUrl: g(cmd).baseUrl }, env, config());
  const print = (s: string) => io.stdout(s.endsWith("\n") ? s : `${s}\n`);
  const printJson = (v: unknown) => print(JSON.stringify(v, null, 2));
  const client = (cmd: Command, opts: { requireKey?: boolean } = {}) => {
    const s = settings(cmd);
    if (!s.apiKey) {
      if (opts.requireKey === false) return new Inrent({ apiKey: "anonymous", baseURL: s.baseURL, fetch: deps.fetch, maxRetries: 1 });
      io.stderr(`${c(cmd).red("Not logged in.")} Run ${c(cmd).bold("inrent login")} or set INRENT_API_KEY.\n`);
      throw new CliExit(1);
    }
    return new Inrent({ apiKey: s.apiKey, baseURL: s.baseURL, fetch: deps.fetch, maxRetries: 1 });
  };

  /** Wraps an action with consistent error output. */
  const action =
    <A extends unknown[]>(fn: (...args: A) => Promise<void>) =>
    async (...args: A) => {
      const cmd = args[args.length - 1] as Command;
      try {
        await fn(...args);
      } catch (e) {
        if (e instanceof CliExit || e instanceof CommanderError) throw e;
        const col = c(cmd);
        if (e instanceof InrentError) {
          if (g(cmd).json) printJson({ error: { status: e.status, code: e.code, type: e.type, message: e.message, request_id: e.requestId } });
          else {
            io.stderr(`${col.red("Error:")} ${e.message}\n`);
            io.stderr(col.dim(`  ${[e.status ? `status ${e.status}` : null, e.code, e.requestId ? `request ${e.requestId}` : null].filter(Boolean).join(" · ")}\n`));
            if (e.status === 401) io.stderr(col.dim(`  Check your key with ${col.bold("inrent status")} or log in again.\n`));
            if (e.code === "insufficient_credits") io.stderr(col.dim("  Add credits at https://inrent.ai/dashboard/billing\n"));
          }
          throw new CliExit(1);
        }
        io.stderr(`${col.red("Error:")} ${e instanceof Error ? e.message : String(e)}\n`);
        throw new CliExit(1);
      }
    };

  // ── Auth & config ─────────────────────────────────────────────────────────

  program
    .command("login")
    .description("save an API key to the local config (0600)")
    .option("--key <key>", "API key (prefer the interactive prompt or stdin to keep it out of shell history)")
    .option("--no-verify", "skip verifying the key with the API")
    .action(
      action(async (opts: { key?: string; verify: boolean }, cmd: Command) => {
        const col = c(cmd);
        let key = opts.key?.trim();
        if (!key) {
          if (io.interactive) {
            print(col.dim("Create a key at https://inrent.ai/dashboard/keys"));
            key = (await io.prompt("API key: ", { hidden: true })).trim();
          } else {
            key = (await io.readStdin()).trim();
          }
        } else if (io.interactive) {
          io.stderr(col.yellow("Warning: keys passed with --key can end up in your shell history.\n"));
        }
        if (!key) {
          io.stderr(`${col.red("No key provided.")}\n`);
          throw new CliExit(1);
        }
        if (!KEY_PATTERN.test(key)) {
          io.stderr(`${col.red("That doesn't look like an INRENT API key")} (expected sk-inrent-dev-…, sk-inrent-stg-… or sk-inrent-prod-…).\n`);
          throw new CliExit(1);
        }
        const s = settings(cmd);
        let info: Awaited<ReturnType<Inrent["keys"]["current"]>> | null = null;
        if (opts.verify) info = await new Inrent({ apiKey: key, baseURL: s.baseURL, fetch: deps.fetch, maxRetries: 1 }).keys.current();
        const cfg: CliConfig = { ...config(), api_key: key, ...(g(cmd).baseUrl ? { base_url: s.baseURL } : {}) };
        saveConfig(cfgPath, cfg);
        if (g(cmd).json) return printJson({ ok: true, config_path: cfgPath, key: info ? { name: info.name, environment: info.environment, project: info.project.name } : null });
        print(`${col.green("✓")} Saved credentials to ${cfgPath}`);
        if (info) print(`  Key ${col.bold(info.name)} (${info.environment}) · project ${info.project.name} · balance ${usd(info.balance_usd)}`);
        if (s.apiKeySource === "env") print(col.dim("  Note: INRENT_API_KEY is set and takes precedence over the saved key."));
      }),
    );

  program
    .command("logout")
    .description("remove the saved API key")
    .action(
      action(async (_opts: unknown, cmd: Command) => {
        const cfg = config();
        const had = Boolean(cfg.api_key);
        delete cfg.api_key;
        saveConfig(cfgPath, cfg);
        if (g(cmd).json) return printJson({ ok: true, removed: had });
        print(had ? `${c(cmd).green("✓")} Logged out.` : "No saved key.");
        if (env.INRENT_API_KEY) print(c(cmd).dim("INRENT_API_KEY is still set in your environment."));
      }),
    );

  const configCmd = program
    .command("config")
    .description("show or edit configuration")
    .action(
      action(async (_opts: unknown, cmd: Command) => {
        const s = settings(cmd);
        const view = { config_path: cfgPath, base_url: s.baseURL, default_model: s.defaultModel, api_key: maskKey(s.apiKey), api_key_source: s.apiKeySource };
        if (g(cmd).json) return printJson(view);
        print(table(["SETTING", "VALUE"], Object.entries(view).map(([k, v]) => [k, String(v)]), { dim: c(cmd).dim }));
      }),
    );
  configCmd
    .command("get <key>")
    .description(`print a setting (${SETTABLE_KEYS.join(", ")})`)
    .action(
      action(async (key: string, _opts: unknown, cmd: Command) => {
        if (!SETTABLE_KEYS.includes(key as SettableKey)) {
          io.stderr(`Unknown setting '${key}'. Available: ${SETTABLE_KEYS.join(", ")}\n`);
          throw new CliExit(1);
        }
        const s = settings(cmd);
        const value = key === "base_url" ? s.baseURL : s.defaultModel;
        if (g(cmd).json) return printJson({ [key]: value });
        print(value);
      }),
    );
  configCmd
    .command("set <key> <value>")
    .description(`change a setting (${SETTABLE_KEYS.join(", ")}); use \`inrent login\` for the API key`)
    .action(
      action(async (key: string, value: string, _opts: unknown, cmd: Command) => {
        if (!SETTABLE_KEYS.includes(key as SettableKey)) {
          io.stderr(`Unknown setting '${key}'. Available: ${SETTABLE_KEYS.join(", ")}${key === "api_key" ? " (use `inrent login`)" : ""}\n`);
          throw new CliExit(1);
        }
        if (key === "base_url") {
          try {
            const u = new URL(value);
            if (u.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(u.hostname)) throw new Error("insecure");
          } catch {
            io.stderr("base_url must be an https:// URL (http is allowed for localhost).\n");
            throw new CliExit(1);
          }
        }
        saveConfig(cfgPath, { ...config(), [key]: value.replace(/\/+$/, "") });
        if (g(cmd).json) return printJson({ ok: true, [key]: value });
        print(`${c(cmd).green("✓")} ${key} = ${value}`);
      }),
    );

  program
    .command("status")
    .description("API health and the status of your key")
    .action(
      action(async (_opts: unknown, cmd: Command) => {
        const col = c(cmd);
        const s = settings(cmd);
        const healthUrl = `${s.baseURL.replace(/\/v1$/, "")}/health`;
        const started = Date.now();
        let health: { ok: boolean; latencyMs: number; error?: string };
        try {
          const r = await (deps.fetch ?? fetch)(healthUrl, { signal: AbortSignal.timeout(10_000) });
          health = { ok: r.ok, latencyMs: Date.now() - started };
        } catch (e) {
          health = { ok: false, latencyMs: Date.now() - started, error: e instanceof Error ? e.message : String(e) };
        }
        let key: Awaited<ReturnType<Inrent["keys"]["current"]>> | null = null;
        let keyError: string | null = null;
        if (s.apiKey) {
          try {
            key = await client(cmd).keys.current();
          } catch (e) {
            keyError = e instanceof InrentError ? `${e.code}: ${e.message}` : String(e);
          }
        }
        if (g(cmd).json) {
          printJson({ api: { url: s.baseURL, healthy: health.ok, latency_ms: health.latencyMs, error: health.error ?? null }, key: key ?? null, key_error: keyError, key_source: s.apiKeySource });
        } else {
          print(`${col.bold("API")}      ${s.baseURL}  ${health.ok ? col.green("● healthy") : col.red("● unreachable")}  ${col.dim(`${health.latencyMs}ms`)}`);
          if (!s.apiKey) print(`${col.bold("Key")}      ${col.yellow("not configured")} — run ${col.bold("inrent login")}`);
          else if (keyError) print(`${col.bold("Key")}      ${col.red(keyError)}`);
          else if (key) {
            print(`${col.bold("Key")}      ${key.name} ${col.dim(`(${key.prefix}…, ${key.environment}, from ${s.apiKeySource})`)}`);
            print(`${col.bold("Project")}  ${key.project.name}`);
            print(`${col.bold("Balance")}  ${usd(key.balance_usd)}   ${col.dim(`spent with this key ${usd(key.usage.spent_usd)}`)}`);
            print(`${col.bold("Limits")}   ${key.limits.rpm} rpm · ${compact(key.limits.tpm)} tpm${key.limits.spend_limit_usd ? ` · spend limit ${usd(key.limits.spend_limit_usd)}` : ""}`);
            print(`${col.bold("Scopes")}   ${key.permissions.join(", ")}`);
          }
        }
        if (!health.ok || keyError) throw new CliExit(1);
      }),
    );

  // ── Models ────────────────────────────────────────────────────────────────

  const availabilityLabel = (m: Model, col: ReturnType<typeof c>) => (m.availability === "platform" ? col.green("platform") : m.availability === "byok" ? col.cyan("byok") : col.dim("unavailable"));
  const modelRows = (list: Model[], col: ReturnType<typeof c>) =>
    list.map((m) => [m.id, availabilityLabel(m, col), m.providers.length ? String(m.providers.length) : "—", context(m.context_length), perMillion(m.pricing?.input), perMillion(m.pricing?.output), m.status]);
  const modelHeaders = ["MODEL", "AVAILABILITY", "PROVIDERS", "CONTEXT", "INPUT/1M", "OUTPUT/1M", "STATUS"];

  const listModels = action(async (opts: { available?: boolean; capability?: string }, cmd: Command) => {
    const res = await client(cmd, { requireKey: false }).models.list();
    let list = res.data;
    if (opts.available) list = list.filter((m) => m.availability !== "unavailable");
    if (opts.capability) list = list.filter((m) => m.capabilities.includes(opts.capability!));
    if (g(cmd).json) return printJson(list);
    print(table(modelHeaders, modelRows(list, c(cmd)), { right: [2, 3, 4, 5], dim: c(cmd).dim }));
    print(c(cmd).dim(`\n${list.length} models · prices are per 1M tokens and appear once verified · byok = needs your provider key`));
  });
  const models = program.command("models").description("browse the model catalog").option("--available", "only models you can call now").option("--capability <name>", "filter by capability (chat, tools, vision, embeddings…)").action(listModels);
  models.command("list").description("list models with availability and prices").option("--available", "only models you can call now").option("--capability <name>", "filter by capability").action(listModels);
  models
    .command("search <query>")
    .description("search the catalog by id, name or description")
    .action(
      action(async (query: string, _opts: unknown, cmd: Command) => {
        const q = query.toLowerCase();
        const list = (await client(cmd, { requireKey: false }).models.list()).data.filter((m) => [m.id, m.name, m.description, m.owned_by, ...m.capabilities].some((f) => f?.toLowerCase().includes(q)));
        if (g(cmd).json) return printJson(list);
        if (!list.length) return print(`No models match '${query}'.`);
        print(table(modelHeaders, modelRows(list, c(cmd)), { right: [2, 3, 4, 5], dim: c(cmd).dim }));
      }),
    );
  models
    .command("info <model>")
    .description("show details for one model")
    .action(
      action(async (id: string, _opts: unknown, cmd: Command) => {
        const m = await client(cmd, { requireKey: false }).models.retrieve(id);
        if (g(cmd).json) return printJson(m);
        const col = c(cmd);
        print(`${col.bold(m.name)}  ${col.dim(m.id)}`);
        if (m.description) print(m.description);
        print("");
        print(
          table(
            ["FIELD", "VALUE"],
            [
              ["availability", availabilityLabel(m, col)],
              ["status", m.status],
              ["context", context(m.context_length)],
              ["capabilities", m.capabilities.join(", ") || "—"],
              ["input / 1M", perMillion(m.pricing?.input)],
              ["output / 1M", perMillion(m.pricing?.output)],
              ["providers", m.providers.join(", ") || "—"],
            ],
            { dim: col.dim },
          ),
        );
      }),
    );

  // ── Keys ──────────────────────────────────────────────────────────────────

  const listKeys = action(async (opts: { all?: boolean }, cmd: Command) => {
    const res = await client(cmd).keys.list({ includeRevoked: opts.all });
    if (g(cmd).json) return printJson(res.data);
    const col = c(cmd);
    print(
      table(
        ["ID", "NAME", "KEY", "ENV", "PROJECT", "LAST USED", "STATUS"],
        res.data.map((k) => [k.id, k.name, `${k.prefix}…${k.last_four ?? ""}`, k.environment, k.project?.name ?? "—", k.last_used_at ? new Date(k.last_used_at).toISOString().slice(0, 16).replace("T", " ") : "never", k.revoked_at ? col.red("revoked") : col.green("active")]),
        { dim: col.dim },
      ),
    );
  });
  const keys = program.command("keys").description("manage API keys (needs keys:read / keys:write)").option("--all", "include revoked keys").action(listKeys);
  keys.command("list").description("list keys").option("--all", "include revoked keys").action(listKeys);
  keys
    .command("create")
    .description("create a key — the secret is shown once")
    .requiredOption("--name <name>", "key name")
    .addOption(new Option("--env <environment>", "environment").choices(["development", "staging", "production"]).default("development"))
    .option("--permissions <list>", "comma-separated: inference,keys:read,keys:write,usage:read,logs:read", "inference")
    .option("--models <list>", "comma-separated allowed model slugs")
    .option("--spend-limit <usd>", "lifetime spend limit in USD")
    .option("--rpm <n>", "requests per minute", (v) => Number.parseInt(v, 10))
    .option("--tpm <n>", "tokens per minute", (v) => Number.parseInt(v, 10))
    .option("--expires <date>", "expiry date (YYYY-MM-DD)")
    .action(
      action(async (opts: { name: string; env: "development" | "staging" | "production"; permissions: string; models?: string; spendLimit?: string; rpm?: number; tpm?: number; expires?: string }, cmd: Command) => {
        const split = (v?: string) => (v ? v.split(",").map((s) => s.trim()).filter(Boolean) : undefined);
        const created = await client(cmd).keys.create({
          name: opts.name,
          environment: opts.env,
          permissions: split(opts.permissions) as Parameters<Inrent["keys"]["create"]>[0]["permissions"],
          allowed_models: split(opts.models),
          spend_limit_usd: opts.spendLimit,
          rpm_limit: opts.rpm,
          tpm_limit: opts.tpm,
          expires_at: opts.expires ? new Date(`${opts.expires}T23:59:59Z`).toISOString() : undefined,
        });
        if (g(cmd).json) return printJson(created);
        const col = c(cmd);
        print(`${col.green("✓")} Created ${col.bold(created.name)} (${created.environment})`);
        print("");
        print(`  ${col.bold(created.key)}`);
        print("");
        print(col.yellow("Store this key now — it will not be shown again."));
      }),
    );
  keys
    .command("revoke <id>")
    .description("revoke a key immediately")
    .option("-y, --yes", "skip confirmation")
    .action(
      action(async (id: string, opts: { yes?: boolean }, cmd: Command) => {
        if (!opts.yes) {
          if (!io.interactive) {
            io.stderr("Refusing to revoke without confirmation. Pass --yes in non-interactive use.\n");
            throw new CliExit(1);
          }
          const answer = (await io.prompt(`Revoke key ${id}? Requests using it will fail immediately. [y/N] `)).trim().toLowerCase();
          if (answer !== "y" && answer !== "yes") return print("Cancelled.");
        }
        const r = await client(cmd).keys.revoke(id);
        if (g(cmd).json) return printJson(r);
        print(`${c(cmd).green("✓")} Revoked ${id}`);
      }),
    );

  // ── Usage & logs ──────────────────────────────────────────────────────────

  program
    .command("usage")
    .description("usage summary (needs usage:read)")
    .option("--days <n>", "window in days (1–90)", (v) => Number.parseInt(v, 10), 30)
    .action(
      action(async (opts: { days: number }, cmd: Command) => {
        const u = await client(cmd).usage.retrieve({ days: opts.days });
        if (g(cmd).json) return printJson(u);
        const col = c(cmd);
        const t = u.totals;
        print(`${col.bold(`Last ${u.days} days`)}${u.demo_data ? col.yellow("  (includes demo data)") : ""}`);
        print(`  Spend     ${usd(t.spend_usd)}      Balance ${usd(u.balance_usd)}`);
        print(`  Requests  ${compact(t.requests)}   errors ${(t.errorRate * 100).toFixed(1)}%   fallbacks ${(t.fallbackRate * 100).toFixed(1)}%`);
        print(`  Tokens    ${compact(t.inputTokens)} in · ${compact(t.outputTokens)} out`);
        print(`  Latency   avg ${ms(t.avgLatencyMs)} · p95 ${ms(t.p95LatencyMs)} · TTFT ${ms(t.avgTtftMs)}`);
        if (u.by_model.length) {
          print("");
          print(table(["MODEL", "REQUESTS", "TOKENS", "SPEND"], u.by_model.map((m) => [m.model, compact(m.requests), compact(m.tokens), usd(m.spend_usd, 4)]), { right: [1, 2, 3], dim: col.dim }));
        }
      }),
    );

  program
    .command("logs [requestId]")
    .description("recent requests, or one request's details (needs logs:read)")
    .option("--limit <n>", "number of requests (max 200)", (v) => Number.parseInt(v, 10), 20)
    .addOption(new Option("--status <status>", "filter by status").choices(["success", "error", "cancelled"]))
    .option("--model <slug>", "filter by model")
    .action(
      action(async (requestId: string | undefined, opts: { limit: number; status?: "success" | "error" | "cancelled"; model?: string }, cmd: Command) => {
        const col = c(cmd);
        if (requestId) {
          const r = await client(cmd).requests.retrieve(requestId);
          if (g(cmd).json) return printJson(r);
          print(`${col.bold(r.request_id)}  ${r.status === "success" ? col.green(r.status) : col.red(r.status)}  ${col.dim(r.created_at)}`);
          print(
            table(
              ["FIELD", "VALUE"],
              [
                ["model", `${r.model ?? r.model_requested}${r.model && r.model !== r.model_requested ? col.dim(` (requested ${r.model_requested})`) : ""}`],
                ["provider", `${r.provider ?? "—"} · ${r.billing_mode}`],
                ["tokens", `${r.usage.input_tokens} in · ${r.usage.output_tokens} out${r.usage.estimated ? " (estimated)" : ""}`],
                ["cost", usd(r.cost_usd)],
                ["latency", `${ms(r.latency_ms)} · TTFT ${ms(r.ttft_ms)}`],
                ...(r.error ? [["error", `${r.http_status} ${r.error.code ?? ""} — ${r.error.message ?? ""}`]] : []),
              ],
              { dim: col.dim },
            ),
          );
          return;
        }
        const res = await client(cmd).requests.list({ limit: Math.min(Math.max(opts.limit, 1), 200), status: opts.status, model: opts.model });
        if (g(cmd).json) return printJson(res.data);
        print(
          table(
            ["TIME", "REQUEST", "MODEL", "PROVIDER", "STATUS", "TOKENS", "COST", "LATENCY"],
            res.data.map((r) => [new Date(r.created_at).toISOString().slice(5, 19).replace("T", " "), r.request_id, r.model, r.provider ?? "—", r.status === "success" ? col.green("ok") : col.red(`${r.http_status} ${r.error_code ?? r.status}`), compact(r.input_tokens + r.output_tokens), usd(r.cost_usd), ms(r.latency_ms)]),
            { right: [5, 6, 7], dim: col.dim },
          ),
        );
      }),
    );

  // ── Requests ──────────────────────────────────────────────────────────────

  program
    .command("test <prompt...>")
    .description("send a test request and print timing, tokens and cost")
    .option("-m, --model <slug>", "model (default: config default_model or inrent/auto)")
    .option("-s, --system <text>", "system prompt")
    .option("--max-tokens <n>", "max output tokens", (v) => Number.parseInt(v, 10), 256)
    .option("--no-stream", "wait for the full response")
    .action(
      action(async (promptParts: string[], opts: { model?: string; system?: string; maxTokens: number; stream: boolean }, cmd: Command) => {
        const col = c(cmd);
        const model = opts.model ?? settings(cmd).defaultModel;
        const messages: ChatMessage[] = [...(opts.system ? [{ role: "system" as const, content: opts.system }] : []), { role: "user", content: promptParts.join(" ") }];
        const api = client(cmd);
        const started = performance.now();
        if (!opts.stream || g(cmd).json) {
          const r = await api.chat.completions.create({ model, messages, max_tokens: opts.maxTokens });
          const latency = Math.round(performance.now() - started);
          if (g(cmd).json) return printJson({ response: r, meta: r._meta, latency_ms: latency });
          print(r.choices[0]?.message.content ?? "");
          print(col.dim(`\n${[r._meta.model ?? r.model, r._meta.provider, ms(latency), r.usage ? `${r.usage.prompt_tokens}→${r.usage.completion_tokens} tokens` : null, r._meta.costUsd ? usd(r._meta.costUsd) : null, r._meta.requestId].filter(Boolean).join(" · ")}`));
          return;
        }
        const stream = await api.chat.completions.create({ model, messages, max_tokens: opts.maxTokens, stream: true });
        let ttft: number | null = null;
        let usage: { prompt_tokens: number; completion_tokens: number } | null = null;
        let servedModel: string | null = null;
        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta.content;
          if (delta) {
            if (ttft === null) ttft = Math.round(performance.now() - started);
            io.stdout(delta);
          }
          if (chunk.usage) usage = chunk.usage;
          servedModel ??= chunk.model;
        }
        const total = Math.round(performance.now() - started);
        io.stdout("\n");
        print(col.dim(`\n${[stream._meta.model ?? servedModel ?? model, stream._meta.provider, `TTFT ${ms(ttft)}`, `total ${ms(total)}`, usage ? `${usage.prompt_tokens}→${usage.completion_tokens} tokens` : null, stream._meta.requestId].filter(Boolean).join(" · ")}`));
      }),
    );

  program
    .command("playground")
    .description("interactive chat in your terminal (/exit, /clear, /model <slug>)")
    .option("-m, --model <slug>", "model")
    .option("-s, --system <text>", "system prompt")
    .action(
      action(async (opts: { model?: string; system?: string }, cmd: Command) => {
        const col = c(cmd);
        if (!io.interactive) {
          io.stderr("The playground needs an interactive terminal. Use `inrent test` for scripts.\n");
          throw new CliExit(1);
        }
        const api = client(cmd);
        let model = opts.model ?? settings(cmd).defaultModel;
        let history: ChatMessage[] = opts.system ? [{ role: "system", content: opts.system }] : [];
        print(col.dim(`Chatting with ${model}. Commands: /model <slug>, /clear, /exit`));
        for (;;) {
          const line = (await io.prompt(col.cyan("› "))).trim();
          if (!line) continue;
          if (line === "/exit" || line === "/quit") break;
          if (line === "/clear") {
            history = opts.system ? [{ role: "system", content: opts.system }] : [];
            print(col.dim("History cleared."));
            continue;
          }
          if (line.startsWith("/model")) {
            const next = line.split(/\s+/)[1];
            if (next) model = next;
            print(col.dim(`Model: ${model}`));
            continue;
          }
          history.push({ role: "user", content: line });
          try {
            const stream = await api.chat.completions.create({ model, messages: history, stream: true });
            let text = "";
            for await (const chunk of stream) {
              const d = chunk.choices[0]?.delta.content;
              if (d) {
                text += d;
                io.stdout(d);
              }
            }
            io.stdout("\n");
            history.push({ role: "assistant", content: text });
            print(col.dim(`${stream._meta.provider ?? ""} ${stream._meta.requestId ?? ""}`.trim()));
          } catch (e) {
            history.pop();
            io.stderr(`${col.red("Error:")} ${e instanceof Error ? e.message : String(e)}\n`);
          }
        }
      }),
    );

  // ── Coming soon (shown honestly; nothing is provisioned) ─────────────────────

  const comingSoon = (what: string) =>
    action(async (...args: unknown[]) => {
      const cmd = args[args.length - 1] as Command;
      if (g(cmd).json) printJson({ available: false, feature: what, waitlist: WAITLIST_URL });
      else io.stderr(`${c(cmd).yellow(`${what} is coming soon`)} — not available yet. Join the waitlist: ${WAITLIST_URL}\n`);
      throw new CliExit(2);
    });
  program.command("deploy").description("deploy a model to dedicated GPUs (coming with GPU Cloud)").allowUnknownOption().argument("[args...]").action(comingSoon("Model deployment"));
  const gpu = program.command("gpu").description("GPU Cloud (coming soon)");
  for (const sub of ["search", "deploy", "stop", "ssh", "logs"]) gpu.command(sub).allowUnknownOption().argument("[args...]").description(`GPU ${sub} (coming soon)`).action(comingSoon("GPU Cloud"));

  try {
    await program.parseAsync(argv, { from: "user" });
    return 0;
  } catch (e) {
    if (e instanceof CliExit) return e.code;
    if (e instanceof CommanderError) return e.code === "commander.helpDisplayed" || e.code === "commander.version" || e.code === "commander.help" ? 0 : e.exitCode || 1;
    throw e;
  }
}
