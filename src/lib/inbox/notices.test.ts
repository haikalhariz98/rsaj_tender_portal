import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STAFF_NOTICE_KINDS, STAFF_NOTICE_KIND_LABEL } from "./kinds";
import { caseClockNotices, delegationReceivedNotice, holderMarkedAbsentNotices, matterNotCarriedMemo, routeRecalledNotices, stepEscalatedNotices, stepMovedOnAbsenceNotices } from "./notices";

const matter = { label: "REQ-1 · Roof", href: "/approvals", exerciseId: "ex1" };

describe("the notices of Phase 3c", () => {
  it("tells each holder of the office once, and never the person who did the act", () => {
    const n = stepEscalatedNotices({ stepId: "s1", escalationCount: 1, matter, actLabel: "approve", fromOffice: "HoD", toOffice: "FD", whyLabel: "No one was able to act", reason: "away", recipients: ["a", "b", "a", "me"], by: "me", superiorNote: "Reporting line not set: no immediate superior is named." });
    expect(n.map((x) => x.recipientPersonId)).toEqual(["a", "b"]);
    expect(n[0]).toMatchObject({ kind: "STEP_ESCALATED", subjectEntity: "ApprovalStep", subjectId: "s1", occurrence: "1", exerciseId: "ex1", href: "/approvals" });
    expect(n[0]!.body).toContain("Reporting line not set");
  });

  it("keys a second escalation of the same step apart from the first, and a retry to the same key", () => {
    const mk = (count: number) => stepMovedOnAbsenceNotices({ stepId: "s1", escalationCount: count, matter, actLabel: "approve", fromOffice: "HoD", toOffice: "FD", absentName: "Siti", recipients: ["a"], by: null, superiorNote: "" })[0]!;
    expect(mk(1).occurrence).not.toBe(mk(2).occurrence);
    expect(mk(1)).toEqual(mk(1));
  });

  it("carries the exercise a notice concerns, so a restricted exercise's notices can be hidden", () => {
    expect(routeRecalledNotices({ routeId: "r1", matter, recalledBy: "Amir", reason: "wrong request", recipients: ["a"], by: "x" })[0]!.exerciseId).toBe("ex1");
    expect(matterNotCarriedMemo({ decisionId: "d1", matterLabel: "REQ-1", committeeLabel: "Tender Board", outcomeLabel: "Re-clarification", note: "", recipients: ["a"], href: "/committees", exerciseId: null })[0]!.exerciseId).toBeNull();
  });

  it("carries labels and words, never an amount", () => {
    const all = [
      ...stepEscalatedNotices({ stepId: "s1", escalationCount: 1, matter, actLabel: "approve", fromOffice: "HoD", toOffice: "FD", whyLabel: "x", reason: "y", recipients: ["a"], by: null, superiorNote: "z" }),
      ...routeRecalledNotices({ routeId: "r1", matter, recalledBy: "Amir", reason: "wrong", recipients: ["a"], by: null }),
      ...holderMarkedAbsentNotices({ personId: "p", personName: "Siti", at: new Date("2026-10-01T01:00:00Z"), moved: 2, stayed: 1, superiors: ["a"], by: null }),
    ];
    for (const n of all) expect(n.title + n.body).not.toMatch(/RM\s?\d|\d[\d,]{3,}\.\d\d/);
  });

  it("does not notify the delegate of a delegation they gave themselves, and tells a changed delegation again", () => {
    const base = { delegationId: "d1", toPersonId: "b", fromName: "Amir", officeLabel: "Head of Department", periodWords: "until 2026-10-20 (not included)", whatWords: "the whole office", by: "amir" };
    expect(delegationReceivedNotice({ ...base, termsKey: "k1", by: "b" })).toEqual([]);
    expect(delegationReceivedNotice({ ...base, termsKey: "k1" })[0]!.occurrence).not.toBe(delegationReceivedNotice({ ...base, termsKey: "k2" })[0]!.occurrence);
  });

  it("tells the superiors of an absence what moved and what stayed, once per absence", () => {
    const a = holderMarkedAbsentNotices({ personId: "p", personName: "Siti", at: new Date("2026-10-01T01:00:00Z"), moved: 2, stayed: 1, superiors: ["boss"], by: "admin" })[0]!;
    expect(a.body).toContain("2 pending steps moved up");
    expect(a.body).toContain("1 could not be moved");
    const b = holderMarkedAbsentNotices({ personId: "p", personName: "Siti", at: new Date("2026-10-02T01:00:00Z"), moved: 0, stayed: 0, superiors: ["boss"], by: "admin" })[0]!;
    expect(b.occurrence).not.toBe(a.occurrence);
    expect(b.body).toContain("No pending step was waiting");
  });
});

describe("the closed list of kinds", () => {
  it("has a label for every kind, and the database CHECK names exactly these kinds", () => {
    for (const k of STAFF_NOTICE_KINDS) expect(STAFF_NOTICE_KIND_LABEL[k], k).toBeTruthy();
    // Changed for Phase 4e: the CHECK was replaced whole by the My Projects migration, which adds CONTRACTOR_SUBMISSION; the latest definition is the one held to the list.
    // Changed for Phase 5a (ruling item 9): replaced whole again by the back-dating confirmation's migration, which adds BACKDATE_TO_CONFIRM.
    // Changed for C13 (design note 0004, AC-20): replaced whole again by the migration that adds INDENT_EXPIRED and COMMENCEMENT_LATE.
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261110000000_staff_notices_indent_and_commencement/migration.sql"), "utf8");
    const check = /StaffNotice_kind_known" CHECK \(\("kind" IN \(([^)]*)\)\)/.exec(sql);
    expect(check, "the CHECK is in the migration").toBeTruthy();
    const named = [...check![1]!.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
    expect([...named].sort()).toEqual([...STAFF_NOTICE_KINDS].sort());
  });
});

describe("the clock notices of an award (FR-AWD-006, FR-AWD-009; C13)", () => {
  const base = { awardId: "a1", awardLabel: "AWD-1", day: "2026-10-01", dayWords: "1 Oct 2026", exerciseId: "ex1", href: "/projects/a1" };
  // AC-42: the recipients come from `clockPlan` (the notification rule's offices and the requester), not from unit heads; here the notices are written to whoever is given.
  it("writes one notice to each recipient given, and keys it on the day", () => {
    const recipients = ["h", "r"];
    const n = caseClockNotices({ ...base, kind: "INDENT_EXPIRED", recipients });
    expect(n.map((x) => x.recipientPersonId)).toEqual(["h", "r"]);
    expect(n[0]).toMatchObject({ kind: "INDENT_EXPIRED", subjectEntity: "Award", subjectId: "a1", occurrence: "2026-10-01", exerciseId: "ex1" });
    expect(caseClockNotices({ ...base, kind: "COMMENCEMENT_LATE", recipients })[0]!.kind).toBe("COMMENCEMENT_LATE");
  });
  it("writes none when nobody is to be told", () => {
    expect(caseClockNotices({ ...base, kind: "INDENT_EXPIRED", recipients: [] })).toEqual([]);
  });
});
