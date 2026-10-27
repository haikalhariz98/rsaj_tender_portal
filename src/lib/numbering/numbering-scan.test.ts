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
 * Scope: `src/`, `prisma/` and `scripts/`: the demo loaders run additively on a live development database, so they are not
 * exempt from the rule that nothing but the issuer advances a series. They may seed or remove a series (the demo's own
 * configuration) and one may only raise a serial that a later load must not set back (`raiseSeries`, never back); each file's
 * allowance is named below, with its reason. Blind spots (declared): a series reached through a variable that was not named
 * `numberingSeries`, or raw SQL assembled from pieces, is not seen; the raw-SQL pattern reads the table named in a template.
 */

const ROOT = path.join(__dirname, "../../..");
const ISSUER = "src/lib/numbering/issue.ts";
// Phase 5b: the numbering editor moved from actions.ts (now only a proposal) to core.ts, which runs when a second person applies the change. The rule is unchanged: the same code, the same lock.
const EDITOR = "src/app/configuration/numbering/core.ts";
const ALLOWED = [ISSUER, EDITOR];

const READS = "findUnique|findFirst|findMany|findUniqueOrThrow|findFirstOrThrow|count|aggregate|groupBy";

/// What a source does to a numbering series other than read it: the verbs of every use of the model's client delegate that is
/// not a plain read ("alias" where it is not called, so the scan cannot follow it), and the verbs of raw SQL naming the table.
export function seriesWrites(src: string): string[] {
  const text = lex(src, { only: "comments" });
  const found: string[] = [];
  for (const m of text.matchAll(new RegExp(`\\bnumberingSeries\\b(?!\\s*\\??\\.\\s*(?:${READS})\\b)(?:\\s*\\??\\.\\s*(\\w+))?`, "g"))) found.push(m[1] ?? "alias");
  for (const m of text.matchAll(/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|TRUNCATE)\s+(?:TABLE\s+)?"NumberingSeries"/gi)) found.push(`raw ${m[1].toUpperCase().replace(/\s+/g, " ")}`);
  return found;
}

/// Who may do what to a series besides the issuer and the editor, and why. A verb not listed for a file is a failure.
const SEEDERS: Readonly<Record<string, { verbs: readonly string[]; why: string }>> = {
  // Phase 1d (ADR 0034 D11): the demo wipe is retired, so neither loader removes a series any more; deleteMany is no longer allowed.
  "prisma/demo.ts": { verbs: ["createMany"], why: "seeds the demo's series" },
  "prisma/demo-award.ts": { verbs: ["create"], why: "seeds the demo's award series" },
  "prisma/demo-evaluation.ts": { verbs: ["create"], why: "seeds the demo's evaluation-report series" },
  "prisma/demo-suppliers.ts": { verbs: ["create"], why: "seeds the demo's supplier series" },
  "prisma/demo-lifecycle.ts": { verbs: ["create", "update"], why: "seeds the variation series, then raises serials the demo took past what the portal would issue (never back, raiseSeries)" },
  // Phase 2 close-out stage A: the contract matters' series, created once where the demo has none (prisma/demo-time.ts).
  "prisma/demo-time.ts": { verbs: ["create"], why: "seeds the demo's contract-matter series" },
  // Phase 2 close-out: the database tests' contract fixture gives each test organisation its certificate series (only *.db.test.ts files import it).
  "src/lib/test-db/contract.fixture.ts": { verbs: ["create"], why: "seeds a test organisation's certificate series" },
  "prisma/demo-series.ts": { verbs: ["update", "alias"], why: "raiseSeries: moves a series on to a serial a loaded part took, never back; its parameter is typed Pick<PrismaClient, \"numberingSeries\"> (the alias)" },
  "scripts/check-numbering-concurrency.ts": { verbs: ["create", "delete"], why: "makes and removes its own temporary series" },
  "src/lib/starter/apply.ts": { verbs: ["create"], why: "a starter pack seeds series only into an organisation with none (ADR 0043 D1); it never advances one" },
};

