import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.12 re-review (consider items, scans):
 * - which baseline version is read only through baselineFor (in force on a day) or latestVersion (the one
 *   the next is built on): no hand-written "last of the list", no query ordering versions to take one;
 * - an arithmetical correction's priced figures are never written to a trail under the old keys
 *   ("tendered" / "corrected"), only under their registered SULIT keys.
 */

const ROOT = path.join(__dirname, "../../..");
function files(dir: string): string[] {
  return readdirSync(path.join(ROOT, dir)).flatMap((f) => {
    const rel = path.join(dir, f);
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) ? [rel] : [];
  });
}
const SOURCES = [...files("src/app"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: readFileSync(path.join(ROOT, file), "utf8") }));

export function handWrittenVersionReads(src: string): string[] {
  const out: string[] = [];
  if (!/\bbaselines?\b|contractBaseline|baselineRows/.test(src)) return out;
  for (const m of src.matchAll(/\b(\w+)\[\s*\1\.length\s*-\s*1\s*\]/g)) if (/version/i.test(m[1])) out.push(m[0]);
  for (const m of src.matchAll(/contractBaseline\s*\.\s*find(?:First|Many)\([^;]*?\bversion:\s*"desc"/g)) out.push(m[0].slice(0, 60));
  for (const m of src.matchAll(/baselines:\s*\{[\s\S]{0,200}?orderBy:\s*\{\s*version:\s*"desc"\s*\}[\s\S]{0,80}?take:\s*1/g)) out.push(m[0].slice(0, 60));
  return out;
}

export function oldCorrectionKeys(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(/(?:audit|diffFields|snapshotFields)\([^\n]*"ArithmeticCorrection"[^\n]*|(?:diffFields|snapshotFields)\([^\n]*itemRef[^\n]*/g)) if (/[{,]\s*(tendered|corrected)\s*:/.test(m[0])) out.push(m[0].slice(0, 80));
  return out;
}

describe("the baseline's version is read through baselineFor or latestVersion only", () => {
  it("no hand-written latest-version read anywhere (src/app, src/lib, prisma)", () => {
    const bad = SOURCES.filter((s) => s.file !== path.normalize("src/lib/contract/baseline.ts")).flatMap((s) => handWrittenVersionReads(s.src).map((x) => `${s.file}: ${x}`));
    expect(bad).toEqual([]);
  });
  it("self-test: the forms it catches", () => {
    expect(handWrittenVersionReads("const { versions } = baselineRows(k); const l = versions[versions.length - 1];")).toHaveLength(1);
    expect(handWrittenVersionReads('baselines: { where: {}, orderBy: { version: "desc" }, take: 1, select: {} }')).toHaveLength(1);
    expect(handWrittenVersionReads('await tx.contractBaseline.findFirst({ where: { contractId }, orderBy: { version: "desc" } })')).toHaveLength(1);
    expect(handWrittenVersionReads("baselineRows(k); latestVersion(versions);")).toEqual([]);
  });
});

describe("no SULIT figure under the old keys", () => {
  it("nothing writes tendered/corrected to an arithmetical correction's trail", () => {
    expect(SOURCES.flatMap((s) => oldCorrectionKeys(s.src).map((x) => `${s.file}: ${x}`))).toEqual([]);
  });
  it("self-test", () => {
    expect(oldCorrectionKeys('await audit(c, "ArithmeticCorrection", id, "x", "CREATE", diffFields(null, { itemRef, tendered: a, corrected: b }));')).toHaveLength(1);
    expect(oldCorrectionKeys('audit("ArithmeticCorrection", cid, l, "CREATE", at, diffFields(null, { itemRef: x.item, tendered: x.tendered }));')).toHaveLength(1);
    expect(oldCorrectionKeys('await audit(c, "ArithmeticCorrection", id, "x", "CREATE", diffFields(null, { itemRef, tenderedLineAmount: a, correctedLineAmount: b }));')).toEqual([]);
  });
});
