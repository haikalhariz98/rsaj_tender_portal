import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The canonical lock order for every post-award write (rulings, 6.12 conditions): Requisition →
 * SourcingExercise → (window, party, sale) → Award → Contract → Certificate → the domain row → Supplier
 * last. Source scans, so a new act cannot quietly take another order.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const ACTIONS = "src/app/projects/[id]/actions.ts";

/// Each exported action's body, by name.
function actions(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const parts = src.split(/\nexport async function /);
  for (const p of parts.slice(1)) out.set(p.slice(0, p.indexOf("(")), p.split(/\n(?:async )?function /)[0]);
  return out;
}

function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}

describe("one lock order (withLockedContract)", () => {
  it("withLockedAward takes the requisition, the exercise and the award, in that order", () => {
    const repo = read("src/lib/award/repo.ts");
    const body = repo.slice(repo.indexOf("export async function withLockedAward"), repo.indexOf("export async function withLockedExerciseForAward"));
    const at = (t: string) => body.indexOf(`FROM "${t}" WHERE id`);
    expect(at("Requisition")).toBeGreaterThan(-1);
    expect(at("Requisition")).toBeLessThan(at("SourcingExercise"));
    expect(at("SourcingExercise")).toBeLessThan(at("Award"));
  });

  it("withLockedContract takes the award's locks first, then the contract", () => {
    const repo = read("src/lib/contract/repo.ts");
    const body = repo.slice(repo.indexOf("export async function withLockedContract"));
    expect(body.indexOf("withLockedAward(")).toBeGreaterThan(-1);
    expect(body.indexOf("withLockedAward(")).toBeLessThan(body.indexOf(`FROM "Contract" WHERE id`));
  });

  it("every contract act runs inside inContract, which is withLockedContract, and reads the clock once on entry", () => {
    const src = read(ACTIONS);
    const helper = src.slice(src.indexOf("async function inContract"), src.indexOf("async function audit("));
    expect(helper).toContain("withLockedContract(");
    const acts = actions(src);
    expect(acts.size).toBeGreaterThan(20);
    for (const [name, body] of acts) {
      expect(body, name).toMatch(/return inContract\(/);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(body.indexOf("inContract("));
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
    }
  });

  it("an act locks only domain rows itself, after the contract; never a parent, and never the supplier", () => {
    const src = read(ACTIONS);
    const locked = [...src.matchAll(/FROM "(\w+)" WHERE id = \$\{\w+\} FOR UPDATE/g)].map((m) => m[1]);
    expect(locked.length).toBeGreaterThan(0);
    for (const t of locked) expect(["InsurancePolicy", "IssuedCopy", "CustodyItem"]).toContain(t);
    expect(src).not.toMatch(/FROM "(Requisition|SourcingExercise|Award|Contract|Supplier)"/);
    expect(src).not.toMatch(/db\.\$transaction|\bdb\./);
  });
});

describe("single writers", () => {
  it("only the RSAJ signature and its audited correction write the Contract Date", () => {
    const acts = actions(read(ACTIONS));
    const writers = [...acts].filter(([, body]) => /contractDate: (dayToDate\(contractDate\)|proposed)/.test(body)).map(([n]) => n);
    expect(writers.sort()).toEqual(["correctContractDate", "recordRsajSignature"]);
    // No other server action in the app writes it.
    for (const f of files("src/app")) {
      if (f === path.normalize(ACTIONS)) continue;
      const s = read(f);
      if (!s.startsWith('"use server"')) continue;
      expect(s, f).not.toMatch(/contractDate:/);
    }
  });

  it("nothing in 6.12 writes ACTIVE: only 6.13's possession act does", () => {
    expect(read(ACTIONS)).not.toMatch(/"ACTIVE"/);
    for (const f of files("src/app")) {
      const s = read(f);
      if (s.startsWith('"use server"')) expect(s, f).not.toMatch(/status: "ACTIVE"/);
    }
  });

  it("the EXECUTED baseline version is written only by the RSAJ signature", () => {
    const acts = actions(read(ACTIONS));
    const writers = [...acts].filter(([, body]) => /"EXECUTED", ""/.test(body)).map(([n]) => n);
    expect(writers).toEqual(["recordRsajSignature"]);
  });
});

// ------------------------------------------------------------------ 6.12 review R-7: the stricter scan
//
// The scans above match one written form in one file. These match every way a contract row or a baseline
// row is written (any Prisma write on the model, the moveTo helper's extra fields, raw SQL naming the
// column), in every non-test source file under src/app and src/lib, and name the function each write is
// in. A write outside the allowed functions fails, wherever it is and however it is spelled.

interface Source {
  file: string;
  src: string;
}

/// The argument list of the call whose "(" is at `open`, strings skipped, parentheses balanced.
function callArgs(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '"' || ch === "'" || ch === "`") {
      for (i++; i < src.length && src[i] !== ch; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (ch === "(") depth++;
    else if (ch === ")" && --depth === 0) return src.slice(open, i + 1);
  }
  return src.slice(open);
}

/// The named function (declaration or const arrow) a position is inside.
function enclosing(src: string, at: number): string {
  let name = "(top level)";
  let best = -1;
  for (const re of [/(?:^|\n)(?:export[ \t]+)?(?:default[ \t]+)?(?:async[ \t]+)?function\*?[ \t]+(\w+)/g, /(?:^|\n)(?:export[ \t]+)?const[ \t]+(\w+)[ \t]*=[ \t]*(?:async[ \t]*)?(?:\(|\w+[ \t]*=>)/g]) {
    for (const m of src.matchAll(re)) if (m.index! < at && m.index! > best) [best, name] = [m.index!, m[1]];
  }
  return name;
}

/// "use server" as a module directive however it is written: either quote, after a BOM, blank lines or comments.
export function isServerModule(src: string): boolean {
  const head = src.replace(/^﻿/, "").replace(/^(?:\s+|\/\/[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, "");
  return /^(["'])use server\1/.test(head);
}

const PRISMA_WRITE = "(?:update|updateMany|create|createMany|createManyAndReturn|upsert)";

/// Every write that can set Contract.contractDate, by file and function.
function contractDateWrites(files: readonly Source[]): string[] {
  const out: string[] = [];
  for (const { file, src } of files) {
    for (const m of src.matchAll(new RegExp(`\\.contract\\.${PRISMA_WRITE}\\(`, "g"))) {
      const args = callArgs(src, m.index! + m[0].length - 1);
      const fn = enclosing(src, m.index!);
      // A spread could carry the Contract Date unseen; only the status helper spreads, and its callers are scanned below.
      if (/\bcontractDate\b\s*:|\bcontractDate\b\s*[,}]/.test(args) || (/\.\.\.\s*\w/.test(args) && fn !== "moveTo")) out.push(`${file} › ${fn}`);
    }
    for (const m of src.matchAll(/\bmoveTo\(/g)) {
      if (enclosing(src, m.index!) === "moveTo") continue;
      if (/\bcontractDate\b/.test(callArgs(src, m.index! + m[0].length - 1))) out.push(`${file} › ${enclosing(src, m.index!)}`);
    }
    for (const m of src.matchAll(/\$(?:executeRaw|queryRaw)(?:Unsafe)?\s*[`(]/g)) {
      const rest = src.slice(m.index!, src.indexOf(";", m.index!) === -1 ? undefined : src.indexOf(";", m.index!));
      if (/"Contract"/.test(rest) && /"contractDate"/.test(rest)) out.push(`${file} › ${enclosing(src, m.index!)}`);
    }
  }
  return [...new Set(out)].sort();
}

/// Every write of a baseline row, and every EXECUTED version written, by file and function.
function baselineWrites(files: readonly Source[]): { rows: string[]; executed: string[] } {
  const rows: string[] = [];
  const executed: string[] = [];
  for (const { file, src } of files) {
    for (const m of src.matchAll(new RegExp(`\\.contractBaseline\\.${PRISMA_WRITE}\\(`, "g"))) {
      const where = `${file} › ${enclosing(src, m.index!)}`;
      rows.push(where);
      if (/"EXECUTED"/.test(callArgs(src, m.index! + m[0].length - 1))) executed.push(where);
    }
    for (const m of src.matchAll(/\bwriteVersion\(/g)) {
      const fn = enclosing(src, m.index!);
      if (fn === "writeVersion") continue;
      if (/"EXECUTED"/.test(callArgs(src, m.index! + m[0].length - 1))) executed.push(`${file} › ${fn}`);
    }
    for (const m of src.matchAll(/\$(?:executeRaw|queryRaw)(?:Unsafe)?\s*[`(]/g)) {
      const rest = src.slice(m.index!, src.indexOf(";", m.index!) === -1 ? undefined : src.indexOf(";", m.index!));
      if (/"ContractBaseline"/.test(rest) && /\b(INSERT|UPDATE)\b/i.test(rest)) rows.push(`${file} › ${enclosing(src, m.index!)}`);
    }
  }
  return { rows: [...new Set(rows)].sort(), executed: [...new Set(executed)].sort() };
}

/// Every write that can move a contract to ACTIVE.
function activeWrites(files: readonly Source[]): string[] {
  const out: string[] = [];
  for (const { file, src } of files) {
    for (const m of src.matchAll(new RegExp(`\\.contract\\.${PRISMA_WRITE}\\(|\\bmoveTo\\(`, "g"))) {
      if (/"ACTIVE"/.test(callArgs(src, m.index! + m[0].length - 1))) out.push(`${file} › ${enclosing(src, m.index!)}`);
    }
  }
  return out;
}

const SCANNED = [...files("src/app"), ...files("src/lib")].map((file) => ({ file, src: read(file) }));
const A = path.normalize(ACTIONS);

describe("single writers, scanned everywhere (R-7)", () => {
  it("the scan covers every server module, the award's acts, the document store's owners and src/lib", () => {
    const names = SCANNED.map((s) => s.file);
    for (const f of ["src/app/awards/actions.ts", "src/lib/documents/owners.ts", ACTIONS, "src/lib/contract/repo.ts"]) expect(names).toContain(path.normalize(f));
    expect(SCANNED.filter((s) => isServerModule(s.src)).length).toBeGreaterThan(20);
  });

  it("only the RSAJ signature and its audited correction can write the Contract Date", () => {
    expect(contractDateWrites(SCANNED)).toEqual([`${A} › correctContractDate`, `${A} › recordRsajSignature`]);
  });

  it("baseline rows are written only by preparation, the draft's keying and writeVersion; EXECUTED only by the RSAJ signature", () => {
    const w = baselineWrites(SCANNED);
    expect(w.rows).toEqual([`${A} › saveBaselineEntry`, `${A} › startPreparation`, `${A} › writeVersion`]);
    expect(w.executed).toEqual([`${A} › recordRsajSignature`]);
  });

  it("nothing anywhere moves a contract to ACTIVE (6.13's possession act will)", () => {
    expect(activeWrites(SCANNED)).toEqual([]);
  });
});

describe("the scan catches a third writer (self-test)", () => {
  const legit: Source = { file: "a.ts", src: 'export async function recordRsajSignature() {\n  await moveTo(c, "EXECUTED", { contractDate: dayToDate(d) });\n  await writeVersion(c, exec, "EXECUTED", "", {});\n}\n' };
  it("a plain update in another file", () => {
    const third: Source = { file: "b.ts", src: "'use server';\nexport async function sneaky(tx) {\n  await tx.contract.update({ where: { id }, data: { stampingRef: \"x\", contractDate: when } });\n}\n" };
    expect(contractDateWrites([legit, third])).toEqual(["a.ts › recordRsajSignature", "b.ts › sneaky"]);
  });
  it("shorthand, a spread, upsert, a const arrow and raw SQL", () => {
    const srcs: Source[] = [
      { file: "c.ts", src: "export const quiet = async (tx) => {\n  await tx.contract.updateMany({ where: {}, data: { contractDate } });\n};\n" },
      { file: "d.ts", src: "async function viaSpread(tx, extra) {\n  await db.contract.upsert({ where: {}, update: { ...extra }, create: {} });\n}\n" },
      { file: "e.ts", src: 'async function raw(tx) {\n  await tx.$executeRaw`UPDATE "Contract" SET "contractDate" = $' + "{d} WHERE id = $" + '{id}`;\n}\n' },
      { file: "f.ts", src: 'async function moved(c) {\n  await moveTo(c, "EXECUTED", { contractDate: x });\n}\n' },
    ];
    expect(contractDateWrites(srcs)).toEqual(["c.ts › quiet", "d.ts › viaSpread", "e.ts › raw", "f.ts › moved"]);
  });
  it("a third baseline writer, and an EXECUTED version written elsewhere", () => {
    const third: Source = { file: "g.ts", src: 'export async function backfill(tx) {\n  await tx.contractBaseline.create({ data: { version: 2, reason: "EXECUTED" } });\n}\nasync function other(c) {\n  await writeVersion(c, v, "EXECUTED", "", {});\n}\n' };
    const w = baselineWrites([legit, third]);
    expect(w.rows).toEqual(["g.ts › backfill"]);
    expect(w.executed).toEqual(["a.ts › recordRsajSignature", "g.ts › backfill", "g.ts › other"]);
  });
  it("an ACTIVE write by either path", () => {
    expect(activeWrites([{ file: "h.ts", src: 'async function possess(c) {\n  await moveTo(c, "ACTIVE");\n  await tx.contract.update({ data: { status: "ACTIVE" } });\n}\n' }])).toEqual(["h.ts › possess", "h.ts › possess"]);
  });
  it('"use server" is recognised however it is written', () => {
    for (const s of ['"use server";\n', "'use server'\n", "﻿\n\n// note\n/* block */\n\"use server\";\n", "/** doc */\n'use server';"]) expect(isServerModule(s), JSON.stringify(s)).toBe(true);
    for (const s of ['import x from "y";\n"use server";', '// "use server"\nexport const a = 1;']) expect(isServerModule(s), JSON.stringify(s)).toBe(false);
  });
});
