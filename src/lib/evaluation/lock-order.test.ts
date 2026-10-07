import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * 6.8 fix M-2 (correcting BD-68-3): recording an appointment matter's outcome may open the next
 * evaluation version, which writes the exercise row. It takes the exercise's locks in the order every
 * exercise act takes them — requisition → exercise → window → openings — before the sitting's, then
 * the evaluations; tabling a first-stage matter takes the same order. Source scan of the lock calls.
 * Also fix R-9: the act's clock is read once, at its entry.
 */

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");
const committee = read("src", "app", "committees", "actions.ts");
const between = (src: string, from: string, to: string) => src.slice(src.indexOf(from), src.indexOf(to, src.indexOf(from)));
// Phase 1c (ADR 0034 D10): every lock is now asked for the signed-in person's organisation (`scope`, or its id) as well; the calls below
// name it where it is now an argument. The order each test asserts is unchanged, and no call was dropped from any list.
const inOrder = (src: string, calls: string[]) => {
  const at = calls.map((c) => src.indexOf(c));
  for (const [i, c] of calls.entries()) expect(at[i], `${c} is called`).toBeGreaterThanOrEqual(0);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
};

describe("the outcome of an appointment matter locks the exercise before the sitting (M-2)", () => {
  const helper = between(committee, "async function inSittingAfterExercise(", "\n}\n");
  it("requisition → exercise (one helper) → window → openings → sitting", () => {
    inOrder(helper, ["withLockedRequisitionForSourcing(scope.organisationId, requisitionId, exerciseId", "lockWindowRow(tx, exerciseId)", "lockOpeningRows(tx, exerciseId)", "lockSittingIn(tx, scope, meetingId, roster)", "fn(tx, s)"]);
  });
  it("withLockedRequisitionForSourcing locks the requisition, then the exercise", () => {
    const repo = read("src", "lib", "method", "repo.ts");
    inOrder(between(repo, "export async function withLockedRequisitionForSourcing", "\n}\n"), ['FROM "Requisition"', 'FROM "SourcingExercise"']);
  });
  // Residual round (S-3d, stricter): a variation's matter takes its contract's path (the contract's chain, then the
  // variation, then the sitting, as tableVariationMatter does), asking VARIATION's row (act-status-scan.test.ts).
  // Founder, 2026-10-05 (the outcome flows back to the record; stricter): a requisition's, a name's and a contract
  // matter's matters now lock their record first too, and the appointment's path its award; see the describe below.
  it("an appointment matter on an exercise takes that path; a variation's matter its contract's; a record's matter its record's; any other matter the sitting's alone", () => {
    const rec = between(committee, "export async function recordOutcome(", "\n}\n");
    // Phase 1c (ADR 0034 D10): the unlocked pre-reads are asked for the signed-in person's organisation (`actor`); otherwise as pinned.
    expect(rec).toMatch(/const exerciseId = await appointmentExerciseOf\(actor, decisionId\);/);
    expect(rec).toMatch(/const variation = exerciseId \? null : await variationMatterOf\(actor, decisionId\);/);
    expect(rec).toMatch(/const awardId = exerciseId \? await openAppointmentOf\(exerciseId\) : null;/);
    expect(rec).toMatch(/const record = exerciseId \|\| variation \? null : await outcomeRecordOf\(actor, decisionId\);/);
    expect(rec).toMatch(/return exerciseId\n\s+\? inSittingAfterExercise\(actor, toAuditActor\(actor\), meetingId, exerciseId, run, awardId \? \{ awardId, decisionId \} : null\)\n\s+: variation\n\s+\? inSittingAfterContract\(actor, toAuditActor\(actor\), meetingId, variation, run, \{ decisionId, now \}\)\n\s+: record\n\s+\? inSittingAfterRecord\(actor, toAuditActor\(actor\), meetingId, record, decisionId, now, run\)\n\s+: inSitting\(actor, meetingId, run\);/);
    expect(rec.indexOf("matterKey(decision) !== outcomeRecordKey(record)")).toBeGreaterThan(-1);
    expect(rec.indexOf("matterKey(decision) !== outcomeRecordKey(record)")).toBeLessThan(rec.indexOf("tx.committeeDecision.updateMany("));
    // The exercise and the variation locked are the matter's own, judged before anything is written.
    expect(rec.indexOf("decision.exerciseId !== exerciseId")).toBeLessThan(rec.indexOf("tx.committeeDecision.updateMany("));
    expect(rec.indexOf("decision.variationId !== (variation?.id ?? null)")).toBeLessThan(rec.indexOf("tx.committeeDecision.updateMany("));
    const wrap = between(committee, "async function inSittingAfterContract(", "\n}\n");
    inOrder(wrap, ["withLockedContract(", 'actStatusFault("VARIATION"', 'FROM "Variation"', "lockSittingIn("]);
  });
  it("the appointment's path locks its award after the openings and before the sitting, and links after the outcome (founder, 2026-10-05)", () => {
    const helper = between(committee, "async function inSittingAfterExercise(", "\n}\n");
    inOrder(helper, ["lockOpeningRows(tx, exerciseId)", "lockAwardIn(tx, scope.organisationId, appointment.awardId, exerciseId)", "lockSittingIn(tx, scope, meetingId, roster)", "fn(tx, s)", "linkOutcome(tx,", 'citeAppointmentStep(tx, actor, award, stepId, appointment.decisionId, "OUTCOME")']);
    const repo = read("src", "lib", "award", "repo.ts");
    inOrder(between(repo, "export async function lockAwardIn(", "\n}\n"), ['FROM "Award" WHERE id = $' + "{awardId} FOR UPDATE", "loadAward(organisationId, awardId, tx)"]);
  });
  it("the evaluations are locked last, in the loop-back, which locks nothing of the exercise's itself", () => {
    const loop = between(committee, "async function loopBack(", "\n}\n");
    expect(loop.indexOf("lockEvaluationRows(tx, exerciseId)")).toBeLessThan(loop.indexOf("openNewVersion("));
    expect(loop).not.toMatch(/withLockedRequisitionForSourcing|lockWindowRow|lockOpeningRows|lockSittingIn/);
  });
  it("tabling a first-stage matter takes the same order", () => {
    const table = read("src", "app", "sourcing", "[id]", "evaluation", "stage-one-actions.ts");
    inOrder(table, ["inWindow(actor, exerciseIdOf(data)", "lockOpeningRows(tx, l.ex.id)", "lockSittingIn(tx, actor, meetingId, roster)", "lockEvaluationRows(tx, l.ex.id)"]);
  });
  it("lock.ts states the corrected order", () => {
    const lock = read("src", "lib", "evaluation", "lock.ts");
    expect(lock).toMatch(/requisition → exercise → window → openings →\n \* sitting → evaluations/);
  });
});

