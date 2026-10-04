import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// 614-C2: the one lexer every source scan shares (6.14 lifted it unchanged from this file).
import { closing, enclosingFn, lex, rawCallText, rawCalls, spans } from "@/lib/scan/source";

/**
 * The canonical lock order for every post-award write (rulings, 6.12 conditions): Requisition →
 * SourcingExercise → (window, party, sale) → Award → Contract → Certificate → the domain row → Supplier
 * last. Source scans, so a new act cannot quietly take another order.
 */

const ROOT = path.join(__dirname, "../../..");
const read = (p: string) => readFileSync(path.join(ROOT, p), "utf8");
const ACTIONS = "src/app/projects/[id]/actions.ts";
/// 6.13 Part A: supervising the contract, its own module of acts under the same lock order.
const SUPERVISION = "src/app/projects/[id]/supervision-actions.ts";
/// 6.13 Part A step 3 (stricter: the scans extended to every new act): interim payment and the damages chain.
const PAYMENT = "src/app/projects/[id]/payment-actions.ts";
/// 6.13 Part A step 4 (stricter: the scans extended to every new act): variations and the adjustment of the contract sum.
const VARIATION = "src/app/projects/[id]/variation-actions.ts";
const CONTRACT_ACT_FILES = [ACTIONS, SUPERVISION, PAYMENT, VARIATION];

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
    for (const file of CONTRACT_ACT_FILES) {
      const src = read(file);
      const helper = src.slice(src.indexOf("async function inContract"), src.indexOf("async function audit("));
      expect(helper, file).toContain("withLockedContract(");
      const acts = actions(src);
      expect(acts.size, file).toBeGreaterThan(file === ACTIONS ? 20 : 15);
      for (const [name, body] of acts) {
        expect(body, name).toMatch(/return inContract\(/);
        expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
        expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(body.indexOf("inContract("));
        expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
      }
      // No helper of the module reads the clock again.
      expect((src.match(/new Date\(\)/g) ?? []).length, file).toBe(acts.size);
    }
  });

  it("an act locks only domain rows itself, after the contract; never a parent, and never the supplier", () => {
    const DOMAIN: Record<string, readonly string[]> = {
      [ACTIONS]: ["InsurancePolicy", "IssuedCopy", "CustodyItem"],
      [SUPERVISION]: ["SoDelegation", "WorkProgramme", "SiteDiaryEntry", "ContractParty"],
      [PAYMENT]: ["InterimValuation", "LadWarning", "NonCompletion"],
      [VARIATION]: ["Variation"],
    };
    for (const file of CONTRACT_ACT_FILES) {
      const src = read(file);
      const locked = [...src.matchAll(/FROM "(\w+)" WHERE id = \$\{\w+\} FOR UPDATE/g)].map((m) => m[1]);
      expect(locked.length, file).toBeGreaterThan(0);
      for (const t of locked) expect(DOMAIN[file], file).toContain(t);
      expect(src, file).not.toMatch(/FROM "(Requisition|SourcingExercise|Award|Contract|Certificate|Supplier)"/);
      expect(src, file).not.toMatch(/db\.\$transaction|\bdb\./);
    }
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

  // As ruled (6.12 condition, changed at 6.13 Part A step 2): the possession act now exists, so the scan names it.
  it("nothing in 6.12 writes ACTIVE: only 6.13's possession act does", () => {
    expect(read(ACTIONS)).not.toMatch(/"ACTIVE"/);
    // Review 9 (stricter): every function of every source file under src/app and src/lib, exported or not, by the
    // lexer's own attribution; a status written as ACTIVE anywhere else fails.
    const writers: string[] = [];
    for (const f of [...files("src/app"), ...files("src/lib")]) {
      const src = read(f);
      const sp = spans(lex(src));
      for (const m of src.matchAll(/\bstatus\s*:\s*["'`]ACTIVE["'`]/g)) writers.push(`${f} › ${enclosingFn(sp, m.index!)}`);
    }
    // Its write and its audit's after-value, both in recordPossession, and nowhere else.
    expect(writers).toEqual([`${P(SUPERVISION)} › recordPossession`, `${P(SUPERVISION)} › recordPossession`]);
    const body = actions(read(SUPERVISION)).get("recordPossession")!;
    expect(body).toMatch(/contractTransition\(k\.status as ContractStatus, "ACTIVE", \{ act: "POSSESSION" \}\)/);
    expect(body).toMatch(/contract\.updateMany\(\{ where: \{ id: k\.id, status: "STAMPED" \}, data: \{ status: "ACTIVE" \} \}\)/);
  });

  it("the EXECUTED baseline version is written only by the RSAJ signature", () => {
    const acts = actions(read(ACTIONS));
    const writers = [...acts].filter(([, body]) => /"EXECUTED", ""/.test(body)).map(([n]) => n);
    expect(writers).toEqual(["recordRsajSignature"]);
  });
});

// ------------------------------------------------------------------ 6.12 review R-7, re-review M-1: the write scan
//
// Every write that can reach a contract, a baseline version or its sections, in every non-test source file
// under src/app, src/lib and prisma: a Prisma write on the model however it is spaced or broken across lines,
// a nested write through another model, the status helper's extra fields, writeVersion's reason, and raw SQL.
// The source is lexed first (strings, comments, regular expressions and template text blanked), each write is
// attributed to its true enclosing named function by brace depth (declarations, object-literal methods,
// named arrows), and each must be (a) on the allow-list for that function and operation and (b) written with
// its data as an inline object literal, so nothing the scan cannot read (a variable, a spread, a computed
// key) can carry the Contract Date or an EXECUTED version past it.

interface Source {
  file: string;
  src: string;
}

/// The top-level comma-separated arguments of a call's lexed argument text "(…)", as [from, to) offsets.
function argRanges(m: string, open: number): [number, number][] {
  const close = closing(m, open);
  const out: [number, number][] = [];
  let depth = 0;
  let from = open + 1;
  for (let i = open + 1; i < close; i++) {
    if ("([{".includes(m[i])) depth++;
    else if (")]}".includes(m[i])) depth--;
    else if (m[i] === "," && depth === 0) {
      out.push([from, i]);
      from = i + 1;
    }
  }
  if (m.slice(from, close).trim()) out.push([from, close]);
  return out;
}

const W = (s: string) => s.replace(/\s+/g, "");

/// Each spread's expression in an object literal's text, to its top-level comma or closing bracket, spaces removed.
function spreadExprs(raw: string, m: string): string[] {
  const out: string[] = [];
  for (const x of m.matchAll(/\.\.\./g)) {
    let depth = 0;
    let e = x.index! + 3;
    for (; e < m.length; e++) {
      if ("([{".includes(m[e])) depth++;
      else if (")]}".includes(m[e])) {
        if (depth === 0) break;
        depth--;
      } else if (m[e] === "," && depth === 0) break;
    }
    out.push(W(raw.slice(x.index!, e)));
  }
  return out;
}

/// Whether the property `key` of the object literal spanning [from, to) is itself an inline object literal
/// with no spread or computed key; "absent" where the object has no such property.
function inlineProp(raw: string, m: string, from: number, to: number, key: string): "inline" | "not inline" | "absent" {
  let depth = 0;
  for (let i = from; i < to; i++) {
    if ("([{".includes(m[i])) depth++;
    else if (")]}".includes(m[i])) depth--;
    if (depth !== 1) continue;
    const k = new RegExp(`^["']?${key}["']?\\s*([:,}])`).exec(raw.slice(i + 1).replace(/^\s+/, ""));
    if (!/[{,]/.test(m[i]) || !k) continue;
    if (k[1] !== ":") return "not inline"; // shorthand: a variable
    const at = i + 1 + raw.slice(i + 1).search(new RegExp(`["']?${key}["']?\\s*:`)) ;
    let v = m.indexOf(":", at) + 1;
    while (/\s/.test(m[v])) v++;
    if (m[v] !== "{" && m[v] !== "[") return "not inline";
    const end = closing(m, v);
    const body = m.slice(v, end + 1);
    return /\.\.\./.test(body) || /[{,]\s*\[[^\]]*\]\s*:/.test(body) ? "not inline" : "inline";
  }
  return "absent";
}

interface Write {
  where: string;
  op: string;
  problem: string | null;
}

/// Allowed writes, by "file › function": the operations each may perform. `spread` permits the spreads that
/// helper is built on (moveTo's extra, a baseline's rowOf, a section row) and nothing else.
/// `active` permits the one ACTIVE write (the possession act's); `reason` pins a baseline version's reason literal.
type Allow = Readonly<Record<string, { ops: readonly string[]; spread?: RegExp; contractDate?: boolean; demo?: boolean; active?: boolean; reason?: string }>>;

const P = (f: string) => path.normalize(f);
const ACT = P(ACTIONS);
const SUP = P(SUPERVISION);
export const ALLOW: Allow = {
  [`${ACT} › moveTo`]: { ops: ["contract.updateMany"], spread: /^\.\.\.extra$/ },
  [`${ACT} › correctContractDate`]: { ops: ["contract.update"], contractDate: true },
  [`${ACT} › answerConsultingEngineer`]: { ops: ["contract.update"] },
  [`${ACT} › startPreparation`]: { ops: ["contractBaseline.create", "contractSection.create"], spread: /^\.\.\.(rowOf\(draft\)|s)$/ },
  [`${ACT} › saveBaselineEntry`]: { ops: ["contractBaseline.update", "contractSection.deleteMany", "contractSection.create"], spread: /^\.\.\.(rowOf\(values\)|s)$/ },
  [`${ACT} › writeVersion`]: { ops: ["contractBaseline.create", "contractSection.create"], spread: /^\.\.\.(rowOf\(derived\)|s|\(draft\?\.snapshotasobject\)|extra)$/ },
  // 6.13 Part A: possession writes its POSSESSION version (with its sections) and moves STAMPED → ACTIVE, and nothing else does.
  [`${SUP} › writePossessionVersion`]: { ops: ["contractBaseline.create", "contractSection.create"], spread: /^\.\.\.(rowOf\(v\)|s|\(draft\?\.snapshotasobject\))$/, reason: "POSSESSION" },
  [`${SUP} › recordPossession`]: { ops: ["contract.updateMany"], active: true },
  [`${P("src/app/awards/actions.ts")} › issueAward`]: { ops: ["contract.create"] },
  [`${P("src/app/awards/actions.ts")} › cancelAward`]: { ops: ["contract.update"] },
};
/// The one status move by a variable: the legal decision's statusAfter, whose returns are pinned below.
const MOVE_STATUS_FROM: Readonly<Record<string, string>> = { [`${ACT} › decideLegal`]: "to" };

export function scanWrites(files: readonly Source[], allow: Allow): Write[] {
  const writes: Write[] = [];
  for (const { file, src } of files) {
    const m = lex(src);
    const sp = spans(m);
    const fnAt = (i: number) => enclosingFn(sp, i);
    const rule = (fn: string) => allow[`${file} › ${fn}`];
    const push = (i: number, op: string, problem: string | null) => writes.push({ where: `${file} › ${fnAt(i)}`, op, problem });
    // (1) A Prisma write on the model, however spaced or broken across lines.
    for (const x of m.matchAll(/\.\s*(contract|contractBaseline|contractSection)\s*\.\s*(update|updateMany|upsert|create|createMany|createManyAndReturn|delete|deleteMany)\s*\(/g)) {
      const op = `${x[1]}.${x[2]}`;
      const fn = fnAt(x.index!);
      const r = rule(fn);
      const open = x.index! + x[0].length - 1;
      const close = closing(m, open);
      const raw = src.slice(open, close + 1);
      const lexed = m.slice(open, close + 1);
      let problem: string | null = null;
      if (!r || !r.ops.includes(op)) problem = "not on the allow-list";
      else if (!r.demo) {
        const args = argRanges(m, open);
        const first = args[0] ? m.slice(args[0][0], args[0][1]).trim() : "";
        if (args.length !== 1 || !first.startsWith("{")) problem = "arguments not an inline object";
        else {
          const [a] = args;
          const a0 = a[0] + m.slice(a[0]).search(/\{/);
          const keys = x[2] === "upsert" ? ["create", "update"] : /^(delete|deleteMany)$/.test(x[2]) ? [] : ["data"];
          for (const k of keys) {
            const s = inlineProp(src, m, a0, closing(m, a0) + 1, k);
            if (s === "absent" && k === "data") problem = "no inline data";
            if (s === "not inline") {
              // The allowed helper spreads, and only those.
              const v0 = src.indexOf(":", a0 + src.slice(a0).search(new RegExp(`["']?${k}["']?\\s*:`))) + 1;
              const body = src.slice(v0, closing(m, v0 + m.slice(v0).search(/\{/)) + 1);
              const lexedBody = lex(body);
              const spreads = spreadExprs(body, lexedBody);
              const computed = /[{,]\s*\[[^\]]*\]\s*:/.test(lexedBody);
              const shorthandVar = !/^\s*\{/.test(body);
              if (computed || shorthandVar || !r.spread || spreads.some((s2) => !r.spread!.test(s2))) problem = `${k} not an inline object literal`;
            }
          }
        }
        if (x[1] === "contract" && /\bcontractDate\b/.test(raw) && !r.contractDate) problem = "writes the Contract Date";
        if (x[1] === "contractBaseline" && /"EXECUTED"|'EXECUTED'|`EXECUTED`/.test(raw)) problem = "writes an EXECUTED version";
        if (/"ACTIVE"/.test(raw) && !r.active) problem = "writes ACTIVE";
        if (r.reason && x[1] === "contractBaseline" && !new RegExp(`reason: "${r.reason}"`).test(raw)) problem = `reason not "${r.reason}"`;
        void lexed;
      }
      push(x.index!, op, problem);
    }
    // (2) A nested write through another model's write.
    for (const x of src.matchAll(/["']?\b(contract|contracts|baselines|baseline|sections|contractBaseline)["']?\s*:\s*\{\s*["']?(create|createMany|update|updateMany|upsert|delete|deleteMany|connectOrCreate|set)["']?\s*:/g)) {
      if (m[x.index!] === " " && src[x.index!] !== " ") continue; // inside a string or comment
      push(x.index!, `nested ${x[1]}.${x[2]}`, "a nested write");
    }
    // (3) The status helper: its status a literal, its extra an inline literal; the Contract Date only from the RSAJ signature; never ACTIVE.
    for (const x of m.matchAll(/\bmoveTo\s*\(/g)) {
      if (/function\s*$/.test(m.slice(Math.max(0, x.index! - 12), x.index!))) continue;
      const open = x.index! + x[0].length - 1;
      const args = argRanges(m, open);
      const fn = fnAt(x.index!);
      const status = args[1] ? src.slice(args[1][0], args[1][1]).trim() : "";
      const extra = args[2] ? src.slice(args[2][0], args[2][1]).trim() : null;
      let problem: string | null = null;
      if (!/^"[A-Z_]+"$/.test(status) && MOVE_STATUS_FROM[`${file} › ${fn}`] !== status) problem = "status not a literal";
      else if (status === '"ACTIVE"') problem = "writes ACTIVE";
      if (extra != null && (!extra.startsWith("{") || /\.\.\./.test(lex(extra)) || /[{,]\s*\[[^\]]*\]\s*:/.test(lex(extra)))) problem = "extra not an inline object literal";
      if (extra != null && /\bcontractDate\b/.test(extra) && !(file === ACT && fn === "recordRsajSignature")) problem = "writes the Contract Date";
      writes.push({ where: `${file} › ${fn}`, op: `moveTo ${status}`, problem });
    }
    // (4) writeVersion: its reason a literal; EXECUTED only from the RSAJ signature.
    for (const x of m.matchAll(/\bwriteVersion\s*\(/g)) {
      if (/function\s*$/.test(m.slice(Math.max(0, x.index! - 12), x.index!))) continue;
      const args = argRanges(m, x.index! + x[0].length - 1);
      const fn = fnAt(x.index!);
      const reason = args[2] ? src.slice(args[2][0], args[2][1]).trim() : "";
      let problem: string | null = null;
      if (!/^"(CONFIRMED|EXECUTED|CORRECTION)"$/.test(reason)) problem = "reason not a literal";
      else if (reason === '"EXECUTED"' && !(file === ACT && fn === "recordRsajSignature")) problem = "writes an EXECUTED version";
      writes.push({ where: `${file} › ${fn}`, op: `writeVersion ${reason}`, problem });
    }
    // (5) Raw SQL naming the tables in a write. BD-613-106 (stricter, 6.13 Part B Run 0 fix round): every raw call through
    // the shared reader (rawCalls), so a type argument (`$executeRaw<number>\`…\``) no longer hides the call; a tagged
    // template read to its backtick, the "(" form to its closing parenthesis (closing, as before, via rawCallText). An
    // Unsafe call, or one the reader cannot open (no opener, an unknown suffix), cannot be read and is flagged.
    for (const c of rawCalls(m)) {
      const name = `$${c.method}${c.suffix}`;
      const sql = c.unsafe ? null : rawCallText(src, m, c);
      if (sql == null) {
        push(c.at, name, "raw SQL the scan cannot read");
        continue;
      }
      if (/\b(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+"?(Contract|ContractBaseline|ContractSection)"?(\s|\(|$)/i.test(sql)) push(c.at, "raw SQL", "raw SQL writes the table");
    }
  }
  return writes;
}

const SCANNED: Source[] = [...files("src/app"), ...files("src/lib"), ...files("prisma")].map((file) => ({ file, src: read(file) }));

/// "use server" as a module directive however it is written: either quote, after a BOM, blank lines or comments.
export function isServerModule(src: string): boolean {
  const head = src.replace(/^﻿/, "").replace(/^(?:\s+|\/\/[^\n]*\n?|\/\*[\s\S]*?\*\/)*/, "");
  return /^(["'])use server\1/.test(head);
}

describe("every write that can reach a contract, a baseline version or its sections (R-7, M-1)", () => {
  const product = SCANNED.filter((s) => !s.file.startsWith("prisma"));
  const demo = SCANNED.filter((s) => s.file.startsWith("prisma"));
  const writes = scanWrites(product, ALLOW);

  it("the scan covers every server module, the award's acts, the document store's owners, src/lib and prisma", () => {
    const names = SCANNED.map((s) => s.file);
    for (const f of ["src/app/awards/actions.ts", "src/lib/documents/owners.ts", ACTIONS, "src/lib/contract/repo.ts", "prisma/demo-contracts.ts"]) expect(names).toContain(P(f));
    expect(SCANNED.filter((s) => isServerModule(s.src)).length).toBeGreaterThan(20);
  });

  it("no product write is off the allow-list or written in a form the scan cannot read", () => {
    expect(writes.filter((w) => w.problem).map((w) => `${w.where} · ${w.op} · ${w.problem}`)).toEqual([]);
  });

  it("every allowed writer exists (the list cannot go stale)", () => {
    const found = new Set(writes.filter((w) => !w.op.startsWith("moveTo") && !w.op.startsWith("writeVersion")).map((w) => `${w.where}|${w.op}`));
    for (const [where, r] of Object.entries(ALLOW)) for (const op of r.ops) expect(found.has(`${where}|${op}`), `${where} ${op}`).toBe(true);
  });

  it("the Contract Date: only correctContractDate's update and the RSAJ signature's move", () => {
    const date = writes.filter((w) => w.op.startsWith("moveTo") && /EXECUTED/.test(w.op));
    expect(date.map((w) => w.where)).toEqual([`${ACT} › recordRsajSignature`]);
  });

  it("the legal decision's variable status is only ever a return or an endorsement", () => {
    const legal = read("src/lib/contract/legal.ts");
    const body = legal.slice(legal.indexOf("export const statusAfter"), legal.indexOf("\n", legal.indexOf("export const statusAfter") + 1) + 200);
    expect(body).toMatch(/"RETURNED_FOR_AMENDMENT"/);
    expect(body).not.toMatch(/"ACTIVE"|"EXECUTED"|"STAMPED"/);
  });

  it("EXECUTED versions: only from the RSAJ signature", () => {
    expect(writes.filter((w) => w.op === 'writeVersion "EXECUTED"').map((w) => w.where)).toEqual([`${ACT} › recordRsajSignature`]);
  });

  it("the demo (prisma/) writes contracts and baselines only in its own named loaders and wipe, listed here", () => {
    const where = [...new Set(scanWrites(demo, {}).map((w) => w.where))].sort();
    expect(where).toEqual(DEMO_WRITERS);
  });
});

/// The demo's writers, named one by one: invented data loaded and wiped, never the product's acts.
const DEMO_WRITERS: string[] = [
  "prisma/demo-award.ts › loadAwards",
  "prisma/demo-award.ts › wipeAwards",
  "prisma/demo-contracts.ts › form",
  "prisma/demo-contracts.ts › loadContractsDemo",
  "prisma/demo-contracts.ts › wipeContractFormation",
  "prisma/demo-contracts.ts › writeVersion",
  // 6.13 Part A step 5: demo_con13 numbered at its award's issue (its formation on is the product's own acts).
  "prisma/demo-lifecycle.ts › loadLifecycleAward",
  // 6.13 Part A: demo_con3's possession (its POSSESSION version and the move to active).
  "prisma/demo-supervision.ts › loadSupervisionDemo",
].map(P);

describe("the scan catches each evasion (self-tests)", () => {
  const one = (src: string, file = ACT) => scanWrites([{ file, src }], ALLOW).filter((w) => w.problem).map((w) => `${w.where.split(" › ")[1]} · ${w.op} · ${w.problem}`);
  const head = "export async function answerConsultingEngineer(c) {\n";
  it("the data in a variable", () => {
    expect(one(`${head}  const data = { contractDate: d };\n  await c.tx.contract.update({ where: { id }, data });\n}\n`)).toEqual(["answerConsultingEngineer · contract.update · data not an inline object literal"]);
    expect(one(`${head}  const data = { consultingEngineer: true };\n  await c.tx.contract.update({ where: { id }, data });\n}\n`)).toEqual(["answerConsultingEngineer · contract.update · data not an inline object literal"]);
  });
  it("a quoted key", () => {
    expect(one(`${head}  await c.tx.contract.update({ where: { id }, data: { "contractDate": d } });\n}\n`)).toEqual(["answerConsultingEngineer · contract.update · writes the Contract Date"]);
  });
  it("a nested write through another model", () => {
    expect(one("export async function cancelAward(tx) {\n  await tx.award.update({ where: { id }, data: { contract: { update: { contractDate } } } });\n}\n", P("src/app/awards/actions.ts"))).toEqual(["cancelAward · nested contract.update · a nested write"]);
  });
  it("moveTo's extra in a variable", () => {
    expect(one("export async function recordRsajSignature(c) {\n  await moveTo(c, \"EXECUTED\", extra);\n}\n")).toEqual(['recordRsajSignature · moveTo "EXECUTED" · extra not an inline object literal']);
    expect(one("export async function submitLegal(c) {\n  await moveTo(c, \"EXECUTED\", { contractDate: x });\n}\n")).toEqual(['submitLegal · moveTo "EXECUTED" · writes the Contract Date']);
  });
  it("the call broken across lines", () => {
    expect(one(`${head}  await c.tx.contract\n    .update({ where: { id }, data: { contractDate: d } });\n}\n`)).toEqual(["answerConsultingEngineer · contract.update · writes the Contract Date"]);
  });
  it("writeVersion with a reason in a variable", () => {
    expect(one("export async function correctBaseline(c) {\n  const reason = \"EXECUTED\";\n  await writeVersion(c, v, reason);\n}\n")).toEqual(["correctBaseline · writeVersion reason · reason not a literal"]);
  });
  it("a baseline deleted", () => {
    expect(one("async function writeVersion(c) {\n  await c.tx.contractBaseline.delete({ where: { id } });\n}\n")).toEqual(["writeVersion · contractBaseline.delete · not on the allow-list"]);
  });
  it("a write inside an object-literal method, or a named arrow, is its own function's, not the function above it", () => {
    const src = "export async function correctContractDate(c) {\n  await c.tx.contract.update({ where: { id }, data: { contractDate: proposed } });\n}\nconst helpers = {\n  sneaky(tx) {\n    return tx.contract.update({ where: { id }, data: { contractDate: d } });\n  },\n  quiet: async (tx) => tx.contract.update({ where: { id }, data: { contractDate: d } }),\n};\n";
    expect(one(src)).toEqual(["sneaky · contract.update · not on the allow-list", "quiet · contract.update · not on the allow-list"]);
  });
  it("an EXECUTED version, ACTIVE, raw SQL and a spread in an allowed writer", () => {
    expect(one("async function writeVersion(c) {\n  await c.tx.contractBaseline.create({ data: { reason: \"EXECUTED\" } });\n}\n")).toEqual(["writeVersion · contractBaseline.create · writes an EXECUTED version"]);
    expect(one("export async function submitLegal(c) {\n  await moveTo(c, \"ACTIVE\");\n}\n")).toEqual(['submitLegal · moveTo "ACTIVE" · writes ACTIVE']);
    expect(one("export async function sneaky(tx) {\n  await tx.$executeRaw`UPDATE \"Contract\" SET \"contractDate\" = NOW()`;\n}\n")).toEqual(["sneaky · raw SQL · raw SQL writes the table"]);
  });
  it("BD-613-106: a typed raw write naming the table is caught (the old pattern skipped it); an Unsafe or unreadable call is flagged", () => {
    const typed = "export async function sneaky(tx) {\n  await tx.$executeRaw<number>`UPDATE \"Contract\" SET \"contractDate\" = NOW()`;\n}\n";
    expect(one(typed)).toEqual(["sneaky · raw SQL · raw SQL writes the table"]);
    expect([...lex(typed).matchAll(/\$(?:executeRaw|queryRaw)(?:Unsafe)?\s*[`(]/g)]).toHaveLength(0);
    expect(one("export async function sneaky(tx) {\n  await tx.$queryRaw<Array<{ n: (number | null) }>>`DELETE FROM \"ContractSection\" WHERE 1 = 1`;\n}\n")).toEqual(["sneaky · raw SQL · raw SQL writes the table"]);
    // The "(" form is still read to its closing parenthesis.
    expect(one("export async function sneaky(tx) {\n  await tx.$executeRaw(Prisma.sql`INSERT INTO \"ContractBaseline\" (id) VALUES (1)`);\n}\n")).toEqual(["sneaky · raw SQL · raw SQL writes the table"]);
    expect(one("export async function sneaky(tx) {\n  await tx.$executeRawUnsafe(q);\n}\n")).toEqual(["sneaky · $executeRawUnsafe · raw SQL the scan cannot read"]);
    expect(one("export async function sneaky(tx) {\n  const q = tx.$executeRaw;\n  await q`UPDATE x SET y = 1`;\n}\n")).toEqual(["sneaky · $executeRaw · raw SQL the scan cannot read"]);
    expect(one("export async function sneaky(tx) {\n  await tx.$queryRawTyped(rows(id));\n}\n")).toEqual(["sneaky · $queryRawTyped · raw SQL the scan cannot read"]);
    expect(one(`${head}  await c.tx.contract.update({ where: { id }, data: { ...patch } });\n}\n`)).toEqual(["answerConsultingEngineer · contract.update · data not an inline object literal"]);
  });
  it("nothing is flagged in strings, comments or a lock's SELECT … FOR UPDATE", () => {
    expect(one(`${head}  // tx.contract.update({ data: { contractDate } })\n  const s = "tx.contract.update(";\n  await c.tx.$queryRaw\`SELECT id FROM "Contract" WHERE id = 1 FOR UPDATE\`;\n  await c.tx.contract.update({ where: { id }, data: { consultingEngineer: true } });\n}\n`)).toEqual([]);
  });
  it('"use server" is recognised however it is written', () => {
    for (const s of ['"use server";\n', "'use server'\n", "﻿\n\n// note\n/* block */\n\"use server\";\n", "/** doc */\n'use server';"]) expect(isServerModule(s), JSON.stringify(s)).toBe(true);
    for (const s of ['import x from "y";\n"use server";', '// "use server"\nexport const a = 1;']) expect(isServerModule(s), JSON.stringify(s)).toBe(false);
  });
});
