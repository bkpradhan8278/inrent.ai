import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  // The SDK is a workspace package that ships TypeScript source; bundle it so the CLI is self-contained.
  noExternal: [/^@inrent\//],
  banner: { js: "#!/usr/bin/env node" },
});
