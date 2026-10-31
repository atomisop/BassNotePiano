import { defineConfig } from "vitest/config";
import path from "path";

// Tests that need a real, migrated Postgres (DATABASE_URL). Run by CI after the build
// has applied the migrations, and by hand with `npm run test:db` against a throwaway database.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: { setupFiles: ["tests/db/_guard.ts"], include: ["tests/db/**/*.test.ts"], environment: "node", fileParallelism: false, testTimeout: 30_000 },
});
