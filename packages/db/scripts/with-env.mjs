// Runs a command with the monorepo root .env loaded (if present). Variables already set in the
// environment (CI, Docker, shell) take precedence over the file.
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const envFile = new URL("../../../.env", import.meta.url);
if (existsSync(envFile)) process.loadEnvFile(envFile);

const [cmd, ...args] = process.argv.slice(2);
if (!cmd) {
  console.error("usage: node scripts/with-env.mjs <command> [...args]");
  process.exit(2);
}
const result = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
process.exit(result.status ?? 1);
