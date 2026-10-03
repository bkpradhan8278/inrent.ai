import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

/** Applies migrations to the test database once per run (integration suites only). */
export default function setup() {
  if (!process.argv.some((a) => a.includes("integration"))) return;
  const url = process.env.TEST_DATABASE_URL ?? "postgresql://inrent:inrent@localhost:5432/inrent_test";
  const dbDir = fileURLToPath(new URL("../../db", import.meta.url));
  execSync("npx prisma migrate deploy", { cwd: dbDir, env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
}
