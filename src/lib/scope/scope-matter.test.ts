import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "@/lib/committee/record";

import { scopeApprovalLine, scopeFaultText, scopeRuleMovedNote, scopeRuleWords, SCOPE_STATE_BADGE, SCOPE_STATE_TEXT } from "./labels";
import { countsFor, ruleMove, scopeApproval, scopeApprovalForFile, scopeCitationFault, scopeClears, scopeFileMatterSubject, scopeMatterSubject, type ScopeMatter, type ScopeRule } from "./scope-matter";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const rule: ScopeRule = { scopeApprovalRequired: true, scopeCommitteeCode: "TECH", scopeAct: "A" };
const v1 = { id: "v1", versionNo: 1, status: "FINALISED" as const };
const day = (d: string) => new Date(`${d}T00:00:00Z`);

function record(outcome: DecisionRecord["outcome"], decided: string, notApproved: DecisionRecord["notApproved"] = null): DecisionRecord {
  return {
    committee: "Technical Committee", meetingReference: "SIT/1", meetingDate: day(decided), subject: "Scope", matterRef: null, outcome, decisionDate: day(decided),
    quorum: { required: 3, present: 3, recused: 0 }, votingRule: { rule: "SIMPLE_MAJORITY", provenance: "ASSUMED" }, notApproved, note: "", votes: [],
  };
}
const matter = (id: string, x: Partial<ScopeMatter> = {}): ScopeMatter => ({ id, bqVersionId: "v1", committeeCode: "TECH", act: "A", withdrawn: false, sittingCancelled: false, tabledAt: day("2026-09-20"), record: null, sittingReference: "SIT/1", ...x });