/// The first argument of every call of `issueReference(`: the client it is given. A call's declaration (`function issueReference(`)
/// and an import are not calls. The cast on the argument is kept in what is returned (`tx as never`), so it can be read.
export function issuerClients(src: string): string[] {
  const text = lex(src, { only: "comments" });
  const found: string[] = [];
  for (const m of text.matchAll(/(?<!function\s)(?<![\w.$])issueReference\s*\(\s*([^,)]+?)\s*,/g)) found.push(m[1]);
  return found;
}

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = `${dir}/${f}`;
    if (rel === "src/generated" || rel === "prisma/migrations") return [];
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

describe("one issuer of references (sign-in programme Phase 0)", () => {
  it("nothing in src, prisma or scripts writes a series except the issuer, the editor and the named seeders, and only in their named ways", () => {
    const offenders: string[] = [];
    const seen = new Set<string>();
    for (const f of [...files("src"), ...files("prisma"), ...files("scripts")]) {
      if (ALLOWED.includes(f)) continue;
      const w = seriesWrites(readFileSync(path.join(ROOT, f), "utf8"));
      if (w.length === 0) continue;
      seen.add(f);
      const ok = SEEDERS[f]?.verbs ?? [];
      const bad = w.filter((v) => !ok.includes(v));
      if (bad.length > 0) offenders.push(`${f}: ${bad.join(", ")}${SEEDERS[f] ? " (allowed: " + ok.join(", ") + ")" : ""}`);
    }
    expect(offenders).toEqual([]);
    // An allowance for a file that no longer writes a series is stale: remove it.
    expect([...Object.keys(SEEDERS)].filter((f) => !seen.has(f))).toEqual([]);
  });

  it("no other file forms a reference from a series or advances one: formatReference and afterIssuing are the issuer's", () => {
    const offenders: string[] = [];
    for (const f of [...files("src"), ...files("prisma"), ...files("scripts")]) {
      if (f === ISSUER || f === "src/lib/numbering/series.ts") continue;
      if (/\b(?:formatReference|afterIssuing)\b/.test(lex(readFileSync(path.join(ROOT, f), "utf8"), { only: "comments" }))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it("every call of the issuer passes a transaction's client: its FOR UPDATE does nothing outside one", () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const f of [...files("src"), ...files("prisma"), ...files("scripts")]) {
      for (const client of issuerClients(readFileSync(path.join(ROOT, f), "utf8"))) {
        calls++;
        if (!/^(?:tx|c|trx)\b/.test(client)) offenders.push(`${f}: issueReference(${client}, ...)`);
      }
    }
    expect(calls).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("the issuer's own transaction rule", () => {
    expect(issuerClients("await issueReference(db as never, org, 'x', d);")).toEqual(["db as never"]);
    expect(issuerClients("await db.$transaction((tx) => issueReference(tx as never, org, 'x', d));")).toEqual(["tx as never"]);
    expect(issuerClients("issueReference(this.db, a, b, c)")).toEqual(["this.db"]);
    expect(issuerClients("// issueReference(db, a)\nconst a = 1;")).toEqual([]);
    expect(issuerClients("import { issueReference } from 'x'; export async function issueReference(tx: Tx, a: string) {}")).toEqual([]);
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
      expect(seriesWrites("await tx.numberingSeries.update({ where: { id }, data: { nextSerial: 2 } });")).toEqual(["update"]);
      expect(seriesWrites("await db.numberingSeries.upsert({});")).toEqual(["upsert"]);
      expect(seriesWrites("await db.numberingSeries.createMany({});")).toEqual(["createMany"]);
      expect(seriesWrites("const s = tx.numberingSeries;\nawait s.update({});")).toEqual(["alias"]);
      expect(seriesWrites('await tx.$executeRaw`UPDATE "NumberingSeries" SET "nextSerial" = 9`;')).toEqual(["raw UPDATE"]);
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
