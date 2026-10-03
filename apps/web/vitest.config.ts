import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // Next's server-only guard throws outside React Server Components; tests import server modules directly.
      "server-only": path.resolve(__dirname, "test/stubs/empty.ts"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