describe("one clock read per act (R-9)", () => {
  it("recordOutcome reads the clock at its entry and the loop-back stamps with it", () => {
    const rec = between(committee, "export async function recordOutcome(", "\n}\n");
    // Phase 1c (ADR 0034 D10): the sitting is found for the signed-in person's organisation (`meetingOf(actor, …)`); the order is as pinned.
    expect(rec.indexOf("const now = toSecond(new Date());")).toBeLessThan(rec.indexOf("await meetingOf(actor, decisionId)"));
    const loop = between(committee, "async function loopBack(", "\n}\n");
    expect(loop).not.toMatch(/new Date\(/);
    expect(loop).toMatch(/timeZone: s\.timeZone, now \}/);
  });
  it("recordNegotiationDecision reads the clock once, at its entry", () => {
    const meeting = read("src", "app", "sourcing", "[id]", "evaluation", "meeting-actions.ts");
    const act = between(meeting, "export async function recordNegotiationDecision(", "\n}\n");
    expect(act.indexOf("const now = stampNow();")).toBeLessThan(act.indexOf("inEvaluation("));
    expect(act).not.toMatch(/new Date\(/);
  });
});

/**
 * Founder, 2026-10-05 (the outcome flows back by itself; stricter, new paths): recording an outcome on a matter tabled
 * for a record's approval locks the record's chain before the sitting, as tabling from the record takes them, writes the
 * outcome, reads the record again, and only then runs the record's own citation, behind a savepoint. No path locks a
 * record after its sitting.
 */
describe("the outcome locks the record before the sitting, then links (founder, 2026-10-05)", () => {
  it("a variation's matter: contract → VARIATION's row → the variation → the sitting → the outcome → the variation read again → its citation", () => {
    const wrap = between(committee, "async function inSittingAfterContract(", "\n}\n");
    inOrder(wrap, ["withLockedContract(", 'actStatusFault("VARIATION"', 'FROM "Variation"', "lockSittingIn(", "fn(tx, s)", "loadVariations(l.contract.id, tx)", "linkOutcome(tx,", 'citeVariationDecision(c, v, stepId, link.decisionId, "OUTCOME")']);
  });
  it("a requisition's matter: the requisition → the sitting → the outcome → the requisition read again → its citation", () => {
    const wrap = between(committee, "async function inSittingAfterRecord(", "\n}\n");
    const req = wrap.slice(wrap.indexOf("withLockedRequisition(scope.organisationId, record.requisitionId"));
    inOrder(req, ["withLockedRequisition(scope.organisationId, record.requisitionId", "lockSittingIn(tx, scope, meetingId, roster)", "fn(tx, s)", "loadRequisition(scope.organisationId, l.req.id, tx)", "linkOutcome(tx,", 'citeCommitteeStep(tx, actor, fresh, stepId, decisionId, "OUTCOME")']);
  });
  it("a name's matter: the requisition → the exercise (one helper) → the sitting → the outcome → its citation", () => {
    const wrap = between(committee, "async function inSittingAfterRecord(", "\n}\n");
    const name = wrap.slice(wrap.indexOf("withLockedRequisitionForSourcing(scope.organisationId, record.requisitionId, record.exerciseId"), wrap.indexOf("withLockedRequisition(scope.organisationId, record.requisitionId"));
    inOrder(name, ["withLockedRequisitionForSourcing(scope.organisationId, record.requisitionId, record.exerciseId", "lockSittingIn(tx, scope, meetingId, roster)", "fn(tx, s)", "linkOutcome(tx,", 'citeNameStep(tx, actor, { org: l.org, ex }, stepId, decisionId, "OUTCOME")']);
  });
  it("a contract matter's: the contract's chain → its family's row → the matter and its record → the sitting → the outcome → the matter read again → its citation", () => {
    const wrap = between(committee, "async function inContractMatterForOutcome(", "\n}\n");
    inOrder(wrap, ["withLockedContract(scope.organisationId, record.contractId", "actStatusFault(family, l.contract.status as ContractStatus)", "lockMatter(c, record.id)", "lockSittingIn(tx, scope, meetingId, roster)", "fn(tx, s)", "loadMatters(l.contract.id, tx)", "linkOutcome(tx,", 'citeMatterDecision(c, m, stepId, decisionId, "OUTCOME")']);
  });
  it("the link takes no lock of its own, and runs the citation behind a savepoint that a refusal rolls back to", () => {
    const link = read("src", "lib", "committee", "auto-link-write.ts");
    expect(link).not.toMatch(/FOR UPDATE|FOR SHARE|\$transaction/);
    const fn = between(link, "export async function linkOutcome(", "\n}\n");
    inOrder(fn, ["autoLinkTarget(", "SAVEPOINT committee_outcome_link", "i.cite(target.stepId)", "RELEASE SAVEPOINT committee_outcome_link", "i.refusal(e)", "ROLLBACK TO SAVEPOINT committee_outcome_link"]);
    // Anything that is not the record's refusal is rethrown: the whole act rolls back.
    expect(fn).toMatch(/if \(!said\) throw e;/);
  });
  it("scheduling a sitting with waiting items creates it, then locks it and tables each through the one writer; it locks no record", () => {
    const schedule = between(committee, "export async function scheduleSitting(", "\n}\n");
    // Phase 0 of the sign-in programme: the sitting is created, and numbered under the series lock, by createNumberedSitting
    // (sitting-number.ts), which makes the meeting row with tx.meeting.create; the order asserted is unchanged: create, then table.
    inOrder(schedule, ["createNumberedSitting(tx,", "tableWaiting(actor, tx, toAuditActor(actor), row.id"]);
    inOrder(read("src", "lib", "committee", "sitting-number.ts"), ["issueReference(tx,", "tx.meeting.create("]);
    const table = between(committee, "async function tableWaiting(", "\n}\n");
    inOrder(table, ["loadWaiting(scope.organisationId, tx)", "lockSittingIn(tx, scope, meetingId, roster)", 'permit(s, "TABLE")', "tableInto(tx, by, s, r,"]);
    expect(table).not.toMatch(/withLocked|FOR UPDATE/);
  });
});
