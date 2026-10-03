// Copies static assets next to the standalone server so `pnpm start` serves the production build
// exactly like the Docker image does (Next's standalone output omits .next/static and public/).
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const app = fileURLToPath(new URL("..", import.meta.url));
const standalone = `${app}.next/standalone/apps/web`;
if (!existsSync(standalone)) {
  console.error("No standalone build found — run `pnpm build` first.");
  process.exit(1);
}
cpSync(`${app}.next/static`, `${standalone}/.next/static`, { recursive: true });
cpSync(`${app}public`, `${standalone}/public`, { recursive: true });
