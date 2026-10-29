import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

// 614-C2: the one lexer every source scan shares (6.14 lifted it unchanged from this file).
// Residual round (S-3a): isServerModule lives with the lexer, so the act-status scan reads server modules the same way.
import { closing, enclosingFn, isServerModule, lex, rawCallText, rawCalls, spans } from "@/lib/scan/source";
import { toPosix } from "@/lib/scan/files";

/**
 * The canonical lock order for every post-award write (rulings, 6.12 conditions): Requisition →
 * SourcingExercise → (window, party, sale) → Award → Contract → Certificate → the domain row → Supplier
 * last. Source scans, so a new act cannot quietly take another order.
 */

/// A test helper, not product code: it writes the closing, a supplier and the exercise through raw SQL to stand a scenario up, and only the database tests import it (wave 3c step 4).
/// Phase 2 close-out: `contract.fixture.ts` stands up an organisation, an active contract and its baseline for the post-award acts' database tests; only `*.db.test.ts` files import it (lock-order.test.ts holds that).
const TEST_ONLY_FIXTURES = ["online-opening.fixture.ts", "contract.fixture.ts"];
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
    return statSync(path.join(ROOT, rel)).isDirectory() ? files(rel) : /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f) && !TEST_ONLY_FIXTURES.includes(f) ? [toPosix(rel)] : [];
  });
}

