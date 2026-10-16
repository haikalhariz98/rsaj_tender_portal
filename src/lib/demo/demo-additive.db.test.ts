import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PrismaClient } from "@/generated/prisma/client";
import { ACT_SLOTS } from "@/lib/auth/act-slots";
import { slotColumns } from "@/lib/auth/slot-columns";
import { receivedView } from "@/lib/bids/online/received";
import { db } from "@/lib/db";
import { NEEDS_FLAG_WORDS } from "@/lib/demo/online-demo";

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
 *
 * Wave 3b step 18 (rulings 12c, 12d, 20z): the demonstration's online sealed-bid exercise. With the deployment's demonstration flag set (named explicitly in the child's
 * environment, so a .env cannot decide it) the load makes one online exercise, pins every authored exercise PAPER and shows Received with two standing and one late, and the
 * demonstration's officers then unseal it and one of them finalises it (`scripts/online-demo-harness.ts`, a child run on this same throwaway database, after the tests that count
 * what a load wrote). With the flag unset, on a second throwaway database, the load completes, the channel reads PAPER, no online bid exists, and the words name the flag. A
 * re-run writes nothing and names the settings that are not set.
 */

const ROOT = path.join(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const PRISMA = path.join(ROOT, "node_modules/prisma/build/index.js");
const PREFIX = "perolehan_demo_check_";
const ORG_CODE = "ORG";

const stamp = Date.now().toString(36);
const scratch = new URL(process.env.DATABASE_URL!);
const urlFor = (name: string) => {
  const u = new URL(scratch.toString());
  u.pathname = `/${name}`;
  return u.toString();
};
const name = `${PREFIX}${stamp}`;
/// The second throwaway database: the demonstration loaded with the deployment NOT allowing demonstration bids.
const unsetName = `${PREFIX}${stamp}u`;
const url = urlFor(name);
const unsetUrl = urlFor(unsetName);
const made: string[] = [];
/// What the first load printed, kept for the assertions on its words.
const demoLoadOutput = { first: "" };
let client: PrismaClient | null = null;
let unsetClient: PrismaClient | null = null;
/// The demonstration password the harness's accounts are made with: random, held in memory, never written to a file.
const ACCOUNT_PASSWORD = `Demo-${randomBytes(12).toString("base64url")}-9aA`;

type Env = Record<string, string>;
function run(args: string[], timeout: number, target: string = url, extra: Env = {}) {
  const child = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: target, MIGRATE_DATABASE_URL: target, TEST_DATABASE_URL: target, ORGANISATION_CODE: ORG_CODE, ...extra },
    encoding: "utf8",
    timeout,
  });
  return { status: child.status, out: `${child.stdout ?? ""}${child.stderr ?? ""}` };
}
/// The flag is named in the child's environment, "true" or "false": dotenv never overrides a variable already set, so the .env of whoever runs this cannot decide it.
const FLAG = "SEALED_BIDS_DEMONSTRATION_ALLOWED";
const demo = (mode: string, target: string = url, flag: "true" | "false" = "true") => run([TSX, "prisma/demo.ts", mode], 1_500_000, target, { [FLAG]: flag });

