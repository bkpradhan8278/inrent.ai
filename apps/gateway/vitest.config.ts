import { defineConfig } from "vitest/config";

const TEST_DB = process.env.TEST_DATABASE_URL ?? "postgresql://inrent:inrent@localhost:5432/inrent_test";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 60_000,
    globalSetup: ["./test/globalSetup.ts"],
    env: {
      NODE_ENV: "test",
      INRENT_ENV: "test",
      DATABASE_URL: TEST_DB,
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15",
      API_KEY_PEPPER: "test-pepper-0123456789abcdef0123456789abcdef",
      INTERNAL_SERVICE_SECRET: "test-internal-0123456789abcdef0123456789abcdef",
      INRENT_ENCRYPTION_KEYS: "t1:MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
      INRENT_ENABLE_MOCK_PROVIDER: "true",
      ALLOW_PRIVATE_WEBHOOK_URLS: "true",
      BYOK_FEE_PCT: "0",
    },
  },
});