describe("scopeApproval: three-state rule, never a quiet 'not required' (OD-9)", () => {
  it("an unset rule is RULE_NOT_SET, not NOT_REQUIRED; a method no longer configured says so", () => {
    expect(scopeApproval({ scopeApprovalRequired: null, scopeCommitteeCode: null, scopeAct: null }, [v1], []).state).toBe("RULE_NOT_SET");
    expect(scopeApproval({ scopeApprovalRequired: null, scopeCommitteeCode: "TECH", scopeAct: null }, [v1], [matter("d1", { record: record("CARRIED", "2026-09-25") })]).state).toBe("RULE_NOT_SET");
    expect(scopeApproval(null, [v1], []).state).toBe("METHOD_NOT_CONFIGURED");
  });
  it("NOT_REQUIRED only when the rule says no", () => {
    expect(scopeApproval({ scopeApprovalRequired: false, scopeCommitteeCode: null, scopeAct: null }, [], []).state).toBe("NOT_REQUIRED");
  });
  it("a yes with no committee is COMMITTEE_NOT_SET", () => {
    expect(scopeApproval({ scopeApprovalRequired: true, scopeCommitteeCode: null, scopeAct: null }, [v1], []).state).toBe("COMMITTEE_NOT_SET");
  });
  it("a yes with a committee and no act is ACT_NOT_SET where nothing is tabled; a decision already taken is not undone by unsetting it (62-C1)", () => {
    const noAct = { ...rule, scopeAct: null };
    expect(scopeApproval(noAct, [v1], []).state).toBe("ACT_NOT_SET");
    expect(scopeClears("ACT_NOT_SET")).toBe(false);
    // 62-C1 (was ACT_NOT_SET, read against today's configuration): the matter carried under
    // the act configured when it was tabled stays approved, and says the act is now unset.
    const carried = scopeApproval(noAct, [v1], [matter("d1", { record: record("CARRIED", "2026-09-25") })]);
    expect(carried).toMatchObject({ state: "APPROVED", movedOn: { tabled: { act: "A" }, now: { act: null }, actMoved: true, committeeMoved: false, decided: true } });
  });
  it("62-C1: a matter speaks under the act it was tabled under; the rule moving from R to A later does not undo the approval, and says so", () => {
    // Tabled when the method's act was R (tableScope writes the configured act and no other), carried.
    const recommended = matter("d1", { act: "R", record: record("CARRIED", "2026-09-25") });
    // Under R, as tabled: approved, nothing moved.
    expect(scopeApproval({ ...rule, scopeAct: "R" }, [v1], [recommended])).toMatchObject({ state: "APPROVED", movedOn: null });
    // Configuration later moved to A (was NOT_TABLED, read against today's act): it stays approved and names both.
    const a = scopeApproval(rule, [v1], [recommended]);
    expect(a).toMatchObject({ state: "APPROVED", decisive: { id: "d1" }, movedOn: { tabled: { committeeCode: "TECH", act: "R" }, now: { committeeCode: "TECH", act: "A" }, actMoved: true, committeeMoved: false, decided: true } });
    expect(scopeClears(a.state)).toBe(true);
    // Still waiting when it moved (was NOT_TABLED): it is decided under R, and holds the version until withdrawn.
    expect(scopeApproval(rule, [v1], [matter("d1", { act: "R" })])).toMatchObject({ state: "PENDING", movedOn: { actMoved: true, decided: false } });
    // The other direction, A then R: the same.
    expect(scopeApproval({ ...rule, scopeAct: "R" }, [v1], [{ ...recommended, act: "A" }])).toMatchObject({ state: "APPROVED", movedOn: { tabled: { act: "A" }, now: { act: "R" } } });
    // No move, no warning.
    expect(scopeApproval(rule, [v1], [{ ...recommended, act: "A" }])).toMatchObject({ state: "APPROVED", movedOn: null });
  });
  it("no finalised bill, then not tabled, then pending, then approved", () => {
    expect(scopeApproval(rule, [{ ...v1, status: "DRAFT" }], []).state).toBe("NO_FINALISED_BILL");
    expect(scopeApproval(rule, [v1], []).state).toBe("NOT_TABLED");
    const p = scopeApproval(rule, [v1], [matter("d1")]);
    expect(p).toMatchObject({ state: "PENDING", versionNo: 1, decisive: { id: "d1" } });
    expect(scopeApproval(rule, [v1], [matter("d1", { record: record("CARRIED", "2026-09-25") })])).toMatchObject({ state: "APPROVED", decisive: { id: "d1" } });
  });
  it("not carried: a loop returns it, a terminal outcome ends it, no outcome recorded cannot be read", () => {
    expect(scopeApproval(rule, [v1], [matter("d1", { record: record("NOT_CARRIED", "2026-09-25", { nameEn: "Return", kind: "LOOP" }) })]).state).toBe("RETURNED");
    expect(scopeApproval(rule, [v1], [matter("d1", { record: record("NOT_CARRIED", "2026-09-25", { nameEn: "End", kind: "TERMINAL" }) })]).state).toBe("ENDED");
    expect(scopeApproval(rule, [v1], [matter("d1", { record: record("NOT_CARRIED", "2026-09-25") })]).state).toBe("OUTCOME_NOT_RECORDED");
  });
  it("deferred waits to be tabled again; tabled again it is pending", () => {
    const deferred = matter("d1", { record: record("DEFERRED", "2026-09-25") });
    expect(scopeApproval(rule, [v1], [deferred]).state).toBe("DEFERRED");
    expect(scopeApproval(rule, [v1], [deferred, matter("d2", { tabledAt: day("2026-09-28") })]).state).toBe("PENDING");
  });
  it("the latest decision speaks: carried after an unreadable outcome is approved", () => {
    const first = matter("d1", { record: record("NOT_CARRIED", "2026-09-20") });
    const second = matter("d2", { record: record("CARRIED", "2026-09-27") });
    expect(scopeApproval(rule, [v1], [second, first]).state).toBe("APPROVED");
  });
  it("withdrawn matters count for nothing; a matter before the committee configured when it was tabled speaks after the committee moves (62-C1)", () => {
    expect(scopeApproval(rule, [v1], [matter("d1", { withdrawn: true, record: record("CARRIED", "2026-09-25") })]).state).toBe("NOT_TABLED");
    // 62-C1 (was NOT_TABLED, read against today's committee): carried at a BOARD sitting when
    // BOARD was the method's committee, it stays approved after the rule moves to TECH.
    expect(scopeApproval(rule, [v1], [matter("d1", { committeeCode: "BOARD", record: record("CARRIED", "2026-09-25") })])).toMatchObject({
      state: "APPROVED",
      movedOn: { tabled: { committeeCode: "BOARD", act: "A" }, now: { committeeCode: "TECH", act: "A" }, committeeMoved: true, actMoved: false, decided: true },
    });
  });
  it("an undecided matter at a cancelled sitting counts as withdrawn: it never blocks for ever, and the version is tabled again", () => {
    const stranded = matter("d1", { sittingCancelled: true });
    expect(scopeApproval(rule, [v1], [stranded]).state).toBe("NOT_TABLED");
    expect(codes(scopeCitationFault({ exercise: { id: "x1", status: "DOCUMENTS_IN_PREPARATION" }, rule, version: { id: "v1", exerciseId: "x1", status: "FINALISED" }, sitting: { committeeCode: "TECH", frozen: false }, act: "A", matters: [stranded] }))).toEqual([]);
    expect(scopeApproval(rule, [v1], [stranded, matter("d2", { tabledAt: day("2026-09-28") })])).toMatchObject({ state: "PENDING", decisive: { id: "d2" } });
    // A decision recorded before the sitting was cancelled still stands.
    expect(scopeApproval(rule, [v1], [matter("d1", { sittingCancelled: true, record: record("CARRIED", "2026-09-25") })]).state).toBe("APPROVED");
  });
  it("approval belongs to one version: a finalised revision is not approved by its predecessor's decision", () => {
    const versions = [{ id: "v1", versionNo: 1, status: "SUPERSEDED" as const }, { id: "v2", versionNo: 2, status: "FINALISED" as const }];
    const a = scopeApproval(rule, versions, [matter("d1", { record: record("CARRIED", "2026-09-25") })]);
    expect(a).toMatchObject({ state: "NOT_TABLED", versionNo: 2, earlierApprovedVersionNo: 1 });
    expect(scopeApprovalLine(a, "Technical Committee")).toMatch(/Version 1 was approved/);
    expect(scopeApproval(rule, versions, [matter("d1", { record: record("CARRIED", "2026-09-25") }), matter("d2", { bqVersionId: "v2", record: record("CARRIED", "2026-09-30") })]).state).toBe("APPROVED");
  });
  it("only NOT_REQUIRED and APPROVED clear", () => {
    const all = Object.keys(SCOPE_STATE_TEXT) as (keyof typeof SCOPE_STATE_TEXT)[];
    expect(all.filter(scopeClears).sort()).toEqual(["APPROVED", "NOT_REQUIRED"]);
    for (const s of all) {
      expect(SCOPE_STATE_BADGE[s].label, s).toBeTruthy();
      expect(SCOPE_STATE_TEXT[s], s).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
  it("the card's line names the committee and the sitting, never an id", () => {
    const a = scopeApproval(rule, [v1], [matter("d1", { record: record("CARRIED", "2026-09-25") })]);
    expect(scopeApprovalLine(a, "Technical Committee", () => "25 Sep 2026")).toBe("Version 1 of the bill: approved by the Technical Committee at SIT/1, 25 Sep 2026.");
  });
});

describe("scopeCitationFault: which version may be tabled at which sitting", () => {
  const base: Parameters<typeof scopeCitationFault>[0] = {
    exercise: { id: "x1", status: "DOCUMENTS_IN_PREPARATION" },
    rule,
    version: { id: "v1", exerciseId: "x1", status: "FINALISED" },
    sitting: { committeeCode: "TECH", frozen: false },
    act: "A",
    matters: [],
  };
  const judge = (x: Partial<typeof base> = {}) => codes(scopeCitationFault({ ...base, ...x }));

  it("a finalised version of this exercise, at an open sitting of the configured committee: allowed", () => {
    expect(judge()).toEqual([]);
  });
  it("one fault per rule", () => {
    expect(judge({ exercise: { id: "x1", status: "CANCELLED" } })).toEqual(["EXERCISE_CANCELLED"]);
    expect(judge({ version: { id: "v1", exerciseId: "x2", status: "FINALISED" } })).toEqual(["OTHER_EXERCISE"]);
    expect(judge({ rule: null })).toEqual(["METHOD_NOT_CONFIGURED"]);
    expect(judge({ rule: { scopeApprovalRequired: null, scopeCommitteeCode: "TECH", scopeAct: null } })).toEqual(["SCOPE_RULE_NOT_SET"]);
    expect(judge({ rule: { scopeApprovalRequired: false, scopeCommitteeCode: null, scopeAct: null } })).toEqual(["SCOPE_NOT_REQUIRED"]);
    expect(judge({ rule: { scopeApprovalRequired: true, scopeCommitteeCode: null, scopeAct: null } })).toEqual(["SCOPE_COMMITTEE_NOT_SET"]);
    expect(judge({ sitting: { committeeCode: "BOARD", frozen: false } })).toEqual(["OTHER_COMMITTEE"]);
    expect(judge({ version: { id: "v1", exerciseId: "x1", status: "DRAFT" } })).toEqual(["VERSION_NOT_FINALISED"]);
    expect(judge({ version: { id: "v1", exerciseId: "x1", status: "SUPERSEDED" } })).toEqual(["VERSION_NOT_FINALISED"]);
    expect(judge({ sitting: { committeeCode: "TECH", frozen: true } })).toEqual(["SITTING_CLOSED"]);
  });
  it("the act is the configured one (overrides BD-62-16): unset blocks naming the setting, another act is refused as the gate refuses it", () => {
    expect(judge({ rule: { ...rule, scopeAct: null } })).toEqual(["SCOPE_ACT_NOT_SET"]);
    expect(scopeFaultText(scopeCitationFault({ ...base, rule: { ...rule, scopeAct: null } })[0])).toMatch(/Configuration, Scope and estimate/);
    expect(judge({ act: "R" })).toEqual(["OTHER_ACT"]);
    expect(judge({ act: null })).toEqual(["OTHER_ACT"]);
    // 62-C1 (was []: read against today's act): a version carried under the act configured
    // when it was tabled is approved, and is not tabled again because the act has moved since.
    expect(judge({ matters: [matter("d1", { act: "R", record: record("CARRIED", "2026-09-25") })] })).toEqual(["SCOPE_ALREADY_APPROVED"]);
    for (const f of [...scopeCitationFault({ ...base, rule: { ...rule, scopeAct: null } }), ...scopeCitationFault({ ...base, act: "R" })]) {
      expect(scopeFaultText(f), f.code).not.toBe("This was refused.");
      expect(scopeFaultText(f), f.code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
  it("one version answers once: waiting or carried refuse; returned and ended send it back to the bill", () => {
    expect(judge({ matters: [matter("d1")] })).toEqual(["SCOPE_ALREADY_WAITING"]);
    expect(scopeFaultText(scopeCitationFault({ ...base, matters: [matter("d1")] })[0])).toBe("This version is already tabled at SIT/1 and waiting for the decision.");
    expect(judge({ matters: [matter("d1", { record: record("CARRIED", "2026-09-25") })] })).toEqual(["SCOPE_ALREADY_APPROVED"]);
    expect(judge({ matters: [matter("d1", { record: record("NOT_CARRIED", "2026-09-25", { nameEn: "Return", kind: "LOOP" }) })] })).toEqual(["SCOPE_RETURNED"]);
    expect(judge({ matters: [matter("d1", { record: record("NOT_CARRIED", "2026-09-25", { nameEn: "End", kind: "TERMINAL" }) })] })).toEqual(["SCOPE_ENDED"]);
  });
  it("unreadable, re-tabled, a further tabling is refused: the re-tabled matter is what it waits on", () => {
    const unreadable = matter("d1", { record: record("NOT_CARRIED", "2026-09-25") });
    const again = matter("d2", { tabledAt: day("2026-09-28"), sittingReference: "SIT/2" });
    expect(scopeApproval(rule, [v1], [unreadable, again])).toMatchObject({ state: "PENDING", decisive: { id: "d2" } });
    expect(judge({ matters: [unreadable, again] })).toEqual(["SCOPE_ALREADY_WAITING"]);
    // Tabled again on the day of the unreadable decision counts too.
    expect(scopeApproval(rule, [v1], [unreadable, matter("d2", { tabledAt: day("2026-09-25") })]).state).toBe("PENDING");
    // Once the re-tabled matter is carried, it is approved.
    expect(scopeApproval(rule, [v1], [unreadable, matter("d2", { tabledAt: day("2026-09-28"), record: record("CARRIED", "2026-09-30") })]).state).toBe("APPROVED");
  });
  it("a deferred matter, a withdrawn one, or an unreadable outcome may be tabled again", () => {
    expect(judge({ matters: [matter("d1", { record: record("DEFERRED", "2026-09-25") })] })).toEqual([]);
    expect(judge({ matters: [matter("d1", { withdrawn: true })] })).toEqual([]);
    expect(judge({ matters: [matter("d1", { record: record("NOT_CARRIED", "2026-09-25") })] })).toEqual([]);
  });
  it("every refusal has words that name the way forward, and none shows a code", () => {
    const all = [
      ...scopeCitationFault({ ...base, exercise: { id: "x1", status: "CANCELLED" }, rule: { scopeApprovalRequired: null, scopeCommitteeCode: null, scopeAct: null }, version: { id: "v1", exerciseId: "x2", status: "DRAFT" }, sitting: { committeeCode: "B", frozen: true } }),
      ...scopeCitationFault({ ...base, matters: [matter("d1", { record: record("NOT_CARRIED", "2026-09-25", { nameEn: "End", kind: "TERMINAL" }) })] }),
    ];
    expect(all.length).toBeGreaterThan(4);
    for (const f of all) {
      const t = scopeFaultText(f);
      expect(t, f.code).not.toBe("This was refused.");
      expect(t, f.code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
    }
  });
  it("the matter's subject names the exercise and the version", () => {
    expect(scopeMatterSubject("FRP tank repair by its manufacturer", 1)).toBe("FRP tank repair by its manufacturer, scope version 1");
  });
});

describe("62-C1: a scope matter is judged under the committee and act written on it at tabling", () => {
  const citation: Parameters<typeof scopeCitationFault>[0] = {
    exercise: { id: "x1", status: "DOCUMENTS_IN_PREPARATION" },
    rule,
    version: { id: "v1", exerciseId: "x1", status: "FINALISED" },
    sitting: { committeeCode: "TECH", frozen: false },
    act: "A",
    matters: [],
  };
  const moves = [
    { name: "the committee moved (BOARD then, TECH now)", tabled: { committeeCode: "BOARD", act: "A" }, committeeMoved: true, actMoved: false },
    { name: "the act moved (R then, A now)", tabled: { committeeCode: "TECH", act: "R" }, committeeMoved: false, actMoved: true },
    { name: "both moved", tabled: { committeeCode: "BOARD", act: "R" }, committeeMoved: true, actMoved: true },
  ];

  it.each(moves)("decided, $name: every outcome stands as taken, and the move is named", ({ tabled, committeeMoved, actMoved }) => {
    const as = (r: DecisionRecord) => [matter("d1", { ...tabled, record: r })];
    expect(scopeApproval(rule, [v1], as(record("CARRIED", "2026-09-25")))).toMatchObject({ state: "APPROVED", movedOn: { committeeMoved, actMoved, decided: true } });
    expect(scopeApproval(rule, [v1], as(record("NOT_CARRIED", "2026-09-25", { nameEn: "Return", kind: "LOOP" }))).state).toBe("RETURNED");
    expect(scopeApproval(rule, [v1], as(record("NOT_CARRIED", "2026-09-25", { nameEn: "End", kind: "TERMINAL" }))).state).toBe("ENDED");
    expect(scopeApproval(rule, [v1], as(record("DEFERRED", "2026-09-25")))).toMatchObject({ state: "DEFERRED", movedOn: { committeeMoved, actMoved } });
  });

  it.each(moves)("waiting, $name: pending under the rule it was tabled under; withdrawn, it is tabled again under today's with no fault", ({ tabled, committeeMoved, actMoved }) => {
    const waiting = matter("d1", { ...tabled });
    expect(scopeApproval(rule, [v1], [waiting])).toMatchObject({ state: "PENDING", decisive: { id: "d1" }, movedOn: { committeeMoved, actMoved, decided: false } });
    // While it waits, the version is not tabled twice; the refusal names withdrawal as the way out.
    const f = scopeCitationFault({ ...citation, matters: [waiting] });
    expect(codes(f)).toEqual(["SCOPE_ALREADY_WAITING"]);
    expect(scopeFaultText(f[0])).toBe("This version is already tabled at SIT/1 and waiting for the decision. It was tabled under the rule configured then; to table it under today's, withdraw it from that sitting first.");
    // Withdrawn, then tabled again under today's rule: nothing stands in the way.
    expect(codes(scopeCitationFault({ ...citation, matters: [{ ...waiting, withdrawn: true }] }))).toEqual([]);
    // The re-tabled matter, under today's rule, is what the version waits on, with nothing moved.
    expect(scopeApproval(rule, [v1], [{ ...waiting, withdrawn: true }, matter("d2", { tabledAt: day("2026-09-28") })])).toMatchObject({ state: "PENDING", decisive: { id: "d2" }, movedOn: null });
  });

  it("nothing moved: no warning, and a waiting matter's refusal does not mention an earlier rule", () => {
    expect(scopeApproval(rule, [v1], [matter("d1", { record: record("CARRIED", "2026-09-25") })]).movedOn).toBeNull();
    expect(scopeApproval(rule, [v1], [matter("d1")]).movedOn).toBeNull();
    expect(scopeFaultText(scopeCitationFault({ ...citation, matters: [matter("d1")] })[0])).toBe("This version is already tabled at SIT/1 and waiting for the decision.");
    expect(ruleMove(rule, matter("d1"))).toBeNull();
  });

  it("an unset committee or act today blocks only where nothing speaks for the version: it never undoes a decision", () => {
    const carried = [matter("d1", { record: record("CARRIED", "2026-09-25") })];
    expect(scopeApproval({ ...rule, scopeCommitteeCode: null }, [v1], carried)).toMatchObject({ state: "APPROVED", movedOn: { now: { committeeCode: null }, committeeMoved: true } });
    expect(scopeApproval({ ...rule, scopeCommitteeCode: null }, [v1], [])).toMatchObject({ state: "COMMITTEE_NOT_SET", movedOn: null });
    expect(scopeApproval({ ...rule, scopeCommitteeCode: null }, [{ ...v1, status: "DRAFT" }], carried).state).toBe("COMMITTEE_NOT_SET");
    // A withdrawn matter speaks for nothing, so the unset setting is what is said.
    expect(scopeApproval({ ...rule, scopeAct: null }, [v1], [{ ...carried[0], withdrawn: true }]).state).toBe("ACT_NOT_SET");
    // Tabling anew still needs both set (the guarantee that only the configured act is tabled).
    expect(codes(scopeCitationFault({ ...citation, rule: { ...rule, scopeAct: null } }))).toEqual(["SCOPE_ACT_NOT_SET"]);
  });

  it("whether approval is needed at all is today's rule: an unset or 'no' rule is read as it stands", () => {
    const carried = [matter("d1", { record: record("CARRIED", "2026-09-25") })];
    expect(scopeApproval({ ...rule, scopeApprovalRequired: null }, [v1], carried).state).toBe("RULE_NOT_SET");
    expect(scopeApproval({ ...rule, scopeApprovalRequired: false }, [v1], carried).state).toBe("NOT_REQUIRED");
  });

  it("countsFor asks only whether the matter still speaks, never today's rule", () => {
    expect(countsFor(matter("d1", { committeeCode: "BOARD", act: "R" }))).toBe(true);
    expect(countsFor(matter("d1", { withdrawn: true }))).toBe(false);
    expect(countsFor(matter("d1", { sittingCancelled: true }))).toBe(false);
    expect(countsFor(matter("d1", { sittingCancelled: true, record: record("CARRIED", "2026-09-25") }))).toBe(true);
  });

  it("the card names the committee that decided it, and the warning names both rules in words", () => {
    const decided = matter("d1", { committeeCode: "BOARD", committeeName: "Board", record: { ...record("CARRIED", "2026-09-25"), committee: "Board" } });
    const a = scopeApproval(rule, [v1], [decided]);
    expect(scopeApprovalLine(a, "Technical Committee", () => "25 Sep 2026")).toBe("Version 1 of the bill: approved by the Board at SIT/1, 25 Sep 2026.");
    const waiting = scopeApproval(rule, [v1], [matter("d1", { committeeCode: "BOARD", committeeName: "Board" })]);
    expect(scopeApprovalLine(waiting, "Technical Committee")).toBe("Version 1 of the bill: tabled at SIT/1, waiting for the Board's decision.");
    expect(scopeRuleMovedNote({ decided: true, tabled: scopeRuleWords("Recommend", "Board")!, now: scopeRuleWords("Approve", "Technical Committee"), sitting: "SIT/1" })).toBe(
      "This matter was tabled under the rule configured then: Recommend by the Board. Configuration now says: Approve by the Technical Committee. The decision stands as it was taken; the rule configured today applies to what is tabled next.",
    );
    expect(scopeRuleMovedNote({ decided: false, tabled: "Recommend by the Board", now: null, sitting: "SIT/1" })).toBe(
      "This matter was tabled under the rule configured then: Recommend by the Board. Configuration now leaves the committee or its act not set. It is decided under the rule it was tabled under. To table the bill under today's rule instead, withdraw it from SIT/1 and table it again.",
    );
    expect(scopeRuleWords(null, "Board")).toBeNull();
  });
});

describe("scope approval of an uploaded bill (SR-09, ruling 13, ADR 0035)", () => {
  const file1 = { id: "fv1", versionNo: 1 };
  const file2 = { id: "fv2", versionNo: 2 };
  const onFile = (id: string, x: Partial<ScopeMatter> = {}) => matter("d-" + id, { bqVersionId: id, ...x });
  it("reads the file's version as it reads a finalised bill: not tabled, then pending, then approved", () => {
    expect(scopeApprovalForFile(rule, file1, true, []).state).toBe("NOT_TABLED");
    expect(scopeApprovalForFile(rule, file1, true, [onFile("fv1")]).state).toBe("PENDING");
    expect(scopeApprovalForFile(rule, file1, true, [onFile("fv1", { record: record("CARRIED", "2026-09-25") })]).state).toBe("APPROVED");
  });
  it("lapses when the file is replaced: an approval of the old version does not speak for the new one, and it says the earlier was approved", () => {
    const approvedOld = [onFile("fv1", { record: record("CARRIED", "2026-09-25") })];
    const a = scopeApprovalForFile(rule, file2, true, approvedOld, [file1, file2]);
    expect(a.state).toBe("NOT_TABLED");
    expect(a.earlierApprovedVersionNo).toBe(1);
    expect(scopeClears(a.state)).toBe(false);
    // The new version is approved in its own right.
    expect(scopeApprovalForFile(rule, file2, true, [...approvedOld, onFile("fv2", { record: record("CARRIED", "2026-10-01") })]).state).toBe("APPROVED");
  });
  it("with no file yet it says so, and with no bill part to upload it to it says that instead (cleared in configuration, never for ever)", () => {
    expect(scopeApprovalForFile(rule, null, true, []).state).toBe("NO_FINALISED_BILL");
    expect(scopeApprovalForFile(rule, null, false, []).state).toBe("NO_BILL_PART");
    expect(scopeClears("NO_BILL_PART")).toBe(false);
    // A method that does not ask for scope approval is not blocked by the missing part, and an unset rule is still said first.
    expect(scopeApprovalForFile({ scopeApprovalRequired: false, scopeCommitteeCode: null, scopeAct: null }, null, false, []).state).toBe("NOT_REQUIRED");
    expect(scopeApprovalForFile({ scopeApprovalRequired: null, scopeCommitteeCode: null, scopeAct: null }, null, false, []).state).toBe("RULE_NOT_SET");
  });
  it("is worded for a file, and the matter is named for one", () => {
    expect(scopeApprovalLine(scopeApprovalForFile(rule, file1, true, []), "Technical Committee", undefined, true)).toMatch(/Version 1 of the uploaded bill of quantities: not tabled yet/);
    expect(scopeApprovalLine(scopeApprovalForFile(rule, null, true, []), null, undefined, true)).toMatch(/no bill of quantities file is uploaded yet. Upload it under Tender documents/);
    expect(scopeApprovalLine(scopeApprovalForFile(rule, null, false, []), null, undefined, true)).toMatch(/no bill of quantities part to upload the file to/);
    expect(SCOPE_STATE_BADGE.NO_BILL_PART.tone).toBe("warn");
    expect(SCOPE_STATE_TEXT.NO_BILL_PART).toMatch(/Configuration, Tender documents/);
    expect(scopeFileMatterSubject("Filter renewal", 2)).toBe("Filter renewal, uploaded bill of quantities, version 2");
  });
});
