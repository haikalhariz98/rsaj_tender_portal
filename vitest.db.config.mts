import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The tests that need a database (`npm run test:db`): triggers, roles, lock races, and the sign-in flows that count in a table.
 * `npm test` stays pure and never reaches here (vitest.config.mts excludes `*.db.test.ts`).
 *
 * They run only in a throwaway database made on the TEST_DATABASE_URL server (src/lib/test-db/global-setup.ts), and the setup file refuses if that names the same database as DATABASE_URL: nothing here
 * ever touches the development database. They run one file at a time, in order, because the files in a run share one database (and one organisation).
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    globalSetup: ["src/lib/test-db/global-setup.ts"],
    setupFiles: ["src/lib/test-db/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
