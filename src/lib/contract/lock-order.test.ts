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
