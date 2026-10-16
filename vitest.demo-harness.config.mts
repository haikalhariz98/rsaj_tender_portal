import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Runs ONLY `scripts/online-demo-harness.ts`, as a child process of `src/lib/demo/demo-additive.db.test.ts`, against the throwaway database that test loaded (wave 3b
 * step 18). It has no setup file on purpose: the database tests' setup binds `db` to the scratch database and forces its own organisation, and this proof runs on the
 * demonstration's own. The parent sets DATABASE_URL, ORGANISATION_CODE, DEMO_ACCOUNT_PASSWORD and DEMO_ONLINE_REFERENCE; without them the harness skips itself.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/online-demo-harness.ts"],
    fileParallelism: false,
    testTimeout: 900_000,
    hookTimeout: 120_000,
  },
});
