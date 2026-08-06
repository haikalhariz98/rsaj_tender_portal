import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    // Route handlers and components get their own setup when they arrive; for now
    // the suite is pure logic and needs no DOM.
    include: ["src/**/*.test.ts"],
  },
});
