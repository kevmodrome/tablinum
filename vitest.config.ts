import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/tablinum/tests/**/*.test.ts"],
    setupFiles: ["packages/tablinum/tests/setup.ts"],
  },
});
