import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "@/lib/committee/record";

import { scopeApprovalLine, scopeFaultText, SCOPE_STATE_BADGE, SCOPE_STATE_TEXT } from "./labels";
import { scopeApproval, scopeCitationFault, scopeClears, scopeMatterSubject, type ScopeMatter, type ScopeRule } from "./scope-matter";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const rule: ScopeRule = { scopeApprovalRequired: true, scopeCommitteeCode: "TECH" };
const v1 = { id: "v1", versionNo: 1, status: "FINALISED" as const };
const day = (d: string) => new Date(`${d}T00:00:00Z`);

function record(outcome: DecisionRecord["outcome"], decided: string, notApproved: DecisionRecord["notApproved"] = null): DecisionRecord {
  return {
    committee: "Technical Committee", meetingReference: "SIT/1", meetingDate: day(decided), subject: "Scope", matterRef: null, outcome, decisionDate: day(decided),
    quorum: { required: 3, present: 3, recused: 0 }, votingRule: { rule: "SIMPLE_MAJORITY", provenance: "ASSUMED" }, notApproved, note: "", votes: [],
  };
}
const matter = (id: string, x: Partial<ScopeMatter> = {}): ScopeMatter => ({ id, bqVersionId: "v1", committeeCode: "TECH", withdrawn: false, sittingCancelled: false, tabledAt: day("2026-09-20"), record: null, sittingReference: "SIT/1", ...x });

describe("scopeApproval: three-state rule, never a quiet 'not required' (OD-9)", () => {
  it("an unset rule is RULE_NOT_SET, not NOT_REQUIRED; a method no longer configured says so", () => {
    expect(scopeApproval({ scopeApprovalRequired: null, scopeCommitteeCode: null }, [v1], []).state).toBe("RULE_NOT_SET");
    expect(scopeApproval({ scopeApprovalRequired: null, scopeCommitteeCode: "TECH" }, [v1], [matter("d1", { record: record("CARRIED", "2026-09-25") })]).state).toBe("RULE_NOT_SET");
    expect(scopeApproval(null, [v1], []).state).toBe("METHOD_NOT_CONFIGURED");
  });
  it("NOT_REQUIRED only when the rule says no", () => {
    expect(scopeApproval({ scopeApprovalRequired: false, scopeCommitteeCode: null }, [], []).state).toBe("NOT_REQUIRED");
  });
  it("a yes with no committee is COMMITTEE_NOT_SET", () => {
    expect(scopeApproval({ scopeApprovalRequired: true, scopeCommitteeCode: null }, [v1], []).state).toBe("COMMITTEE_NOT_SET");
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
  it("withdrawn matters and matters before another committee count for nothing", () => {
    expect(scopeApproval(rule, [v1], [matter("d1", { withdrawn: true, record: record("CARRIED", "2026-09-25") })]).state).toBe("NOT_TABLED");
    expect(scopeApproval(rule, [v1], [matter("d1", { committeeCode: "BOARD", record: record("CARRIED", "2026-09-25") })]).state).toBe("NOT_TABLED");
  });
  it("an undecided matter at a cancelled sitting counts as withdrawn: it never blocks for ever, and the version is tabled again", () => {
    const stranded = matter("d1", { sittingCancelled: true });
    expect(scopeApproval(rule, [v1], [stranded]).state).toBe("NOT_TABLED");
    expect(codes(scopeCitationFault({ exercise: { id: "x1", status: "DOCUMENTS_IN_PREPARATION" }, rule, version: { id: "v1", exerciseId: "x1", status: "FINALISED" }, sitting: { committeeCode: "TECH", frozen: false }, matters: [stranded] }))).toEqual([]);
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
    expect(judge({ rule: { scopeApprovalRequired: null, scopeCommitteeCode: "TECH" } })).toEqual(["SCOPE_RULE_NOT_SET"]);
    expect(judge({ rule: { scopeApprovalRequired: false, scopeCommitteeCode: null } })).toEqual(["SCOPE_NOT_REQUIRED"]);
    expect(judge({ rule: { scopeApprovalRequired: true, scopeCommitteeCode: null } })).toEqual(["SCOPE_COMMITTEE_NOT_SET"]);
    expect(judge({ sitting: { committeeCode: "BOARD", frozen: false } })).toEqual(["OTHER_COMMITTEE"]);
    expect(judge({ version: { id: "v1", exerciseId: "x1", status: "DRAFT" } })).toEqual(["VERSION_NOT_FINALISED"]);
    expect(judge({ version: { id: "v1", exerciseId: "x1", status: "SUPERSEDED" } })).toEqual(["VERSION_NOT_FINALISED"]);
    expect(judge({ sitting: { committeeCode: "TECH", frozen: true } })).toEqual(["SITTING_CLOSED"]);
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
      ...scopeCitationFault({ ...base, exercise: { id: "x1", status: "CANCELLED" }, rule: { scopeApprovalRequired: null, scopeCommitteeCode: null }, version: { id: "v1", exerciseId: "x2", status: "DRAFT" }, sitting: { committeeCode: "B", frozen: true } }),
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
    expect(scopeMatterSubject("DEMO/SX/15/2026", 1)).toBe("Scope of DEMO/SX/15/2026: bill of quantities, version 1");
  });
});
