import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Sign-in programme Phase 0: one issuer. A reference is only ever drawn by `issueReference`, which locks the series row
 * (`SELECT ... FOR UPDATE`) before it reads and advances it. The configuration editor is the only other writer of a series
 * (it sets the pattern and may raise the next serial), and it takes the same lock. Anything else that writes a series
 * (a read-modify-write of `nextSerial` in a server action, as the sitting reference did until Phase 0) can issue one number
 * twice, so a new writer is a failing test and a decision, not a quiet addition.
 *
 * Scope: `src/`, the product. The demo loaders in `prisma/` seed series on a quiet database and are not the product's issuers.
 * Blind spots (declared): a series reached through a variable that was not named `numberingSeries`, or raw SQL assembled
 * from pieces, is not seen; the raw-SQL pattern reads the table named in a template or string.
 */

const ROOT = path.join(__dirname, "../../..");
const ISSUER = "src/lib/numbering/issue.ts";
const EDITOR = "src/app/configuration/numbering/actions.ts";
const ALLOWED = [ISSUER, EDITOR];

const READS = "findUnique|findFirst|findMany|findUniqueOrThrow|findFirstOrThrow|count|aggregate|groupBy";

/// What in a source touches a numbering series other than by reading it.
export function seriesWrites(src: string): string[] {
  const text = lex(src, { only: "comments" });
  const found: string[] = [];
  // Every use of the model's client delegate that is not a plain read: a write, or an alias the scan cannot follow.
  for (const m of text.matchAll(new RegExp(`\\bnumberingSeries\\b(?!\\s*\\??\\.\\s*(?:${READS})\\b)`, "g"))) {
    found.push(`numberingSeries${text.slice(m.index! + "numberingSeries".length, m.index! + "numberingSeries".length + 24).split("\n")[0]}`.trim());
  }
  for (const m of text.matchAll(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\s+(?:TABLE\s+)?"NumberingSeries"/gi)) found.push(`raw SQL ${m[0]}`);
  return found;
}

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (rel === "src/generated") return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

describe("one issuer of references (sign-in programme Phase 0)", () => {
  it("no file in src writes a numbering series except the issuer and the configuration editor", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (ALLOWED.includes(f)) continue;
      const w = seriesWrites(readFileSync(path.join(ROOT, f), "utf8"));
      if (w.length > 0) offenders.push(`${f}: ${w.join("; ")}`);
    }
    expect(offenders).toEqual([]);
  });

  it("no other file forms a reference from a series or advances one: formatReference and afterIssuing are the issuer's", () => {
    const offenders: string[] = [];
    for (const f of files("src")) {
      if (f === ISSUER || f === "src/lib/numbering/series.ts") continue;
      if (/\b(?:formatReference|afterIssuing)\b/.test(lex(readFileSync(path.join(ROOT, f), "utf8"), { only: "comments" }))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("the two writers lock the series row before they read it, and the editor writes only under that lock", () => {
    const issuer = lex(readFileSync(path.join(ROOT, ISSUER), "utf8"), { only: "comments" });
    expect(issuer.indexOf('FROM "NumberingSeries"')).toBeGreaterThan(-1);
    expect(issuer.indexOf("FOR UPDATE")).toBeGreaterThan(issuer.indexOf('FROM "NumberingSeries"'));
    expect(issuer.indexOf("tx.numberingSeries.findUniqueOrThrow")).toBeGreaterThan(issuer.indexOf("FOR UPDATE"));
    expect(issuer.indexOf("tx.numberingSeries.update")).toBeGreaterThan(issuer.indexOf("tx.numberingSeries.findUniqueOrThrow"));

    const editor = lex(readFileSync(path.join(ROOT, EDITOR), "utf8"), { only: "comments" });
    const save = editor.slice(editor.indexOf("export async function saveSeries"));
    const lock = save.indexOf(`FROM "NumberingSeries" WHERE id = \${current.id} FOR UPDATE`);
    expect(lock).toBeGreaterThan(-1);
    // The stored row the floor and the kept serial come from is read after the lock, on the transaction, never on `db`.
    expect(save.indexOf("stored = await tx.numberingSeries.findFirst")).toBeGreaterThan(lock);
    expect(save.indexOf("serialFor(storedSeries, now)")).toBeGreaterThan(lock);
    expect(save.indexOf("afterConfiguring(")).toBeGreaterThan(lock);
    expect(save.indexOf("tx.numberingSeries.update")).toBeGreaterThan(save.indexOf("afterConfiguring("));
    expect(save).not.toMatch(/db\.numberingSeries\.(?:findUnique|findFirst)\(/);
  });

  it("the sitting's number comes from the issuer: scheduleSitting numbers through createNumberedSitting, which calls issueReference", () => {
    const action = lex(readFileSync(path.join(ROOT, "src/app/committees/actions.ts"), "utf8"), { only: "comments" });
    const schedule = action.slice(action.indexOf("export async function scheduleSitting"), action.indexOf("export async function editSitting"));
    expect(schedule).toContain("createNumberedSitting(tx,");
    expect(schedule).not.toMatch(/formatReference|serialFor|afterIssuing|nextSerial/);
    const lib = lex(readFileSync(path.join(ROOT, "src/lib/committee/sitting-number.ts"), "utf8"), { only: "comments" });
    expect(lib).toContain("issueReference(tx, input.organisationId, key, input.day)");
    // The meeting row is made after the number, in the same transaction the caller passed.
    expect(lib.indexOf("tx.meeting.create")).toBeGreaterThan(lib.indexOf("issueReference("));
  });

  describe("the scan itself", () => {
    it("catches a write, an alias, and raw SQL; passes a read", () => {
      expect(seriesWrites("await tx.numberingSeries.update({ where: { id }, data: { nextSerial: 2 } });")).toHaveLength(1);
      expect(seriesWrites("await db.numberingSeries.upsert({});")).toHaveLength(1);
      expect(seriesWrites("const s = tx.numberingSeries;\nawait s.update({});")).toHaveLength(1);
      expect(seriesWrites('await tx.$executeRaw`UPDATE "NumberingSeries" SET "nextSerial" = 9`;')).toHaveLength(1);
      expect(seriesWrites('await tx.$executeRaw`INSERT INTO "NumberingSeries" (id) VALUES (1)`;')).toHaveLength(1);
      expect(seriesWrites("const s = await db.numberingSeries.findUnique({ where: { id } });")).toEqual([]);
      expect(seriesWrites("const n = await tx.numberingSeries.count();")).toEqual([]);
      expect(seriesWrites(`await tx.$queryRaw\`SELECT id FROM "NumberingSeries" WHERE id = \${id} FOR UPDATE\`;`)).toEqual([]);
    });
    it("does not read comments as writes", () => {
      expect(seriesWrites("// tx.numberingSeries.update(...) was here\n/* db.numberingSeries.create */\nconst a = 1;")).toEqual([]);
    });
  });
});
