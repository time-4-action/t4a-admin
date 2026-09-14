import { defineConfig } from "vitest/config";
import path from "node:path";

// Unit + integration tests for the preorder business logic (resolver, snapshot,
// submission/MK lifecycle). `server-only` throws outside a React Server Component
// bundle, so it is aliased to an empty stub here; `@/` mirrors tsconfig paths.
export default defineConfig({
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "."),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
});
