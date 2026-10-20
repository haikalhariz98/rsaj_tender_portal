import "dotenv/config";
import { spawnSync } from "node:child_process";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Makes `npm run test:db` repeatable: every run gets a database of its own, created from template0 with every migration deployed, and
 * drops it afterwards. Before this the files ran against one long-lived scratch database that every earlier run had added to, so
 * a run's cost and its unique-name clashes depended on what had been left behind (holding-edit's 5 s transaction timeout was a
 * count over thousands of leftover rows).
 *
 * TEST_DATABASE_URL still names the SERVER and credentials (and is still refused if it names the development database); its database
 * name is only the base of the throwaway's name. Only a database carrying PREFIX, made by this run, is ever dropped; the long-lived
 * scratch database and the development database are never touched. Set TEST_DATABASE_KEEP=1 to keep the run's database for inspection.
 */
const PREFIX = "perolehan_dbtest_";
const databaseName = (url: string | undefined) => (url ? new URL(url).pathname.replace(/^\//, "") : "");

let made: string | null = null;
let admin: string | null = null;

async function withAdmin<T>(url: string, fn: (c: PrismaClient) => Promise<T>): Promise<T> {
  const u = new URL(url);
  u.pathname = "/postgres";
  u.search = "";
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: u.toString() }) });
  try {
    return await fn(c);
  } finally {
    await c.$disconnect();
  }
}

export async function setup() {
  const base = process.env.TEST_DATABASE_URL;
  if (!base) throw new Error("TEST_DATABASE_URL is not set. The database tests run only against a scratch server, never DATABASE_URL.");
  if (base === process.env.DATABASE_URL || databaseName(base) === databaseName(process.env.DATABASE_URL)) {
    throw new Error("TEST_DATABASE_URL names the same database as DATABASE_URL. Refusing: use a scratch database.");
  }
  const name = `${PREFIX}${Date.now().toString(36)}_${process.pid.toString(36)}`;
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Refusing an unsafe database name: ${name}`);
  await withAdmin(base, (c) => c.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE template0`));
  made = name;
  admin = base;

  const url = new URL(base);
  url.pathname = `/${name}`;
  const prisma = path.join(__dirname, "../../../node_modules/prisma/build/index.js");
  // The Prisma CLI is called directly (not npm run db:deploy, which would run db:roles too), with both URLs naming the throwaway.
  const env = { ...process.env, DATABASE_URL: url.toString(), MIGRATE_DATABASE_URL: url.toString() };
  const deploy = spawnSync(process.execPath, [prisma, "migrate", "deploy"], { env, encoding: "utf8", timeout: 600_000, cwd: path.join(__dirname, "../../..") });
  if (deploy.status !== 0) {
    await teardown();
    throw new Error(`migrate deploy into ${name} failed:\n${deploy.stdout}\n${deploy.stderr}`);
  }
  // Workers are forked after this and inherit the environment: the per-file setup reads this.
  process.env.TEST_DATABASE_URL = url.toString();
  console.log(`test:db runs in the throwaway database ${name}`);
}

export async function teardown() {
  if (!made || !admin) return;
  if (process.env.TEST_DATABASE_KEEP === "1") {
    console.log(`test:db kept the throwaway database ${made}`);
    return;
  }
  const name = made;
  if (!name.startsWith(PREFIX)) return;
  await withAdmin(admin, (c) => c.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`));
  made = null;
}
