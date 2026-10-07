/**
 * The running app's own database login (ADR 0034 D11, Phase 1d). Run after every `prisma migrate deploy`; `npm run db:migrate` and
 * `npm run setup` run it for you, and `npm run db:deploy` is the production pair.
 *
 *   npm run db:roles
 *
 * Connects as the owner (MIGRATE_DATABASE_URL, or DATABASE_URL when that is unset, the same rule as prisma.config.ts), makes the role
 * named by APP_DB_ROLE (unset: perolehan_app) with the password in APP_DB_PASSWORD, and grants it reads and writes on every table but
 * UPDATE, DELETE and TRUNCATE on the trail. Safe to run again: it puts the role and its grants back as they should be, and sets the
 * password to APP_DB_PASSWORD each time. Never prints the password.
 *
 * With APP_DB_PASSWORD unset it makes nothing and says so, and exits cleanly: a development copy may keep running as the owner (the
 * accounts screen says so), and a production copy refuses sign-in until this has been run and DATABASE_URL names the role.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import { applyAppRole } from "./db-role-apply";
import { APP_ROLE_DEFAULT } from "../src/lib/auth/db-role";

async function main() {
  const url = process.env.MIGRATE_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Neither MIGRATE_DATABASE_URL nor DATABASE_URL is set: there is no database to set the app role up in.");
  const target = new URL(url);
  const where = `database "${target.pathname.replace(/^\//, "")}" on ${target.hostname}:${target.port || "5432"}`;
  const role = process.env.APP_DB_ROLE || APP_ROLE_DEFAULT;
  const password = process.env.APP_DB_PASSWORD;

  if (!password) {
    console.log(`db:roles: APP_DB_PASSWORD is not set, so no app login was made in ${where}. The app runs as the owner: allowed while developing, refused at sign-in in production.`);
    return;
  }
  if (password.length < 16) throw new Error("APP_DB_PASSWORD is shorter than 16 characters. Generate a long random one; nothing was changed.");

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const outcome = await db.$transaction((tx) => applyAppRole(tx, { role, password }));
    if (!outcome.ok) {
      const why = outcome.fault === "ROLE_IS_OWNER" ? `"${role}" is the login that owns the tables; the app role must be a different one` : `"${role}" is not a plain lower-case name`;
      throw new Error(`db:roles refused in ${where}: ${why}. Nothing was changed.`);
    }
    console.log(`db:roles: ${outcome.created ? "made" : "brought into line"} the app login "${role}" in ${where} (owner "${outcome.owner}"). Reads and writes on every table; no UPDATE, DELETE or TRUNCATE on the trail.`);
    if (outcome.notYetPresent.length > 0) console.log(`db:roles: not present yet, so revoked the next time this runs: ${outcome.notYetPresent.join(", ")}.`);
    console.log(`db:roles: the running app's DATABASE_URL should name "${role}"; migrations keep using the owner through MIGRATE_DATABASE_URL.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
