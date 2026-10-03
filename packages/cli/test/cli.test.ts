import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadConfig, maskKey, resolveSettings, saveConfig } from "../src/config";
import { table } from "../src/format";
import type { Io } from "../src/io";
import { run } from "../src/program";

const KEY = `sk-inrent-dev-${"a".repeat(43)}`;

function harness(opts: { stdin?: string; interactive?: boolean; answers?: string[]; routes?: Record<string, (init?: RequestInit) => Response> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "inrent-cli-"));
  const out: string[] = [];
  const err: string[] = [];
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const io: Io = {
    stdout: (s) => out.push(s),
    stderr: (s) => err.push(s),
    interactive: opts.interactive ?? false,
    prompt: async () => opts.answers?.shift() ?? "",
    readStdin: async () => opts.stdin ?? "",
  };
  const fetch = async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const path = new URL(url).pathname + (init?.method && init.method !== "GET" ? `:${init.method}` : "");
    const route = opts.routes?.[path];
    return route ? route(init) : new Response(JSON.stringify({ error: { code: "not_found", message: `no route ${path}` } }), { status: 404 });
  };
  const configPath = join(dir, "config.json");
  return {
    run: (...argv: string[]) => run(argv, { io, env: { INRENT_BASE_URL: "http://gw.test/v1" }, configPath, fetch }),
    out: () => out.join(""),
    err: () => err.join(""),
    calls,
    configPath,
  };
}

const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => () => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });
const currentKey = { data: { id: "k1", name: "laptop", prefix: "sk-inrent-dev-aaa", environment: "development", organization_id: "o1", project: { id: "p1", name: "Default" }, permissions: ["inference"], limits: { spend_limit_usd: null, rpm: 60, tpm: 100000 }, usage: { spent_usd: "0.000000" }, balance_usd: "12.500000", expires_at: null } };

describe("config", () => {
  it("writes owner-only files and resolves precedence", () => {
    const dir = mkdtempSync(join(tmpdir(), "inrent-cfg-"));
    const p = join(dir, "nested", "config.json");
    saveConfig(p, { api_key: KEY });
    expect(statSync(p).mode & 0o777).toBe(0o600);
    expect(loadConfig(p).api_key).toBe(KEY);
    expect(resolveSettings({}, {}, { api_key: "cfg" }).apiKeySource).toBe("config");
    expect(resolveSettings({}, { INRENT_API_KEY: "env" }, { api_key: "cfg" })).toMatchObject({ apiKey: "env", apiKeySource: "env" });
    expect(resolveSettings({ apiKey: "flag" }, { INRENT_API_KEY: "env" }, {})).toMatchObject({ apiKey: "flag", apiKeySource: "flag" });
    expect(resolveSettings({}, {}, {}).baseURL).toBe("https://api.inrent.ai/v1");
    expect(maskKey(KEY)).toBe(`${KEY.slice(0, 14)}…${KEY.slice(-4)}`);
  });

  it("renders aligned tables", () => {
    expect(table(["A", "BB"], [["xx", "1"], ["y", "22"]], { right: [1] })).toBe("A   BB\nxx   1\ny   22");
  });
});

