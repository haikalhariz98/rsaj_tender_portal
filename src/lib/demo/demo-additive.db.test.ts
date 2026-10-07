import { spawnSync } from "node:child_process";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { db } from "@/lib/db";

/**
 * Phase 1d (ADR 0034 D11): the demo loader is additive. Run twice, every table holds the same number of rows after the second run as
 * after the first (no duplicate audit rows, nothing rewritten), and the retired wipe refuses without touching anything.
 *
 * The loader runs as the operator runs it (`tsx prisma/demo.ts`), against the scratch database only (the setup file has already pointed
 * DATABASE_URL there). The demo's ids are global, so a database holds one demo, in the organisation DEMO_ORGANISATION_CODE names
 * (unset: ORG, the seed's). On a scratch database that already holds the demo the first run writes nothing too; the first-load path was
 * proved once on a throwaway database when this was written (decisions log, Phase 1d).
 */

const ROOT = path.join(__dirname, "../../..");
const TSX = path.join(ROOT, "node_modules/tsx/dist/cli.mjs");
const ORG_CODE = process.env.DEMO_ORGANISATION_CODE ?? "ORG";

function demo(mode: string) {
  const run = spawnSync(process.execPath, [TSX, "prisma/demo.ts", mode], {
    cwd: ROOT,
    env: { ...process.env, ORGANISATION_CODE: ORG_CODE },
    encoding: "utf8",
    timeout: 900_000,
  });
  return { status: run.status, out: `${run.stdout ?? ""}${run.stderr ?? ""}` };
}

async function counts(): Promise<Record<string, number>> {
  const tables = await db.$queryRaw<{ name: string }[]>`SELECT tablename::text AS name FROM pg_tables WHERE schemaname = current_schema() ORDER BY tablename`;
  const result: Record<string, number> = {};
  for (const { name } of tables) {
    const [row] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`);
    result[name] = Number(row.n);
  }
  return result;
}

describe("the demo loader is additive (Phase 1d)", () => {
  it("a second load writes nothing: every table holds what it held after the first", { timeout: 2_000_000 }, async () => {
    if (!(await db.organisation.findUnique({ where: { code: ORG_CODE }, select: { id: true } }))) {
      await db.organisation.create({ data: { code: ORG_CODE, name: "Your organisation" } });
    }
    const first = demo("load");
    expect(first.status, first.out).toBe(0);
    const after1 = await counts();
    expect(after1.OrgUnit).toBeGreaterThan(0);
    expect(after1.AuditEntry).toBeGreaterThan(0);

    const second = demo("load");
    expect(second.status, second.out).toBe(0);
    expect(second.out).toMatch(/already loaded: nothing was written/);
    expect(await counts()).toEqual(after1);
  });

  it("the retired wipe refuses, exits non-zero and removes nothing", { timeout: 1_000_000 }, async () => {
    const before = await counts();
    const wipe = demo("wipe");
    expect(wipe.status).toBe(1);
    expect(wipe.out).toMatch(/demo:wipe is retired: nothing was removed/);
    expect(await counts()).toEqual(before);
  });
});