describe("the test-only fixtures the scans leave out", () => {
  it("are imported only by database tests, so no product code writes through them", () => {
    const all = (dir: string): string[] => readdirSync(path.join(ROOT, dir)).flatMap((f) => (statSync(path.join(ROOT, dir, f)).isDirectory() ? all(path.join(dir, f)) : /\.tsx?$/.test(f) ? [toPosix(path.join(dir, f))] : []));
    const importers = [...all("src"), ...all("prisma"), ...all("scripts")].filter((f) => TEST_ONLY_FIXTURES.some((x) => read(f).includes(`/${x.replace(/\.ts$/, "")}"`)));
    expect(importers.length).toBeGreaterThan(0);
    expect(importers.filter((f) => !f.endsWith(".db.test.ts"))).toEqual([]);
  });
});

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

  // Phase 2b (decisions log, 2026-10-07): the attribution of an act is begun before the lock (it may ask for the password, whose hash is slow, and reads the
  // organisation's switch) and written inside the locked transaction, with the act and its audit row. A write on any other client would be outside the lock.
  it("an act's attribution is begun before the contract is locked and written inside the lock, on the act's own transaction", () => {
    let begun = 0;
    let written = 0;
    for (const file of [...CONTRACT_ACT_FILES, ...RUN_1B_ACT_FILES]) {
      const src = read(file);
      for (const [name, body] of actions(src)) {
        const entry = body.indexOf(file === MATTER ? "return run(" : "return inContract(");
        expect(entry, `${file}#${name}`).toBeGreaterThan(-1);
        for (const m of body.matchAll(/\bbeginAct(?:From)?\(/g)) {
          begun++;
          expect(m.index!, `${file}#${name}: beginAct after the lock was taken`).toBeLessThan(entry);
        }
        for (const m of body.matchAll(/\b(?:act0?|input\.act|i\.act|o\.act)\.(?:write|writeAlso)\(\s*([^,)]+)/g)) {
          written++;
          expect(m.index!, `${file}#${name}: an attribution written outside the lock`).toBeGreaterThan(entry);
          expect(m[1].trim(), `${file}#${name}: an attribution written on another client`).toMatch(/^(?:c\.)?tx$/);
        }
      }
    }
    expect(begun).toBeGreaterThan(30);
    expect(written).toBeGreaterThan(30);
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

/// 6.13 Part B run 1b (stricter: the scans extended to every new act): time and the contract matters' routes.
const TIME = "src/app/projects/[id]/time-actions.ts";
const MATTER = "src/app/projects/[id]/matter-actions.ts";
const RUN_1B_ACT_FILES = [TIME, MATTER];

describe("one lock order, run 1b's acts (ContractMatter the first domain row, then its record, then a sitting)", () => {
  it("each file asks the table in its own inContract, under withLockedContract; every act reads the clock once, before it", () => {
    for (const file of RUN_1B_ACT_FILES) {
      const src = read(file);
      const at = src.indexOf("async function inContract(");
      const helper = src.slice(at, src.indexOf("\n}\n", at));
      expect(helper, file).toContain("withLockedContract(");
      expect(helper.indexOf("actStatusFault(family, l.contract.status as ContractStatus)"), file).toBeGreaterThan(helper.indexOf("withLockedContract("));
      const acts = actions(src);
      expect(acts.size, file).toBeGreaterThanOrEqual(file === TIME ? 7 : 4);
      for (const [name, body] of acts) {
        const entry = file === MATTER ? "return run(" : "return inContract(";
        expect(body, name).toContain(entry);
        expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
        expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(body.indexOf(entry));
        expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
      }
      expect((src.match(/new Date\(\)/g) ?? []).length, file).toBe(acts.size);
    }
  });

  it("no act file locks a row itself; lockMatter takes the matter, then its record, and the tabling act the sitting after", () => {
    for (const file of RUN_1B_ACT_FILES) {
      const src = read(file);
      expect(src, file).not.toMatch(/FOR UPDATE|FOR SHARE|db\.\$transaction/);
      // The one read before the lock: the matter's kind, to choose the row of the table (read again under the lock).
      const dbUses = [...lex(src).matchAll(/\bdb\./g)].map((m) => enclosingFn(spans(lex(src)), m.index!));
      expect(dbUses, file).toEqual(file === MATTER ? ["familyOf"] : []);
    }
    const act = read("src/lib/matter/act.ts");
    const lock = act.slice(act.indexOf("export async function lockMatter("));
    const matterAt = lock.indexOf(`FROM "ContractMatter" WHERE id = \${pre.id} FOR UPDATE`);
    expect(matterAt).toBeGreaterThan(-1);
    for (const t of ["EotClaim", "PeriodExtension", "LossExpenseClaim", "LadWaiver"]) {
      const recordAt = lock.indexOf(`FROM "${t}" WHERE "matterId" = \${pre.id} FOR UPDATE`);
      expect(recordAt, t).toBeGreaterThan(matterAt);
    }
    expect(lock.indexOf("loadMatters(")).toBeGreaterThan(lock.lastIndexOf("FOR UPDATE"));
    const table = actions(read(MATTER)).get("tableContractMatter")!;
    expect(table.indexOf("lockMatter(c, matterId)")).toBeGreaterThan(-1);
    expect(table.indexOf("lockMatter(c, matterId)")).toBeLessThan(table.indexOf("lockSittingIn("));
  });
});

/// 6.13 Part B run 1b C8b (BD-613-117, trace T9, T10): ContractMatter's place where a contract matter is reached from
/// outside the contract's pages: /approvals' escalation (Requisition → Exercise → Award → Contract → ContractMatter, then
/// the matter's family row of ACT_STATUS, restating no state list) and a sitting's outcome on a CONTRACT matter
/// (Contract → ContractMatter → the sitting, the order tabling takes). Blind spots (declared): these read the source's
/// text in order; a lock taken in a helper these files call is not followed (none is), and the family is read from
/// MATTER_FAMILY by name (matter-family's own test pins that map).
/// Phase 2 close-out stage B (stricter: the scans extended to every new act): completion, defects, making good and the return of securities.
const CLOSEOUT = "src/app/projects/[id]/closeout-actions.ts";

describe("one lock order, close-out's acts (stage B: the contract, then the domain row, then the defect lines by id, then the security)", () => {
  it("the file asks the table in its own inContract, under withLockedContract; every act reads the clock once, before it", () => {
    const src = read(CLOSEOUT);
    const at = src.indexOf("async function inContract(");
    const helper = src.slice(at, src.indexOf("\n}\n", at));
    expect(helper).toContain("withLockedContract(");
    expect(helper.indexOf("actStatusFault(family, l.contract.status as ContractStatus)")).toBeGreaterThan(helper.indexOf("withLockedContract("));
    const acts = actions(src);
    expect(acts.size).toBeGreaterThanOrEqual(11);
    const onDefect = src.slice(src.indexOf("async function onDefect("), src.indexOf("\n}\n", src.indexOf("async function onDefect(")));
    for (const [name, body] of acts) {
      if (body.includes("return onDefect(")) continue;
      expect(body, name).toContain("return inContract(");
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(body.indexOf("return inContract("));
    }
    expect(onDefect.indexOf("const now = toSecond(new Date());")).toBeLessThan(onDefect.indexOf("return inContract("));
  });

  it("locks the domain row before the lines, the lines by ascending id, and never the certificate or a transaction of its own", () => {
    const src = read(CLOSEOUT);
    expect(src).not.toMatch(/FROM "Certificate"|db\.\$transaction/);
    for (const m of src.matchAll(/FROM "DefectItem" WHERE "contractId" = \$\{[^}]+\} (ORDER BY id )?FOR UPDATE/g)) expect(m[1], "the lines by ascending id").toBe("ORDER BY id ");
    const hook = read("src/lib/closeout/at-issue.ts");
    expect(hook.indexOf("async function lockLines(")).toBeGreaterThan(-1);
    expect(hook).toMatch(/FROM "DefectItem" WHERE "contractId" = \$\{contractId\} ORDER BY id FOR UPDATE/);
    // Each hook's after-issue writes lock the domain row, then the lines.
    for (const fn of ["cpcAtIssue", "scheduleAtIssue", "cmgdAtIssue"]) {
      const body = hook.slice(hook.indexOf(`export async function ${fn}(`));
      expect(body.indexOf("await lockRow("), fn).toBeLessThan(body.indexOf("await lockLines("));
    }
  });
});

/// Close-out stage C review, S5 (stricter: the scans extended to the final account's acts and hooks). The order, documented:
///   the final account's acts (final-actions.ts): Contract (withLockedContract) → [the raise: each unapplied waiver's ContractMatter, then the
///   LadWaiver, by ascending matter id] → the FinalAccount row (lockDraftFinal) → its lines, party lines and pack entries (written under it,
///   never locked); the draft certificate is refigured through the core's refigureDraft, which takes no lock of its own;
///   the FINAL's send and issue (the certificate's own acts): Contract → Certificate (withLockedCertificate) → the FinalAccount row, by its
///   certificate (finalSendFaults, finalIssueRefusal).
/// Both paths take the Contract first, so they serialise there and never cross.
const FINAL = "src/app/projects/[id]/final-actions.ts";

describe("one lock order, the final account's acts and hooks (stage C)", () => {
  const src = read(FINAL);
  const body = (fn: string) => {
    const at = src.indexOf(fn);
    return src.slice(at, src.indexOf("\n}\n", at));
  };

  it("the file asks the table in its own inContract, under withLockedContract; every act reads the clock once, before it", () => {
    const helper = body("async function inContract(");
    expect(helper).toContain("withLockedContract(");
    expect(helper.indexOf("actStatusFault(family, l.contract.status as ContractStatus)")).toBeGreaterThan(helper.indexOf("withLockedContract("));
    const acts = actions(src);
    expect(acts.size).toBeGreaterThanOrEqual(8);
    for (const [name, b] of acts) {
      expect(b, name).toContain("return inContract(");
      expect(b.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(b.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(b.indexOf("return inContract("));
      expect((b.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
    }
    expect((src.match(/new Date\(\)/g) ?? []).length).toBe(acts.size);
  });

  it("locks only the FinalAccount row itself, in a stable order, never the certificate, a parent or a transaction of its own", () => {
    expect(src).not.toMatch(/FROM "Certificate"|FROM "Contract"|FROM "Supplier"|db\.\$transaction/);
    const locks = [...src.matchAll(/FROM "(\w+)" WHERE [^`]* FOR UPDATE/g)].map((m) => m[1]);
    expect(locks).toEqual(["FinalAccount"]);
    const lock = body("async function lockDraftFinal(");
    expect(lock).toMatch(/orderBy: \[\{ recordedAt: "asc" \}, \{ id: "asc" \}\]/);
    expect(lock.indexOf("FOR UPDATE")).toBeLessThan(lock.indexOf("loadFinal("));
  });

  it("every act that writes the account's lines, party lines or pack locks the draft account first; the raise locks the waivers before it reads", () => {
    const acts = actions(src);
    for (const name of ["addFinalDeduction", "removeFinalDeduction", "recordFinalPartyDue", "recordPackEntry", "linkDeclaration", "confirmFinalPayments"]) {
      const b = acts.get(name)!;
      const lock = b.indexOf("lockDraftFinal(c)");
      expect(lock, name).toBeGreaterThan(-1);
      for (const w of b.matchAll(/c\.tx\.(finalAccountLine|finalPartyLine|finalPackEntry|finalAccount)\.(create|update|upsert|delete|deleteMany)/g)) expect(w.index!, `${name}: ${w[0]}`).toBeGreaterThan(lock);
      // A recompute (which refigures the certificate) comes after the lock as well.
      if (b.includes("recompute(")) expect(b.indexOf("recompute("), name).toBeGreaterThan(lock);
    }
    const raise = acts.get("raiseFinalAccount")!;
    expect(raise.indexOf("lockUnappliedWaivers(")).toBeGreaterThan(-1);
    expect(raise.indexOf("lockUnappliedWaivers(")).toBeLessThan(raise.indexOf("finalRaiseCheckOf("));
  });

  it("the send and the issue lock the FinalAccount by its certificate before they read it, inside the certificate's lock", () => {
    const hook = read("src/lib/closeout/at-issue.ts");
    const issue = hook.slice(hook.indexOf("export async function finalIssueRefusal("), hook.indexOf("export async function finalAtIssue("));
    const at = issue.indexOf(`FROM "FinalAccount" WHERE "certificateId" = \${cert.id} FOR UPDATE`);
    expect(at).toBeGreaterThan(-1);
    for (const r of ["certificateSignature.findMany(", "loadFinal(", "variationsOpenNow(", "finalMovedFaults("]) expect(issue.indexOf(r), r).toBeGreaterThan(at);
    const write = read("src/lib/closeout/final-write.ts");
    const send = write.slice(write.indexOf("export async function finalSendFaults("));
    expect(send.indexOf(`FROM "FinalAccount" WHERE "certificateId" = \${certificateId} FOR UPDATE`)).toBeGreaterThan(-1);
    expect(send.indexOf("FOR UPDATE")).toBeLessThan(send.indexOf("loadFinal("));
    // Both run on the certificate's own transaction, under withLockedCertificate (Contract, then Certificate).
    const certActs = read("src/app/projects/[id]/certificates/[certId]/actions.ts");
    expect(certActs).toContain("withLockedCertificate(");
  });
});

describe("ContractMatter's place (BD-613-117): /approvals' escalation and a sitting's outcome", () => {
  const escalate = (() => {
    const src = read("src/app/approvals/actions.ts");
    return src.slice(src.indexOf("export async function escalateStep"));
  })();
  const at = (s: string, t: string) => s.indexOf(`FROM "${t}" WHERE id`);

  it("escalation locks the requisition, the exercise, the award, the contract, then the matter, before it reads the route", () => {
    const matter = at(escalate, "ContractMatter");
    expect(matter).toBeGreaterThan(-1);
    const contract = escalate.lastIndexOf('FROM "Contract" WHERE id', matter);
    expect(contract).toBeGreaterThan(at(escalate, "Award"));
    expect(at(escalate, "Award")).toBeGreaterThan(at(escalate, "SourcingExercise"));
    expect(at(escalate, "SourcingExercise")).toBeGreaterThan(at(escalate, "Requisition"));
    expect(escalate.indexOf("tx.approvalInstance.findUnique")).toBeGreaterThan(matter);
    // The requisition behind the matter's contract is the chain's first lock.
    expect(escalate).toMatch(/route\.contractMatter\?\.contract\.award\.exercise\.requisitionId/);
  });

  it("escalation asks the matter's family row of the one table, and refuses a closed matter, before the step moves", () => {
    const gate = escalate.indexOf("actStatusFault(MATTER_FAMILY[inst.contractMatter.kind as ContractMatterKind], inst.contractMatter.contract.status as ContractStatus)");
    const closed = escalate.indexOf("inst.contractMatter?.closedAt");
    const write = escalate.indexOf("tx.approvalStep.updateMany");
    for (const x of [gate, closed]) {
      expect(x).toBeGreaterThan(at(escalate, "ContractMatter"));
      expect(x).toBeLessThan(write);
    }
    expect(escalate).toContain('matterRefused.code === "CONTRACT_CANCELLED" ? "The contract is cancelled: its matters are kept as they were, and their routes are not escalated." : actStatusText(matterRefused)');
  });

  it("a sitting's outcome on a CONTRACT matter: the contract's chain, its family row, the matter, then the sitting", () => {
    // Reconciled 2026-10-06 (Phase 0 of the sign-in programme): this test was written before the outcome path existed, naming
    // helpers (contractMatterOf, inSittingAfterContractMatter) that the code never had. The path that landed is
    // outcomeRecordOf -> inSittingAfterRecord -> inContractMatterForOutcome (founder, 2026-10-05); the same four properties
    // are asserted against it, none dropped.
    const committee = read("src/app/committees/actions.ts");
    const rec = committee.slice(committee.indexOf("export async function recordOutcome("), committee.indexOf("\n}\n", committee.indexOf("export async function recordOutcome(")));
    // Phase 1c (ADR 0034 D10): the record is found for the signed-in person's organisation (`outcomeRecordOf(actor, …)`); otherwise as pinned.
    expect(rec).toMatch(/const record = exerciseId \|\| variation \? null : await outcomeRecordOf\(actor, decisionId\);/);
    // Phase 1c (ADR 0034 D10): the path is now asked for the signed-in person's organisation first (`actor`); otherwise as pinned.
    expect(rec).toMatch(/: record\s+\? inSittingAfterRecord\(actor, toAuditActor\(actor\), meetingId, record, decisionId, now, run\)/);
    // The matter locked before the sitting is still the decision's, checked before any write.
    const key = rec.indexOf("matterKey(decision) !== outcomeRecordKey(record)");
    expect(key).toBeGreaterThan(-1);
    expect(key).toBeLessThan(rec.indexOf("tx.committeeDecision.updateMany("));
    // The contract matter's record is dispatched to its own function, which takes the locks in order.
    // Phase 1c (ADR 0034 D10): the scope (the signed-in person's organisation) is passed first, and the locks below name it; the order is as pinned.
    expect(committee).toMatch(/if \(record\.kind === "CONTRACT"\) \{\s+result = await inContractMatterForOutcome\(scope, actor, record, now, meetingId, roster, decisionId, fn\);/);
    const w0 = committee.indexOf("async function inContractMatterForOutcome(");
    expect(w0).toBeGreaterThan(-1);
    const wrap = committee.slice(w0, committee.indexOf("\n}\n", w0));
    const order = ["withLockedContract(scope.organisationId, record.contractId", "actStatusFault(family, l.contract.status as ContractStatus)", "lockMatter(c, record.id)", "lockSittingIn(tx, scope, meetingId, roster)", "fn(tx, s)"].map((x) => wrap.indexOf(x));
    expect(order.every((x) => x > -1), String(order)).toBe(true);
    expect([...order].sort((x, y) => x - y)).toEqual(order);
    expect(wrap).toContain("MATTER_FAMILY[record.matterKind as ContractMatterKind]");
  });
});

describe("single writers", () => {
  it("only the RSAJ signature and its audited correction write the Contract Date", () => {
    const acts = actions(read(ACTIONS));
    const writers = [...acts].filter(([, body]) => /contractDate: (dayToDate\(contractDate\)|proposed)/.test(body)).map(([n]) => n);
    expect(writers.sort()).toEqual(["correctContractDate", "recordRsajSignature"]);
    // No other server action in the app writes it.
    for (const f of files("src/app")) {
      if (f === toPosix(path.normalize(ACTIONS))) continue;
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

const P = (f: string) => toPosix(path.normalize(f));
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
  // 6.13 Part B run 1b (ADR 0030, ADR 0021 Amendment 2; flagged against 6.12): the extension's version writer, the one
  // writer of EXTENSION_OF_TIME and PERIOD_EXTENSION, called only by the two certificates' issue hooks.
  [`${P("src/lib/contract/version-write.ts")} › writeExtensionVersion`]: { ops: ["contractBaseline.create", "contractSection.create"], spread: /^\.\.\.(rowOf\(after\)|s|\(draft\?\.snapshotasobject\))$/ },
  // Phase 2 close-out stage B (ADR 0047 D2; flagged, a writer added): the CPC's and the CMGD's issue hooks write PRACTICALLY_COMPLETE and
  // MAKING_GOOD_COMPLETE through this one helper, by contractTransition with the writer STATUS_WRITTEN_BY names (the status is a variable).
  [`${P("src/lib/closeout/at-issue.ts")} › writeStatus`]: { ops: ["contract.updateMany"] },
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
  // Phase 1d (ADR 0034 D11): wipeAwards and wipeContractFormation are gone with the retired demo wipe. Tightened, not weakened.
  "prisma/demo-award.ts › loadAwards",
  "prisma/demo-contracts.ts › form",
  "prisma/demo-contracts.ts › loadContractsDemo",
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

/// Sign-in programme Phase 0 (group E, 2026-10-06): the three configuration saves that checked on a stale read, and the
/// numbering floor. Each now reads what it decides on under a lock, in the transaction that writes. The order the matrix
/// editor takes is the organisation, then an issue, then the funding route (share-locked); a series row on its own. None of
/// these takes a lock from the post-award chain above, and no post-award act takes one of these.
/// Source scans, as above. Blind spots (declared): they read the text of each function in order; a helper the function calls
/// is read only where it is named (fundingRouteFault, lockOrganisation, lockIssue). They CANNOT see the locks a foreign key
/// takes: inserting an AuditEntry, an AuthorityMatrix or a FundingRoute takes FOR KEY SHARE on its Organisation row, which
/// FOR UPDATE conflicts with and FOR NO KEY UPDATE does not. A writer that holds an issue and then audits therefore asks for
/// the organisation while holding the issue, and an organisation lock taken FOR UPDATE ahead of it is a deadlock (the first
/// Phase 0 version of this order was one, found in review). So the assertions below pin the lock MODE, and the cycles
/// themselves are run against a database by scripts/check-config-lock-order.ts, with a control that must deadlock.
describe("configuration saves read under their lock (Phase 0, group E)", () => {
  const MATRIX = "src/app/configuration/approval-matrix/actions.ts";
  const LOCKS = "src/lib/authority/locks.ts";
  const ORG = "src/app/configuration/organisation/core.ts";
  // Phase 5b: the numbering editor now lives in core.ts (actions.ts only proposes it); the order the test pins is unchanged.
  const NUMBERING = "src/app/configuration/numbering/core.ts";
  const body = (file: string, name: string) => lex(actions(read(file)).get(name)!, { only: "comments" });
  const order = (src: string, marks: string[]) => marks.map((m) => src.indexOf(m));
  const inOrder = (src: string, marks: string[]) => {
    const at = order(src, marks);
    expect(at.every((x) => x > -1), `${marks.join(" | ")} -> ${at}`).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
  };

  it("saveTimeZone: the zone the trail records as 'before' is the row as locked, not the one read for the form", () => {
    const b = body(ORG, "saveTimeZone");
    inOrder(b, ["db.$transaction(", "lockOrganisation(tx, org.id)", "tx.organisation.findUniqueOrThrow(", "tx.organisation.update("]);
    expect(b).toContain("{ timeZone: locked.timeZone }");
    expect(b).not.toContain("org.timeZone");
    expect(b).not.toContain("auditedUpdate");
  });

  it("saveMatrix: the stored issues, the label, the funding route and the boundary are read inside the transaction, after the locks", () => {
    const b = body(MATRIX, "saveMatrix");
    inOrder(b, ["db.$transaction(", "lockOrganisation(tx, orgId)", "lockIssue(tx, id)", "tx.authorityMatrix.findMany(", "fundingRouteFault(tx, orgId, fundingRouteCode)", "boundaryMove(locked, tx)", "r.finish(v)", "tx.authorityMatrix.create(", "tx.authorityMatrix.update("]);
    // Nothing about a stored issue or a funding route is read on the pool; the only `db.` is the transaction itself.
    expect([...b.matchAll(/\bdb\./g)].length).toBe(1);
    expect(b).not.toMatch(/auditedCreate|auditedUpdate/);
    // The fault helper share-locks the route before it reads it, on the transaction, through the one lock module.
    const src = read(MATRIX);
    const helper = src.slice(src.indexOf("async function fundingRouteFault("));
    inOrder(helper.slice(0, helper.indexOf("\n}\n")), ["shareLockFundingRoute(tx, orgId, code)", "tx.fundingRoute.findFirst("]);
    expect(lex(read(LOCKS), { only: "comments" })).toMatch(/FROM "FundingRoute" WHERE "organisationId" = \$\{organisationId\} AND code = \$\{code\} FOR SHARE/);
  });

  it("saveRule: the issue is locked first, then the rule, the key clash, the siblings and the offices are read under it", () => {
    const b = body(MATRIX, "saveRule");
    // Phase 1c (ADR 0034 D10): the rule is found within the signed-in person's organisation's issue, and the issue read for it (`issueIn(actor, tx, …)`); the order is as pinned.
    inOrder(b, ["db.$transaction(", "lockIssue(tx, authorityMatrixId)", "tx.authorityMatrix.findFirst(", "tx.authorityRule.findFirst({ where: { id, authorityMatrixId, authorityMatrix: { organisationId: actor.organisationId } } })", "tx.authorityRule.findFirst({\n      where: { authorityMatrixId, ruleKey", "tx.authorityRole.findMany(", "tx.authorityRule.findMany(", "issueIn(actor, tx, authorityMatrixId)", "tx.authorityRule.create(", "tx.authorityRule.update("]);
    expect([...b.matchAll(/\bdb\./g)].length).toBe(1);
    expect(b).not.toMatch(/auditedCreate|auditedUpdate/);
    // A rule is found within the issue that was locked, so another issue's rule is never edited through this one.
    expect(b).not.toContain("authorityRule.findUnique");
  });

  it("every function that takes both the organisation's lock and an issue's takes the organisation's first", () => {
    const src = read(MATRIX);
    const both: string[] = [];
    for (const [name, fn] of actions(src)) {
      const text = lex(fn, { only: "comments" });
      const org = text.indexOf("lockOrganisation(tx");
      const issue = text.indexOf("lockIssue(tx");
      if (org > -1 && issue > -1) {
        both.push(name);
        expect(org, name).toBeLessThan(issue);
      }
    }
    expect(both.sort()).toEqual(["saveMatrix", "startRevision"]);
  });

  it("the organisation's row is locked FOR NO KEY UPDATE, never FOR UPDATE: a foreign-key insert's KEY SHARE must not wait on it", () => {
    const locks = lex(read(LOCKS), { only: "comments" });
    // The one organisation lock of the matrix editor, and its mode.
    expect(locks).toMatch(/SELECT id FROM "Organisation" WHERE id = \$\{id\} FOR NO KEY UPDATE/);
    expect(locks).not.toMatch(/"Organisation"[^`]*FOR UPDATE/);
    // The editor takes the organisation only through that helper: no statement of its own, in any mode.
    const src = lex(read(MATRIX), { only: "comments" });
    expect(src).not.toContain('"Organisation"');
    expect(src).toContain('import { lockIssue, lockOrganisation, shareLockFundingRoute } from "@/lib/authority/locks"');
    expect(src).not.toMatch(/async function lock(?:Organisation|Issue)\(/);
  });

  it("saveSeries (the numbering floor): the series row is locked before the stored serial is read, and the floor is checked against it", () => {
    const b = body(NUMBERING, "saveSeries");
    inOrder(b, ["db.$transaction(", `FROM "NumberingSeries" WHERE id = \${current.id} FOR UPDATE`, "stored = await tx.numberingSeries.findFirst(", "serialFor(storedSeries, now)", "r.finish(v)", "afterConfiguring(", "tx.numberingSeries.update("]);
    // The pre-lock read is the list of keys alone (a new series' key is checked for being taken); the row is read on tx.
    expect(b).not.toMatch(/db\.numberingSeries\.find(?:Unique|First)/);
  });

  it("the sitting's reference is issued under the series lock: scheduleSitting numbers through issueReference, never a read of the series", () => {
    const b = body("src/app/committees/actions.ts", "scheduleSitting");
    // Phase 1c (ADR 0034 D10): the waiting items are tabled for the signed-in person's organisation (`tableWaiting(actor, tx, …)`); the order is as pinned.
    inOrder(b, ["db.$transaction(", "createNumberedSitting(tx,", "writeAudit(tx,", "tableWaiting(actor, tx,"]);
    expect(b).not.toMatch(/numberingSeries\.update|nextSerial|formatReference/);
  });
});

// ------------------------------------------------------------------ ADR 0042, plan step 4: the Project workspace's acts
//
// Not in CONTRACT_ACT_FILES above, on purpose: those scans read a file that itself calls `inContract` in every exported function and takes its own domain lock, and has
// fifteen acts or more. The workspace splits the same work in two: the staff server actions own the edge and the contract's lock (`document-actions.ts`), and the cores
// in `project-docs/store.ts` (also called by step 5's portal routes, inside `inHeldContract`) take the one row lock of the workspace after it. So the same properties are
// held here, file by file, for the two files, and none of the scans above is loosened.

const WORKSPACE_ACTIONS = "src/app/projects/[id]/document-actions.ts";
const WORKSPACE_STORE = "src/lib/project-docs/store.ts";
// Plan step 6 added the seventh, `markVersion` (Taken up or Returned on a version of one of the six kinds), held to the same properties.
const WORKSPACE_CORES = ["createDocument", "addVersion", "requestDocument", "addApprover", "removeApprover", "decideVersion", "markVersion"];

describe("the Project workspace: staff actions lock the contract, the store locks the document", () => {
  const actionsSrc = read(WORKSPACE_ACTIONS);
  const storeSrc = read(WORKSPACE_STORE);
  const acts = actions(actionsSrc);
  const cores = actions(storeSrc);

  it("seven actions (plan step 6 added markProjectVersion), each reading the clock once before it enters the lock, and begun (the attribution) before it", () => {
    expect([...acts.keys()].sort()).toEqual(["addProjectApprover", "createProjectDocument", "decideProjectVersion", "markProjectVersion", "removeProjectApprover", "requestProjectDocument", "uploadProjectVersion"]);
    for (const [name, body] of acts) {
      const entry = body.indexOf("return inContract(");
      expect(entry, name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(entry);
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
      const begun = [...body.matchAll(/\bbeginAct\(/g)].map((m) => m.index!);
      expect(begun.length, name).toBe(1);
      expect(begun[0], `${name}: beginAct after the lock was taken`).toBeLessThan(entry);
    }
    expect((actionsSrc.match(/new Date\(\)/g) ?? []).length).toBe(acts.size);
  });

  it("the actions' own helper locks the contract (withLockedContract) and asks the PROJECT_WORKSPACE row, then the day, inside it; the file locks no row and never uses the global client", () => {
    const at = actionsSrc.indexOf("async function inContract(");
    const helper = actionsSrc.slice(at, actionsSrc.indexOf("\n}\n", at));
    expect(helper).toContain("withLockedContract(");
    expect(helper.indexOf('actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus)')).toBeGreaterThan(helper.indexOf("withLockedContract("));
    expect(helper.indexOf("dayOf(now, l.org.timeZone)")).toBeGreaterThan(helper.indexOf("actStatusFault("));
    expect(helper.indexOf("fn({ tx, l, now, today })")).toBeGreaterThan(helper.indexOf("dayOf("));
    expect(lex(actionsSrc)).not.toMatch(/FOR UPDATE|FOR SHARE|\$transaction|\bdb\./);
  });

  it("the store has the seven cores, never locks the contract or uses the global client, and reads the clock never (it is handed in)", () => {
    expect([...cores.keys()].sort()).toEqual([...WORKSPACE_CORES].sort());
    const code = lex(storeSrc);
    expect(code).not.toMatch(/withLockedContract|withLockedAward|inHeldContract|\bdb\./);
    expect(code).not.toMatch(/new Date\(\)/);
  });

  // PW-50 (code review CONSIDER 1): the lock names the contract and the organisation in its own WHERE, so a crafted id locks no other contract's or organisation's row. The
  // patterns below were tightened in step with it, never loosened: the only raw row lock in the file is that one, whole.
  it("every core on an existing document takes the ProjectDocument lock, scoped to the contract and the organisation, before it reads the document's facts, and it is the only raw row lock in the file", () => {
    expect([...storeSrc.matchAll(/FROM "(\w+)" WHERE id = \$\{\w+\} AND "contractId" = \$\{c\.l\.contract\.id\} AND "organisationId" = \$\{c\.l\.org\.id\} FOR UPDATE`/g)].map((m) => m[1])).toEqual(["ProjectDocument"]);
    expect([...storeSrc.matchAll(/FOR UPDATE`/g)]).toHaveLength(1);
    const at = storeSrc.indexOf("async function lockedDocument(");
    const locker = storeSrc.slice(at, storeSrc.indexOf("\n}\n", at));
    expect(locker).toMatch(/SELECT id FROM "ProjectDocument" WHERE id = \$\{documentId\} AND "contractId" = \$\{c\.l\.contract\.id\} AND "organisationId" = \$\{c\.l\.org\.id\} FOR UPDATE`/);
    expect(locker.indexOf("FOR UPDATE")).toBeLessThan(locker.indexOf("loadDocumentFacts("));
    for (const name of WORKSPACE_CORES.filter((n) => n !== "createDocument")) {
      const body = cores.get(name)!;
      expect(body, name).toContain("lockedDocument(c, i.documentId)");
      expect(body.indexOf("lockedDocument("), name).toBeLessThan(body.indexOf("stagedFiles(") === -1 ? Infinity : body.indexOf("stagedFiles("));
      expect(body, name).not.toContain("loadDocumentFacts(");
    }
    // A new document is not locked: no other act can see it before this transaction commits.
    expect(cores.get("createDocument")).not.toContain("lockedDocument(");
  });

  it("the staged files are locked after the ProjectDocument, in id order, and judged on the rows read after their lock", () => {
    const at = storeSrc.indexOf("async function stagedFiles(");
    const body = storeSrc.slice(at, storeSrc.indexOf("\n}\n", at));
    expect(body.indexOf(".sort()")).toBeGreaterThan(-1);
    expect(body.indexOf("lockDocument(c.tx, documentId)")).toBeGreaterThan(body.indexOf(".sort()"));
    // The judging read is after the lock.
    expect(body.lastIndexOf("documentVersion.findMany(")).toBeGreaterThan(body.indexOf("lockDocument("));
  });

  it("an attribution is written only inside the transaction, on the act's own tx, and only for a staff act", () => {
    let written = 0;
    for (const [name, body] of cores) {
      for (const m of body.matchAll(/\bact\.(?:write|writeAlso)\(\s*([^,)]+)/g)) {
        written++;
        expect(m[1].trim(), `${name}: an attribution written on another client`).toMatch(/^(?:c\.)?tx$/);
        expect(body.slice(Math.max(0, m.index! - 20), m.index!), `${name}: written for a portal act too`).toMatch(/if \(act\) await\s*$/);
      }
    }
    // Nine in step 4; markVersion's is the tenth (plan step 6).
    expect(written).toBeGreaterThanOrEqual(10);
  });
});

// ------------------------------------------------------------------ ADR 0042 D10, plan step 7: the kick-off meeting's acts
//
// The plan names CONTRACT_ACT_FILES; its scans read a file of fifteen acts or more with its own domain lock, so the kick-off meeting is held here instead, in the same split as
// the workspace's: the staff server actions own the edge and the contract's lock (`kick-off-actions.ts`), and the cores (`project-docs/kick-off-store.ts`) take the one row
// lock of these acts, the meeting's, after it. None of the scans above is loosened. Recording it held is one act at the transaction's top level (the meeting's trigger reads
// `xmin`), so the store opens no transaction and no savepoint.

const KICK_OFF_ACTIONS = "src/app/projects/[id]/kick-off-actions.ts";
const KICK_OFF_STORE = "src/lib/project-docs/kick-off-store.ts";

describe("the kick-off meeting: staff actions lock the contract, the store locks the meeting", () => {
  const actionsSrc = read(KICK_OFF_ACTIONS);
  const storeSrc = read(KICK_OFF_STORE);
  const acts = actions(actionsSrc);
  const cores = actions(storeSrc);

  it("three actions, each reading the clock once before it enters the lock; scheduling and recording it held begin their attribution before it, a change (no Person column) begins none", () => {
    expect([...acts.keys()].sort()).toEqual(["changeKickOff", "recordKickOffHeld", "scheduleKickOff"]);
    for (const [name, body] of acts) {
      const entry = body.indexOf("return inContract(");
      expect(entry, name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeGreaterThan(-1);
      expect(body.indexOf("const now = toSecond(new Date());"), name).toBeLessThan(entry);
      expect((body.match(/new Date\(\)/g) ?? []).length, name).toBe(1);
      const begun = [...body.matchAll(/\bbeginAct\(/g)].map((m) => m.index!);
      expect(begun.length, name).toBe(name === "changeKickOff" ? 0 : 1);
      for (const at of begun) expect(at, `${name}: beginAct after the lock was taken`).toBeLessThan(entry);
    }
    expect((actionsSrc.match(/new Date\(\)/g) ?? []).length).toBe(acts.size);
  });

  it("the actions' own helper locks the contract (withLockedContract) and asks the PROJECT_WORKSPACE row, then the day, inside it; the file locks no row, opens no transaction and never uses the global client", () => {
    const at = actionsSrc.indexOf("async function inContract(");
    const helper = actionsSrc.slice(at, actionsSrc.indexOf("\n}\n", at));
    expect(helper).toContain("withLockedContract(");
    expect(helper.indexOf('actStatusFault("PROJECT_WORKSPACE", l.contract.status as ContractStatus)')).toBeGreaterThan(helper.indexOf("withLockedContract("));
    expect(helper.indexOf("dayOf(now, l.org.timeZone)")).toBeGreaterThan(helper.indexOf("actStatusFault("));
    expect(helper.indexOf("fn({ tx, l, now, today })")).toBeGreaterThan(helper.indexOf("dayOf("));
    expect(lex(actionsSrc)).not.toMatch(/FOR UPDATE|FOR SHARE|\$transaction|\bdb\./);
  });

  it("the store has the three cores, never locks the contract, opens no transaction or savepoint, never uses the global client, and never reads the clock", () => {
    expect([...cores.keys()].sort()).toEqual(["changeMeeting", "recordMeetingHeld", "scheduleMeeting"]);
    const code = lex(storeSrc);
    expect(code).not.toMatch(/withLockedContract|withLockedAward|inHeldContract|\bdb\.|\$transaction|auditedCreate|auditedUpdate/);
    expect(code).not.toMatch(/new Date\(\)/);
    expect(lex(storeSrc, { only: "comments" })).not.toMatch(/SAVEPOINT/i);
  });

  it("the meeting is the only row the store locks, by its contract, with SELECT ... FOR UPDATE (never a no-op UPDATE); each core locks it after PW-5 is read and before it judges", () => {
    expect([...storeSrc.matchAll(/FROM "(\w+)" WHERE "?\w+"? = \$\{[\w.]+\} FOR UPDATE/g)].map((m) => m[1])).toEqual(["KickOffMeeting"]);
    const at = storeSrc.indexOf("async function lockedMeeting(");
    const locker = storeSrc.slice(at, storeSrc.indexOf("\n}\n", at));
    expect(locker).toMatch(/SELECT id FROM "KickOffMeeting" WHERE "contractId" = \$\{c\.l\.contract\.id\} FOR UPDATE/);
    expect(locker.indexOf("FOR UPDATE")).toBeLessThan(locker.indexOf("kickOffMeeting.findFirst("));
    for (const [name, body] of cores) {
      expect(body.indexOf("authorityToday(c, a.personId)"), name).toBeGreaterThan(-1);
      expect(body.indexOf("lockedMeeting(c)"), name).toBeGreaterThan(body.indexOf("authorityToday(c, a.personId)"));
      const judged = body.search(/(?:schedule|change|held)Faults\(/);
      expect(judged, name).toBeGreaterThan(body.indexOf("lockedMeeting(c)"));
      const written = body.search(/\.kickOffMeeting\.(?:create|update)\(/);
      expect(written, name).toBeGreaterThan(judged);
    }
  });

  it("recording it held writes in the one order the triggers need: the minutes (createDocument), then ONE update of the meeting, then the attendance", () => {
    const body = cores.get("recordMeetingHeld")!;
    const minutes = body.indexOf("createDocument(");
    const update = body.indexOf(".kickOffMeeting.update(");
    const attendance = body.indexOf(".kickOffAttendance.create(");
    expect(minutes).toBeGreaterThan(body.indexOf("heldFaults("));
    expect(update).toBeGreaterThan(minutes);
    expect(attendance).toBeGreaterThan(update);
    expect((body.match(/\.kickOffMeeting\.update\(/g) ?? []).length).toBe(1);
  });

  it("an attribution is written only on the act's own tx: the meeting's slot on the meeting, the minutes' beside it", () => {
    let written = 0;
    for (const m of storeSrc.matchAll(/\bact\.(?:write|writeAlso)\(\s*([^,)]+)/g)) {
      written++;
      expect(m[1].trim(), `an attribution written on another client: ${m[0]}`).toMatch(/^(?:c\.)?tx$/);
    }
    expect(written).toBeGreaterThanOrEqual(4);
    expect(cores.get("scheduleMeeting")).toContain("act.write(c.tx, m.id)");
    expect(cores.get("recordMeetingHeld")).toContain("act.write(c.tx, meeting.id)");
    expect(cores.get("changeMeeting")).not.toMatch(/\bact\.(?:write|writeAlso)\(|PreparedAct/);
  });
});
