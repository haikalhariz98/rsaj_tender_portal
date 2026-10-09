import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { closing, enclosingFn, lex, spans } from "@/lib/scan/source";

/**
 * 6.14 increment 2: who writes the printed form, the typing corrections and the terms, and in what lock order (the
 * single-writer and lock-order scans extended to increment 2's acts), on the shared lexer.
 *
 * - Every Prisma write on FormField, TextCorrection, TextCorrectionForm, Term and TermAlias, and every write of a
 *   template's page count, is in its own act (or the demo's loader, which writes demo rows only).
 * - The glossary's acts run inside `inGlossary`, which takes the organisation's row FOR UPDATE first (as the other
 *   configuration acts do); a
 *   correction then locks every form it names or named FOR UPDATE, in id order, before it reads them; a form's
 *   printed fields and pages are written inside `onTemplate`, which locks the form FOR UPDATE first. A certificate's
 *   pin reads its form FOR SHARE after the certificate's own lock, so the two can only wait for each other one way.
 */

const ROOT = process.cwd();
const read = (f: string) => readFileSync(join(ROOT, f), "utf8");
function walk(dir: string): string[] {
  return readdirSync(join(ROOT, dir)).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(join(ROOT, p)).isDirectory()) return n === "generated" || n === "node_modules" ? [] : walk(p);
    return /\.(ts|tsx)$/.test(n) && !/\.test\.tsx?$/.test(n) ? [p] : [];
  });
}

const MODELS = ["formField", "textCorrection", "textCorrectionForm", "term", "termAlias"];
const OPS = ["create", "createMany", "createManyAndReturn", "update", "updateMany", "updateManyAndReturn", "upsert", "delete", "deleteMany"];
const FORM = "src/app/configuration/templates/form-core.ts";
const GLOSSARY = "src/app/configuration/templates/glossary-core.ts";
const ALLOW: Readonly<Record<string, readonly string[]>> = {
  [`${FORM} › savePrintedField`]: ["formField.update", "formField.create"],
  [`${FORM} › removePrintedField`]: ["formField.delete"],
  [`${GLOSSARY} › saveCorrection`]: ["textCorrection.update", "textCorrection.create", "textCorrectionForm.deleteMany", "textCorrectionForm.create"],
  [`${GLOSSARY} › removeCorrection`]: ["textCorrection.delete"],
  [`${GLOSSARY} › saveTerm`]: ["term.update", "term.create", "termAlias.deleteMany", "termAlias.create"],
  [`${GLOSSARY} › removeTerm`]: ["term.delete"],
};
/// The demo's loader writes demo rows of these models (prisma/, never src/).
const DEMO_DIR = "prisma";

export function scanFidelityWrites(files: readonly { file: string; src: string }[]): { where: string; op: string }[] {
  const out: { where: string; op: string }[] = [];
  const re = new RegExp(`(?<![\\w$])(${MODELS.join("|")})\\s*\\??\\.\\s*(${OPS.join("|")})\\s*\\(`, "g");
  for (const { file, src } of files) {
    const m = lex(src);
    const sp = spans(m);
    for (const x of m.matchAll(re)) out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: `${x[1]}.${x[2]}` });
    // A handle taken off a client other than to call it (an alias, a bracketed op) is a write the scan could not read.
    // (Only on a client: `term` is also a plain property of other records.)
    for (const x of m.matchAll(new RegExp(`(?<![\\w$])(?:tx|db|client)\\s*\\.\\s*(${MODELS.join("|")})\\b(?!\\s*\\??\\.\\s*(?:${OPS.join("|")}|findUnique|findUniqueOrThrow|findFirst|findFirstOrThrow|findMany|count|aggregate|groupBy)\\s*\\()`, "g"))) out.push({ where: `${file} › ${enclosingFn(sp, x.index!)}`, op: `${x[1]} handle taken` });
  }
  return out;
}

