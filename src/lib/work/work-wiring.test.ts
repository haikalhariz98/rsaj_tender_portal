import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lex } from "@/lib/scan/source";

/**
 * Workspace 3a step 3, the source scans (plan §5): what the work acts must never do and must always do, read from the code. What they do not read (declared): whether a
 * rule's result is used beyond refusing (the rules' tests and `work-flow.db.test.ts` hold that), and any file outside `src/lib/work` and `work-actions.ts`.
 */

const ROOT = path.resolve(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const store = read("src/lib/work/store.ts");
const actions = read("src/app/projects/[id]/work-actions.ts");
const fn = (src: string, name: string) => {
  const at = src.search(new RegExp(`^(?:export )?async function ${name}\\(`, "m"));
  expect(at, name).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf("\n}\n", at));
};
/// The text of the call whose opening parenthesis is at `from`, to its closing one.
function callText(src: string, from: number): string {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(from, i + 1);
  }
  return src.slice(from);
}
/// Every file of the work layer that is not a test, and every other product file that names a work table.
const walk = (dir: string): string[] => readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "generated" ? [] : walk(`${dir}/${e.name}`)) : [`${dir}/${e.name}`]));
const product = walk("src").filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !f.endsWith(".fixture.ts"));

describe("nothing writes a contractor as the assignee (WS-9: the column exists, 3b writes it)", () => {
  it("no product file names assigneeSupplierAccountId but the generated client (and the schema's own rules)", () => {
    const naming = product.filter((f) => /assigneeSupplierAccount/.test(lex(read(f))));
    expect(naming).toEqual([]);
  });
});

describe("every comment is internal in 3a (ADR 0048 D4)", () => {
  it("each workItemComment.create passes internal: true", () => {
    let seen = 0;
    for (const f of product) {
      const src = read(f);
      for (const m of src.matchAll(/workItemComment\.(?:create|createMany|upsert)\(/g)) {
        seen++;
        const call = src.slice(m.index!, src.indexOf("select:", m.index!) > -1 ? src.indexOf("select:", m.index!) : m.index! + 400);
        expect(call, `${f}: a comment written without internal: true`).toMatch(/\binternal: true\b/);
      }
    }
    expect(seen).toBeGreaterThanOrEqual(2); // a comment, and send back's
  });
});

describe("the acts call the rules; the edge parses by hand and restates nothing", () => {
  it("the cores call newItemFaults, fieldFaults, moveFaults and commentFaults, and refuse on them", () => {
    expect(fn(store, "createItem")).toMatch(/newItemFaults\([\s\S]*\bif \(faults\.length\) refuse\(/);
    expect(fn(store, "editField")).toMatch(/fieldFaults\([\s\S]*\bif \(faults\.length\) refuse\(/);
    expect(fn(store, "moveItem")).toMatch(/moveFaults\([\s\S]*\bif \(faults\.length\) refuse\(/);
    expect(fn(store, "comment")).toMatch(/commentFaults\(i\.body\);\s+if \(faults\.length\) refuse\(/);
  });

  it("every core asks WORK_ITEM first, and the edge's lock helper asks it under the contract's lock", () => {
    for (const name of ["createItem", "editField", "comment", "link", "unlink", "attachFiles"]) {
      const body = fn(store, name);
      expect(body.indexOf("gate(c)"), name).toBeGreaterThan(-1);
      expect(body.indexOf("gate(c)"), `${name}: gate after the lock or the write`).toBeLessThan(Math.min(...["lockedItem(", ".create(", ".updateMany("].map((s) => (body.indexOf(s) < 0 ? Infinity : body.indexOf(s)))));
    }
    // A move asks the row itself (it feeds `moveFaults`, which answers CONTRACT_READ_ONLY from it).
    expect(fn(store, "moveItem")).toContain('actStatusFault("WORK_ITEM"');
    const helper = fn(actions, "inContract");
    expect(helper.indexOf('actStatusFault("WORK_ITEM"')).toBeGreaterThan(helper.indexOf("withLockedContract("));
  });

  it("the cores lock only the WorkItem row (scoped to the contract and the organisation), and never the contract, the clock or the global client", () => {
    expect([...store.matchAll(/FROM "(\w+)" WHERE id = \$\{\w+\} AND "contractId" = \$\{c\.l\.contract\.id\} AND "organisationId" = \$\{c\.l\.org\.id\} FOR UPDATE`/g)].map((m) => m[1])).toEqual(["WorkItem"]);
    expect([...store.matchAll(/FOR UPDATE`/g)]).toHaveLength(1);
    const code = lex(store);
    expect(code).not.toMatch(/withLockedContract|withLockedAward|inHeldContract|\bdb\./);
    expect(code).not.toMatch(/new Date\(\)/);
    // Lock order inside a core: the item row before the store's documents.
    const attach = fn(store, "attachFiles");
    expect(attach.indexOf("lockedItem(")).toBeLessThan(attach.indexOf("lockDocument("));
    // A core never changes the item's identity: no update of the row writes type, contractId or number.
    const calls = [...store.matchAll(/workItem\.updateMany\(/g)].map((m) => callText(store, m.index! + m[0].length - 1));
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call.slice(call.indexOf("data:")), "an update that writes type, contractId or number").not.toMatch(/(?:type|contractId|number)/);
  });

  it("the actions read the clock once each, begin an attribution before the lock, parse the form by hand and import no rule's arithmetic", () => {
    const names = [...actions.matchAll(/^export async function (\w+)\(/gm)].map((m) => m[1]);
    expect(names.sort()).toEqual(["attachWorkFiles", "commentOnWorkItem", "createWorkItem", "editWorkField", "linkWorkItem", "moveWorkItem", "unlinkWorkItem"]);
    for (const name of names) {
      const body = fn(actions, name);
      const entry = body.indexOf("return inContract(");
      expect(entry, name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(entry);
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
      for (const m of body.matchAll(/\bbeginAct\(/g)) expect(m.index!, `${name}: beginAct after the lock`).toBeLessThan(entry);
    }
    expect((actions.match(/new Date\(\)/g) ?? []).length).toBe(names.length);
    // The edge parses with fields.ts, and restates no fault.
    expect(actions).toMatch(/parseNewItem\(/);
    expect(actions).toMatch(/parseFieldEdit\(/);
    expect(lex(actions)).not.toMatch(/moveFaults|fieldFaults|newItemFaults|commentFaults|\bFOR UPDATE\b|\$transaction|\bdb\./);
  });
});

describe("a notice's body never holds a supplier's or a contact's name (WS-9)", () => {
  it("the store hands the notice rule only the item's reference facts; no supplier record is read by the work acts", () => {
    expect(lex(store)).not.toMatch(/\bsupplier\w*\b|awardeeName|contact\b/i);
    expect(lex(read("src/lib/work/notices.ts"))).not.toMatch(/awardeeName|supplier|contractorName/i);
  });
});
