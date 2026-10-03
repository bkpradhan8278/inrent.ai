import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  // Bundle workspace packages; keep native/heavy deps external.
  noExternal: [/^@inrent\//],
  external: ["@prisma/client", ".prisma/client"],
});