describe("increment 2's configuration has one writer each", () => {
  const product = walk("src").map((file) => ({ file, src: read(file) }));
  const found = scanFidelityWrites(product);
  it("every write of a printed field, a correction or a term is its own act's", () => {
    expect(found.filter((w) => !ALLOW[w.where]?.includes(w.op)).map((w) => `${w.where} · ${w.op}`)).toEqual([]);
  });
  it("and every act on the list writes as listed (the list cannot go stale)", () => {
    const seen = new Set(found.map((w) => `${w.where}|${w.op}`));
    for (const [where, ops] of Object.entries(ALLOW)) for (const op of ops) expect(seen.has(`${where}|${op}`), `${where} ${op}`).toBe(true);
  });
  it("a template's page count is written only by savePageCount (a Prisma write naming pageCount)", () => {
    const writers = product.flatMap(({ file, src }) => {
      const m = lex(src, { only: "comments" });
      const sp = spans(lex(src));
      return [...m.matchAll(/documentTemplate\s*\??\.\s*(update|updateMany|create|upsert)\s*\(/g)].filter((x) => /\bpageCount\b/.test(m.slice(x.index!, closing(m, x.index! + x[0].length - 1)))).map((x) => `${file} › ${enclosingFn(sp, x.index!)}`);
    });
    expect(writers).toEqual([`${FORM} › savePageCount`]);
  });
  it("the scan catches every Prisma write op, a spread or not, outside the allowed acts (stricter)", () => {
    const w = (src: string) => scanFidelityWrites([{ file: "src/app/x.ts", src }]).map((x) => x.op);
    expect(w("async function f(tx) {\n  await tx.term.createMany({ data: [] });\n}\n")).toEqual(["term.createMany"]);
    expect(w("async function f(tx) {\n  await tx.formField.updateManyAndReturn({ where: {}, data: { ...x } });\n}\n")).toEqual(["formField.updateManyAndReturn"]);
    expect(w("async function f(tx) {\n  await tx.textCorrectionForm.createManyAndReturn({ data: rows });\n}\n")).toEqual(["textCorrectionForm.createManyAndReturn"]);
  });
  it("no raw SQL writes a printed field, a correction, a term, or a template's page count (stricter)", () => {
    const RAW = /\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM|MERGE\s+INTO)\s+\\?"(FormField|TextCorrection|TextCorrectionForm|Term|TermAlias)\\?"|UPDATE\s+\\?"DocumentTemplate\\?"[^`;]*\bpageCount\b/i;
    expect(product.filter(({ src }) => RAW.test(lex(src, { only: "comments" }))).map((p) => p.file)).toEqual([]);
    expect(RAW.test('await tx.$executeRaw`UPDATE "DocumentTemplate" SET "pageCount" = 3`')).toBe(true);
    expect(RAW.test('await tx.$executeRaw`DELETE FROM "TermAlias"`')).toBe(true);
  });
  it("the scan catches an evasion: an alias, a bracketed op, a write elsewhere", () => {
    const w = (src: string) => scanFidelityWrites([{ file: "src/app/x.ts", src }]).map((x) => x.op);
    expect(w("async function f(tx) {\n  const t = tx.term;\n  await t.create({ data: {} });\n}\n")).toContain("term handle taken");
    expect(w('async function f(tx) {\n  await tx.textCorrection["delete"]({ where: {} });\n}\n')).toContain("textCorrection handle taken");
    expect(w("async function f(tx) {\n  await tx.formField.create({ data: {} });\n}\n")).toEqual(["formField.create"]);
  });
  it("the demo writes only from prisma/ (src never seeds these)", () => {
    expect(DEMO_DIR).toBe("prisma");
    expect(found.every((w) => w.where.startsWith("src/"))).toBe(true);
  });
});

describe("increment 2's lock order", () => {
  const g = read(GLOSSARY);
  const fa = read(FORM);
  const body = (src: string, name: string) => {
    const m = lex(src, { only: "comments" });
    const at = m.indexOf(`function ${name}(`);
    const open = m.indexOf("{", m.indexOf(")", at));
    return m.slice(open, closing(m, open));
  };
  it("the glossary's every act runs inside inGlossary, which takes the organisation's row FOR UPDATE first", () => {
    // Phase 1c (ADR 0034 D10): the glossary's organisation is the signed-in person's (`inGlossary(scope, fn)`); the lock is as pinned.
    expect(body(g, "inGlossary")).toMatch(/^\{[^]*?db\.\$transaction\(async \(tx\) => \{\s*await tx\.\$queryRaw`SELECT id FROM "Organisation" WHERE id = \$\{o\.id\} FOR UPDATE`;\s*return fn\(tx, o\.id\);/);
    for (const name of ["saveCorrection", "removeCorrection", "saveTerm", "removeTerm"]) expect(body(g, name), name).toMatch(/return inGlossary\(actor, async \(tx, orgId\) => \{/);
  });
  it("a correction locks every form it names or named, in id order, before it reads one", () => {
    const save = body(g, "saveCorrection");
    const lockAt = save.search(/for \(const t of touched\) await tx\.\$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = \$\{t\} FOR UPDATE`/);
    expect(lockAt).toBeGreaterThan(0);
    expect(save).toMatch(/const touched = \[\.\.\.new Set\(\[\.\.\.templateIds, \.\.\.\(before\?\.forms\.map\(\(f\) => f\.templateId\) \?\? \[\]\)\]\)\]\.sort\(\);/);
    expect(save.indexOf("tx.documentTemplate.findMany")).toBeGreaterThan(lockAt);
    expect(body(g, "removeCorrection")).toMatch(/for \(const t of row\.forms\.map\(\(f\) => f\.templateId\)\.sort\(\)\) await tx\.\$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = \$\{t\} FOR UPDATE`;[^]*tx\.textCorrection\.delete/);
  });
  it("a form's printed fields and pages are written inside onTemplate, which locks the form FOR UPDATE first", () => {
    expect(body(fa, "onTemplate")).toMatch(/db\.\$transaction\(async \(tx\) => \{\s*await tx\.\$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = \$\{templateId\} FOR UPDATE`;/);
    // Phase 1c (ADR 0034 D10): the lock is now asked for the signed-in person's organisation first; the call is otherwise as pinned.
    for (const name of ["savePageCount", "savePrintedField", "removePrintedField"]) expect(body(fa, name), name).toMatch(/return onTemplate\(actor, templateId, async \(tx, t\) => \{/);
  });
  it("the pin reads the form FOR SHARE after the certificate's lock: the one order with the configuration's FOR UPDATE", () => {
    expect(body(read("src/lib/certificate/write.ts"), "recordSignature")).toMatch(/if \(cert\.templateId\) await c\.tx\.\$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = \$\{cert\.templateId\} FOR SHARE`;\s*const t = await templateNow\(cert\.templateId, c\.tx\);/);
  });
  it("per function (stricter): wherever one function locks both, the organisation's row comes before the form", () => {
    for (const f of walk("src")) {
      const src = read(f);
      const m = lex(src, { only: "comments" });
      for (const sp of spans(lex(src))) {
        const body = m.slice(sp.from, sp.to);
        const org = body.search(/FROM "Organisation" WHERE id = [^`]*FOR UPDATE/);
        const form = body.search(/FROM "DocumentTemplate" WHERE id = [^`]*FOR (UPDATE|SHARE)/);
        if (org >= 0 && form >= 0) expect(org < form, `${f} › ${sp.name}`).toBe(true);
      }
    }
  });
  it("S-3: a template's save reads the terms its text cites under the organisation's lock, then locks the form", () => {
    const save = body(read("src/app/configuration/templates/core.ts"), "saveTemplate");
    const org = save.search(/await tx\.\$queryRaw`SELECT id FROM "Organisation" WHERE id = \$\{orgId\} FOR UPDATE`/);
    const terms = save.indexOf("await tx.term.findMany(");
    const form = save.search(/await tx\.\$queryRaw`SELECT id FROM "DocumentTemplate" WHERE id = \$\{id\} FOR UPDATE`/);
    expect(org).toBeGreaterThan(0);
    expect(terms).toBeGreaterThan(org);
    expect(form).toBeGreaterThan(terms);
    expect(save).not.toMatch(/\bdb\.term\./);
  });
  it("nothing locks a form and then the organisation: the organisation's row comes first wherever both are locked", () => {
    for (const f of walk("src")) {
      const m = lex(read(f), { only: "comments" });
      const org = m.search(/FROM "Organisation" WHERE id = [^`]*FOR UPDATE/);
      const form = m.search(/FROM "DocumentTemplate" WHERE id = [^`]*FOR (UPDATE|SHARE)/);
      if (org >= 0 && form >= 0) expect(org < form, f).toBe(true);
    }
  });
});