describe("inrent CLI", () => {
  it("login reads the key from stdin, verifies it and saves it", async () => {
    const h = harness({ stdin: `${KEY}\n`, routes: { "/v1/key": json(currentKey) } });
    expect(await h.run("login")).toBe(0);
    expect(loadConfig(h.configPath).api_key).toBe(KEY);
    expect(h.out()).toContain("laptop");
    expect((h.calls[0]!.init!.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
  });

  it("login rejects malformed keys without saving", async () => {
    const h = harness({ stdin: "sk-live-123" });
    expect(await h.run("login")).toBe(1);
    expect(h.err()).toContain("doesn't look like an INRENT API key");
    expect(loadConfig(h.configPath).api_key).toBeUndefined();
  });

  it("login fails when the API rejects the key", async () => {
    const h = harness({ stdin: KEY, routes: { "/v1/key": json({ error: { type: "authentication_error", code: "invalid_api_key", message: "Invalid API key." } }, 401) } });
    expect(await h.run("login")).toBe(1);
    expect(h.err()).toContain("Invalid API key");
    expect(loadConfig(h.configPath).api_key).toBeUndefined();
  });

  it("commands that need a key explain how to log in", async () => {
    const h = harness();
    expect(await h.run("usage")).toBe(1);
    expect(h.err()).toContain("inrent login");
  });

  it("models --json lists the public catalog without a key", async () => {
    const h = harness({ routes: { "/v1/models": json({ object: "list", data: [{ id: "inrent/auto", name: "Auto", description: "", owned_by: "inrent", capabilities: ["chat"], availability: "platform", providers: [], pricing: null, status: "active", context_length: null }] }) } });
    expect(await h.run("models", "--json")).toBe(0);
    expect(JSON.parse(h.out())[0].id).toBe("inrent/auto");
  });

  it("keys revoke refuses to run non-interactively without --yes", async () => {
    const h = harness();
    saveConfig(h.configPath, { api_key: KEY });
    expect(await h.run("keys", "revoke", "k1")).toBe(1);
    expect(h.calls).toHaveLength(0);
  });

  it("keys revoke --yes calls DELETE", async () => {
    const h = harness({ routes: { "/v1/keys/k1:DELETE": json({ id: "k1", revoked: true }) } });
    saveConfig(h.configPath, { api_key: KEY });
    expect(await h.run("keys", "revoke", "k1", "--yes")).toBe(0);
    expect(h.calls[0]!.init!.method).toBe("DELETE");
  });

  it("test --no-stream prints the answer and metadata", async () => {
    const h = harness({
      routes: {
        "/v1/chat/completions:POST": json({ id: "c", object: "chat.completion", created: 1, model: "inrent/mock-echo", choices: [{ index: 0, message: { role: "assistant", content: "pong" }, finish_reason: "stop" }], usage: { prompt_tokens: 2, completion_tokens: 1, total_tokens: 3 } }, 200, { "x-request-id": "req_t", "x-inrent-provider": "mock" }),
      },
    });
    saveConfig(h.configPath, { api_key: KEY });
    expect(await h.run("test", "--no-stream", "-m", "inrent/mock-echo", "ping")).toBe(0);
    expect(h.out()).toContain("pong");
    expect(h.out()).toContain("req_t");
    expect(JSON.parse(String(h.calls[0]!.init!.body))).toMatchObject({ model: "inrent/mock-echo", messages: [{ role: "user", content: "ping" }] });
  });

  it("API errors print code and request id, and --json emits an error object", async () => {
    const routes = { "/v1/usage": json({ error: { type: "permission_error", code: "permission_denied", message: "Key lacks usage:read", request_id: "req_p" } }, 403) };
    const h = harness({ routes });
    saveConfig(h.configPath, { api_key: KEY });
    expect(await h.run("usage")).toBe(1);
    expect(h.err()).toContain("req_p");
    const j = harness({ routes });
    saveConfig(j.configPath, { api_key: KEY });
    expect(await j.run("usage", "--json")).toBe(1);
    expect(JSON.parse(j.out()).error).toMatchObject({ status: 403, code: "permission_denied", request_id: "req_p" });
  });

  it("config set validates keys and URLs", async () => {
    const h = harness();
    expect(await h.run("config", "set", "api_key", KEY)).toBe(1);
    expect(await h.run("config", "set", "base_url", "http://evil.example/v1")).toBe(1);
    expect(await h.run("config", "set", "default_model", "openai/gpt-4.1-mini")).toBe(0);
    expect(JSON.parse(readFileSync(h.configPath, "utf8")).default_model).toBe("openai/gpt-4.1-mini");
  });

  it("GPU commands are honest about availability", async () => {
    const h = harness();
    expect(await h.run("gpu", "deploy", "--gpu", "H100")).toBe(2);
    expect(h.err()).toContain("coming soon");
    expect(h.calls).toHaveLength(0);
  });

  it("--version and --help exit 0", async () => {
    expect(await harness().run("--version")).toBe(0);
    expect(await harness().run("--help")).toBe(0);
  });
});
