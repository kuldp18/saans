import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: { "server-only": fileURLToPath(new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url)) },
  },
  test: {
    include: ["tests/{unit,integration}/**/*.test.ts"],
    coverage: {
      include: ["src/domain/**/*.ts", "src/server/**/*.ts"],
      reporter: ["text", "json-summary"],
    },
  },
});
