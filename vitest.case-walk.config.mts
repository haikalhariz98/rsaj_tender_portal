import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Runs ONLY `scripts/case-walk-harness.ts`, as a child process of `src/lib/contract/case-walk.db.test.ts`, against the throwaway database that test loaded with the
 * demonstration (Award and Contract Requirements v2, wave C step C11). No setup file, as for `vitest.demo-harness.config.mts`: the proof runs on the demonstration's own
 * organisation, and the database tests' setup would bind `db` to the scratch one. The parent sets DATABASE_URL, ORGANISATION_CODE and DEMO_ACCOUNT_PASSWORD; without
 * them the harness skips itself.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["scripts/case-walk-harness.ts"],
    fileParallelism: false,
    testTimeout: 300_000,
    hookTimeout: 120_000,
  },
});