async function counts(c: PrismaClient = client!): Promise<Record<string, number>> {
  const tables = await c.$queryRaw<{ name: string }[]>`SELECT tablename::text AS name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`;
  const result: Record<string, number> = {};
  for (const { name: table } of tables) {
    const [row] = await c.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${table.replace(/"/g, '""')}"`);
    result[table] = Number(row.n);
  }
  return result;
}

async function makeDatabase(dbName: string, dbUrl: string): Promise<PrismaClient> {
  expect(dbName.startsWith(PREFIX) && /^[a-z0-9_]+$/.test(dbName)).toBe(true);
  await db.$executeRawUnsafe(`CREATE DATABASE "${dbName}" TEMPLATE template0`);
  made.push(dbName);
  const deploy = run([PRISMA, "migrate", "deploy"], 600_000, dbUrl);
  expect(deploy.status, deploy.out).toBe(0);
  expect(deploy.out).toContain(dbName);
  const c = new PrismaClient({ adapter: new PrismaPg({ connectionString: dbUrl }) });
  await c.organisation.create({ data: { code: ORG_CODE, name: "Your organisation" } });
  return c;
}

beforeAll(async () => {
  client = await makeDatabase(name, url);
  unsetClient = await makeDatabase(unsetName, unsetUrl);
}, 1_400_000);

afterAll(async () => {
  await client?.$disconnect();
  await unsetClient?.$disconnect();
  for (const n of made) if (n.startsWith(PREFIX)) await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${n}" WITH (FORCE)`);
}, 120_000);

describe("the demo loader is additive (Phase 1d)", () => {
  it("the first load into an empty database writes the demo; a second writes nothing: every table holds what it held after the first", { timeout: 3_000_000 }, async () => {
    expect(await counts()).toMatchObject({ OrgUnit: 0, AuditEntry: 0 });

    const first = demo("load");
    demoLoadOutput.first = first.out;
    expect(first.status, first.out).toBe(0);
    expect(first.out).not.toMatch(/already present/);
    // SR-07 (ruling 11): the demo names the opening officers, and the exercise still being prepared would pass the product's own submit gate (the load stops otherwise).
    expect(first.out).toMatch(/Opening officers named: [1-9]/);
    const after1 = await counts();
    expect(after1.OrgUnit).toBeGreaterThan(0);
    expect(after1.AuditEntry).toBeGreaterThan(0);

    const second = demo("load");
    expect(second.status, second.out).toBe(0);
    expect(second.out).toMatch(/already present, loaded wholly or in part: nothing was written/);
    expect(await counts()).toEqual(after1);
  });

  // Wave 3b step 18 (12c, 12d, 20z): with the deployment allowing demonstration bids, the load made one online exercise by the product's own create act.
  it("with the flag set: the channel is ONLINE, every authored exercise is PAPER and none is unset, and Received shows two standing and one late", { timeout: 300_000 }, async () => {
    const c = client!;
    const policy = await c.windowPolicy.findFirstOrThrow({ select: { submissionChannel: true } });
    expect(policy.submissionChannel).toBe("ONLINE");
    expect((await c.bidSealingPolicy.findFirstOrThrow({ select: { onlineSubmission: true } })).onlineSubmission).toBe("DEMONSTRATION");
    expect((await c.securityPolicy.findFirstOrThrow({ select: { sealingPassphraseMinLength: true } })).sealingPassphraseMinLength).toBe(12);
    const byChannel = await c.sourcingExercise.groupBy({ by: ["submissionChannel"], _count: { _all: true } });
    const count = (ch: "PAPER" | "ONLINE" | null) => byChannel.find((g) => g.submissionChannel === ch)?._count._all ?? 0;
    expect(count(null)).toBe(0);
    expect(count("ONLINE")).toBe(1);
    expect(count("PAPER")).toBeGreaterThan(15);
    const ex = await c.sourcingExercise.findFirstOrThrow({ where: { submissionChannel: "ONLINE" }, select: { id: true, status: true, onlineSubmissionMode: true, publishedKeyFingerprint: true } });
    expect(ex).toMatchObject({ status: "ADVERTISED", onlineSubmissionMode: "DEMONSTRATION" });
    expect(ex.publishedKeyFingerprint).toBeTruthy();
    // Received, as the screen's own reader counts the standing bids and the late ones.
    const bids = await c.onlineBid.findMany({ where: { exerciseId: ex.id }, select: { status: true, kind: true, envelope: { select: { sequence: true, receivedAt: true, late: true } } } });
    const view = receivedView(bids.map((b) => ({ sequence: b.envelope.sequence, receivedAt: b.envelope.receivedAt, late: b.envelope.late, status: b.status })), false);
    expect({ count: view.count, inTime: view.inTime, late: view.late }).toEqual({ count: 3, inTime: 2, late: 1 });
    // One of the two in time replaced its bid, and nothing is open: no opening, no price.
    expect(bids.filter((b) => b.status === "REPLACED")).toHaveLength(1);
    expect(await c.opening.count({ where: { exerciseId: ex.id } })).toBe(0);
    // Every share is held under the live key, and the estimate is lodged sealed.
    expect(await c.exerciseKeyShare.count({ where: { sealedShare: { not: null }, key: { exerciseId: ex.id, retiredAt: null } } })).toBeGreaterThanOrEqual(2);
    expect(await c.sealedEstimateLodgement.count({ where: { exerciseId: ex.id, supersededAt: null } })).toBe(1);
    // The exercise was made by the product's own create act (the loader's), and no audit row of it names a person or a supplier as its actor: the loader wrote them, and the trail says so.
    expect(await c.auditEntry.count({ where: { entity: "SourcingExercise", entityId: ex.id, action: "CREATE", actorKind: "SYSTEM" } })).toBe(1);
    expect(await c.auditEntry.count({ where: { entityId: ex.id, NOT: { actorKind: "SYSTEM" } } })).toBe(0);
    // The words it printed name the exercise and the passphrases the guide gives the officers.
    expect(demoLoadOutput.first).toMatch(/Online sealed bids: DEMO\/SX\/\d+\/2026 is the demonstration's online exercise/);
    expect(demoLoadOutput.first).toMatch(/demo unseal passphrase one/);
  });

  it("leaves no demo row without its attribution (Phase 2b): the acts it ran are the demo loader's own, and the rows it wrote directly are attributed to it", { timeout: 300_000 }, async () => {
    const columns = slotColumns(readFileSync(path.join(ROOT, "prisma", "schema.prisma"), "utf8"));
    const lacking: string[] = [];
    let held = 0;
    for (const s of ACT_SLOTS) {
      const column = columns.get(`${s.entity}.${s.field}`)!;
      const [row] = await client!.$queryRawUnsafe<{ held: bigint; lacking: bigint }[]>(
        `SELECT count(*) AS held, count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM "ActAttribution" a WHERE a."entity" = $1 AND a."slot" = $2 AND a."entityId" = t."id")) AS lacking FROM "${s.entity}" t WHERE t."${column}" IS NOT NULL`,
        s.entity,
        s.field,
      );
      held += Number(row.held);
      if (row.lacking > 0n) lacking.push(`${s.entity}.${s.field}: ${row.lacking} of ${row.held}`);
    }
    expect(held).toBeGreaterThan(100);
    expect(lacking).toEqual([]);
    // Every one reads as the loader's, never as a person's signature.
    const signed = await client!.actAttribution.count({ where: { mode: "SIGNED" } });
    expect(signed).toBe(0);
  });

  it("the retired wipe refuses, exits non-zero and removes nothing", { timeout: 1_000_000 }, async () => {
    const before = await counts();
    expect(before.AuditEntry).toBeGreaterThan(0);
    const wipe = demo("wipe");
    expect(wipe.status).toBe(1);
    expect(wipe.out).toMatch(/demo:wipe is retired: nothing was removed/);
    expect(await counts()).toEqual(before);
  });

  // Ruling 12c (2026-10-12, G2): configuration is written only by demo:load on a fresh database.
  it("the retired switches mode prints why, exits non-zero and writes nothing", { timeout: 1_000_000 }, async () => {
    const before = await counts();
    const switches = demo("switches");
    expect(switches.status).toBe(1);
    expect(switches.out).toMatch(/demo:switches is retired: nothing was written/);
    expect(switches.out).toMatch(/Configuration/);
    expect(await counts()).toEqual(before);
  });

  it("an add-on step on a loaded database writes no configuration: the inbox step finds its rows there and says so", { timeout: 1_000_000 }, async () => {
    const before = await counts();
    const inbox = demo("inbox");
    expect(inbox.status, inbox.out).toBe(0);
    expect(inbox.out).toMatch(/already there: nothing was written/);
    expect(await counts()).toEqual(before);
  });

  // Last in this database: the officers' acts below are signed (the SIGNED test above has counted), and they write what a real opening writes.
  it("the demonstration's opening officers unseal the online exercise with the printed passphrases, and one of them finalises it", { timeout: 2_000_000 }, async () => {
    const accounts = run([TSX, "scripts/demo-accounts.ts"], 600_000, url, { DEMO_ACCOUNT_PASSWORD: ACCOUNT_PASSWORD });
    expect(accounts.status, accounts.out).toBe(0);
    const reference = (await client!.sourcingExercise.findFirstOrThrow({ where: { submissionChannel: "ONLINE" }, select: { reference: true } })).reference;
    const VITEST = path.join(ROOT, "node_modules/vitest/vitest.mjs");
    const child = run([VITEST, "run", "--config", "vitest.demo-harness.config.mts"], 1_800_000, url, { DEMO_ACCOUNT_PASSWORD: ACCOUNT_PASSWORD, DEMO_ONLINE_REFERENCE: reference, [FLAG]: "true" });
    expect(child.out).toMatch(/1 passed/);
    expect(child.status, child.out).toBe(0);
  });
});

// Wave 3b step 18 (ruling 20z): the deployment does not allow demonstration bids at load. The load completes, nothing online is begun, and the words name the flag.
describe("the demonstration where the deployment does not allow demonstration bids", () => {
  it("falls back to PAPER: the load completes, the channel reads PAPER, no online bid exists, and the words name the flag", { timeout: 3_000_000 }, async () => {
    const first = demo("load", unsetUrl, "false");
    expect(first.status, first.out).toBe(0);
    expect(first.out).not.toMatch(/already present/);
    expect(first.out).toContain("SEALED_BIDS_DEMONSTRATION_ALLOWED");
    expect(first.out).toContain(NEEDS_FLAG_WORDS);
    expect(first.out).not.toMatch(/Online sealed bids: DEMO/);
    const c = unsetClient!;
    expect((await c.windowPolicy.findFirstOrThrow({ select: { submissionChannel: true } })).submissionChannel).toBe("PAPER");
    expect(await c.onlineBid.count()).toBe(0);
    const byChannel = await c.sourcingExercise.groupBy({ by: ["submissionChannel"], _count: { _all: true } });
    expect(byChannel.map((g) => g.submissionChannel)).toEqual(["PAPER"]);
    // Nothing online was begun: no key, no share, no sealing mode written.
    expect(await c.exerciseSealingKey.count()).toBe(0);
    expect(await c.officerExerciseKey.count()).toBe(0);
    expect(await c.bidSealingPolicy.count()).toBe(0);
  });

  it("a re-run writes nothing and names the settings that are not set", { timeout: 1_000_000 }, async () => {
    const before = await counts(unsetClient!);
    const second = demo("load", unsetUrl, "false");
    expect(second.status, second.out).toBe(0);
    expect(second.out).toMatch(/already present, loaded wholly or in part: nothing was written/);
    expect(second.out).toMatch(/Online bid submission \(Configuration, Bid sealing\) is not set/);
    expect(second.out).toMatch(/shortest passphrase an opening officer may set/);
    expect(await counts(unsetClient!)).toEqual(before);
  });
});
