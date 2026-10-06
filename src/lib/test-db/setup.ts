import "dotenv/config";

/**
 * Runs before every `*.db.test.ts` file. Points the product's own `db` at the scratch database, and refuses to run at all if the
 * scratch database is missing or is the development one. It must run before anything imports `@/lib/db`.
 */
const databaseName = (url: string | undefined) => (url ? new URL(url).pathname.replace(/^\//, "") : "");

const test = process.env.TEST_DATABASE_URL;
if (!test) throw new Error("TEST_DATABASE_URL is not set. The database tests run only against a scratch database, never DATABASE_URL.");
if (test === process.env.DATABASE_URL || databaseName(test) === databaseName(process.env.DATABASE_URL)) {
  throw new Error("TEST_DATABASE_URL names the same database as DATABASE_URL. Refusing: use a scratch database.");
}

process.env.DATABASE_URL = test;
// The sign-in screens find their organisation by this code; the tests use one of their own.
process.env.ORGANISATION_CODE = "AUTH_TEST";
// An address is believed only behind a declared proxy: the tests declare one, as a deployment would.
process.env.TRUSTED_PROXY_HOPS = "1";
