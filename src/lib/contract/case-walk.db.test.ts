import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";

/**
 * Wave C step C11 (Award and Contract Requirements v2, C-3; AC-20; design note 0004): the rules that must stay, and the walk from "Start the award" to "Active on site",
 * through the real server acts as the case page posts them, against a real database.
 *
 * The acts need a configured organisation (templates, signatory rules, a numbering series, a roster, committees, a tender and a quotation exercise), and the scratch
 * database holds none of it. The demonstration is exactly that, and it is synthetic (no customer's limits). So, as `demo-additive.db.test.ts` does, this makes a
 * database of its own (CREATE DATABASE from template0, every migration deployed, one organisation), loads the demonstration into it, gives the demonstration's people
 * their accounts, and runs `scripts/case-walk-harness.ts` as a child vitest against it (`vitest.case-walk.config.mts`). The harness stands in only for the request:
 * who is signed in, the cookies, the cache and the redirect. The acts, locks, gates, triggers and SQL are the product's.
 *
 * A skipped harness is no gate (the 20cl precedent): the harness skips itself without its password, so the test asserts that the child ran every test it holds and
 * that none was skipped.
 *
 * Safety: the child is handed DATABASE_URL and MIGRATE_DATABASE_URL both naming the throwaway database, the Prisma CLI is called directly (npm run db:deploy would also
 * run db:roles), and only a database whose name carries this file's prefix is ever dropped. The password is random, held in memory, and never written to a file.
 */

const ROOT = path.join(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const PRISMA = path.join(ROOT, "node_modules/prisma/build/index.js");
const VITEST = path.join(ROOT, "node_modules/vitest/vitest.mjs");
const PREFIX = "perolehan_walk_check_";
const ORG_CODE = "ORG";

const name = `${PREFIX}${Date.now().toString(36)}`;
const scratch = new URL(process.env.DATABASE_URL!);
const url = (() => {
  const u = new URL(scratch.toString());
  u.pathname = `/${name}`;
  return u.toString();
})();
const PASSWORD = `Walk-${randomBytes(12).toString("base64url")}-9aA`;

/// The number of tests in the harness: every `it(` in it, counted from its source, so a test added to the harness is expected to run and one removed is noticed.
function harnessTestCount(): number {
  const src = readFileSync(path.join(ROOT, "scripts/case-walk-harness.ts"), "utf8");
  return (src.match(/^\s+it\(/gm) ?? []).length;
}

function run(args: string[], timeout: number, extra: Record<string, string> = {}) {
  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    // The sealed-bid demonstration is named off, explicitly: a .env cannot decide it, and the load then does not depend on the day of the week or the hour.
    env: { ...process.env, DATABASE_URL: url, MIGRATE_DATABASE_URL: url, TEST_DATABASE_URL: url, ORGANISATION_CODE: ORG_CODE, SEALED_BIDS_DEMONSTRATION_ALLOWED: "false", ...extra },
    encoding: "utf8",
    timeout,
  });
  return { status: child.status, out: `${child.stdout ?? ""}${child.stderr ?? ""}` };
}

beforeAll(async () => {
  expect(name.startsWith(PREFIX) && /^[a-z0-9_]+$/.test(name)).toBe(true);
  await db.$executeRawUnsafe(`CREATE DATABASE "${name}" TEMPLATE template0`);
}, 120_000);

afterAll(async () => {
  if (name.startsWith(PREFIX)) await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
}, 120_000);

describe("the award case from Start the award to Active on site, through the real acts (wave C step C11)", () => {
  it("every rule of C-3 holds and the walk reaches Active on site: migrate, load the demonstration, give its people accounts, run the harness", { timeout: 3_000_000 }, async () => {
    const deploy = run([PRISMA, "migrate", "deploy"], 600_000);
    expect(deploy.status, deploy.out).toBe(0);
    expect(deploy.out).toContain(name);

    // The one organisation the loader fills (the demonstration's own, as `demo-additive.db.test.ts` makes it).
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const { PrismaClient } = await import("@/generated/prisma/client");
    const client = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    try {
      await client.organisation.create({ data: { code: ORG_CODE, name: "Your organisation" } });
    } finally {
      await client.$disconnect();
    }

    const loaded = run([TSX, "prisma/demo.ts", "load"], 1_500_000);
    expect(loaded.status, loaded.out).toBe(0);
    expect(loaded.out).not.toMatch(/already present/);
    // C10: the load itself proves every case stage is shown.
    expect(loaded.out).toMatch(/Case list stages in the demo: AWARDING \d+, SIGNING \d+, ON_SITE \d+, COMPLETED \d+, CLOSED \d+, ENDED \d+/);

    const accounts = run([TSX, "scripts/demo-accounts.ts"], 600_000, { DEMO_ACCOUNT_PASSWORD: PASSWORD });
    expect(accounts.status, accounts.out).toBe(0);

    const child = run([VITEST, "run", "--config", "vitest.case-walk.config.mts"], 1_800_000, { DEMO_ACCOUNT_PASSWORD: PASSWORD });
    const expected = harnessTestCount();
    expect(expected).toBeGreaterThan(20);
    expect(child.out, "the harness ran every test it holds, and skipped none").toMatch(new RegExp(`Tests\\s+${expected} passed \\(${expected}\\)`));
    expect(child.out).not.toMatch(/skipped/);
    expect(child.status, child.out).toBe(0);
  });
});
