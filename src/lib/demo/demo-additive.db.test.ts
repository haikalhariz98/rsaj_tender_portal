import { spawnSync } from "node:child_process";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { db } from "@/lib/db";

/**
 * Phase 1d (ADR 0034 D11): the demo loader is additive. Loaded into an empty database, it writes the demo; run again, every table holds
 * the same number of rows as after the first run (no duplicate audit rows, nothing rewritten); and the retired wipe refuses without
 * touching anything.
 *
 * Phase 1d review: this used to run against the shared scratch database, which already holds the demo, so the first load wrote nothing
 * and every assertion passed without the first-load path ever running. It now makes a database of its own for each run (CREATE
 * DATABASE from template0, every migration deployed into it, one organisation), and drops it afterwards. The first load must NOT say the
 * demo was already present: that is what proves the first-load path ran, under the triggers.
 *
 * Safety: the children are handed DATABASE_URL and MIGRATE_DATABASE_URL both naming the throwaway database (prisma.config.ts reads
 * MIGRATE_DATABASE_URL first, and dotenv never overrides a variable already set), the Prisma CLI is called directly (npm run db:deploy
 * would run db:roles too), and only a database whose name carries this file's prefix is ever dropped.
 */

const ROOT = path.join(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const PRISMA = path.join(ROOT, "node_modules/prisma/build/index.js");
const PREFIX = "perolehan_demo_check_";
const ORG_CODE = "ORG";

const name = `${PREFIX}${Date.now().toString(36)}`;
const scratch = new URL(process.env.DATABASE_URL!);
const throwaway = new URL(scratch.toString());
throwaway.pathname = `/${name}`;
const url = throwaway.toString();
let made = false;
let client: PrismaClient | null = null;

function run(args: string[], timeout: number) {
  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url, MIGRATE_DATABASE_URL: url, TEST_DATABASE_URL: url, ORGANISATION_CODE: ORG_CODE },
    encoding: "utf8",
    timeout,
  });
  return { status: child.status, out: `${child.stdout ?? ""}${child.stderr ?? ""}` };
}
const demo = (mode: string) => run([TSX, "prisma/demo.ts", mode], 1_500_000);

async function counts(): Promise<Record<string, number>> {
  const c = client!;
  const tables = await c.$queryRaw<{ name: string }[]>`SELECT tablename::text AS name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`;
  const result: Record<string, number> = {};
  for (const { name: table } of tables) {
    const [row] = await c.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table.replace(/"/g, '""')}"`);
    result[table] = Number(row.n);
  }
  return result;
}

beforeAll(async () => {
  expect(name.startsWith(PREFIX) && /^[a-z0-9_]+$/.test(name)).toBe(true);
  await db.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
  made = true;
  const deploy = run([PRISMA, "migrate", "deploy"], 600_000);
  expect(deploy.status, deploy.out).toBe(0);
  expect(deploy.out).toContain(name);
  client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  await client.organisation.create({ data: { code: ORG_CODE, name: "Your organisation" } });
}, 700_000);

afterAll(async () => {
  await client?.$disconnect();
  if (made && name.startsWith(PREFIX)) await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}, 120_000);

describe("the demo loader is additive (Phase 1d)", () => {
  it("the first load into an empty database writes the demo; a second writes nothing: every table holds what it held after the first", { timeout: 3_000_000 }, async () => {
    expect(await counts()).toMatchObject({ OrgUnit: 0, AuditEntry: 0 });

    const first = demo("load");
    expect(first.status, first.out).toBe(0);
    expect(first.out).not.toMatch(/already present/);
    const after1 = await counts();
    expect(after1.OrgUnit).toBeGreaterThan(0);
    expect(after1.AuditEntry).toBeGreaterThan(0);

    const second = demo("load");
    expect(second.status, second.out).toBe(0);
    expect(second.out).toMatch(/already present, loaded wholly or in part: nothing was written/);
    expect(await counts()).toEqual(after1);
  });

  it("the retired wipe refuses, exits non-zero and removes nothing", { timeout: 1_000_000 }, async () => {
    const before = await counts();
    expect(before.AuditEntry).toBeGreaterThan(0);
    const wipe = demo("wipe");
    expect(wipe.status).toBe(1);
    expect(wipe.out).toMatch(/demo:wipe is retired: nothing was removed/);
    expect(await counts()).toEqual(before);
  });
});
