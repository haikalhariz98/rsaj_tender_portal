import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * The tests that need a database (`npm run test:db`): triggers, roles, lock races, and the sign-in flows that count in a table.
 * `npm test` stays pure and never reaches here (vitest.config.mts excludes `*.db.test.ts`).
 *
 * They run only against TEST_DATABASE_URL, and the setup file refuses if that names the same database as DATABASE_URL: nothing here
 * ever touches the development database. They run one file at a time, in order, because they share one scratch organisation.
 */
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "node",
    include: ["src/**/*.db.test.ts"],
    setupFiles: ["src/lib/test-db/setup.ts"],
    fileParallelism: false,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
