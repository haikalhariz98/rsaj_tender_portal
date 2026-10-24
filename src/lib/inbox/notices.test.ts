import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { STAFF_NOTICE_KINDS, STAFF_NOTICE_KIND_LABEL } from "./kinds";
import { awardReturnNotices, caseClockNotices, delegationReceivedNotice, holderMarkedAbsentNotices, matterNotCarriedMemo, projectDocumentNotices, routeRecalledNotices, stepEscalatedNotices, stepMovedOnAbsenceNotices } from "./notices";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

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
    // AC-63 N1: the label is a Words pair now, so the assertion reads both languages (a bare truthiness check would pass for an empty pair).
    for (const k of STAFF_NOTICE_KINDS) {
      expect(STAFF_NOTICE_KIND_LABEL[k].en.trim(), k).not.toBe("");
    }
    // Changed for Phase 4e: the CHECK was replaced whole by the My Projects migration, which adds CONTRACTOR_SUBMISSION; the latest definition is the one held to the list.
    // Changed for Phase 5a (ruling item 9): replaced whole again by the back-dating confirmation's migration, which adds BACKDATE_TO_CONFIRM.
    // Changed for C13 (design note 0004, AC-20): replaced whole again by the migration that adds INDENT_EXPIRED and COMMENCEMENT_LATE.
    // Changed for ADR 0042 D6 (PW-13): replaced whole again by the Project workspace's migration, which adds the three PROJECT_DOCUMENT_ kinds.
    // Changed for ADR 0045 D4 (wave V step V1): replaced whole again by the wave V migration, which adds AWARD_RETURN_LODGED and AWARD_QUERY_RAISED.
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261201000100_wave_v_tables/migration.sql"), "utf8");
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

describe("the Project workspace's notices (ADR 0042 D6, PW-13)", () => {
  const base = { by: null, contractLabel: "CON/1 · A Contractor", documentTitle: "Drainage layout", contractorName: "A Contractor", versionLabel: "Version 2", exerciseId: null, href: "/projects/c1/documents/d1" };
  it("a version to approve tells each approver once, never the uploader, and names the version and the title", () => {
    const n = projectDocumentNotices({ ...base, by: "so", target: { kind: "PROJECT_DOCUMENT_TO_APPROVE", subjectEntity: "ProjectDocumentVersion", subjectId: "v2", recipientPersonIds: ["eng", "so", "eng"] } });
    expect(n.map((x) => x.recipientPersonId)).toEqual(["eng"]);
    expect(n[0]).toMatchObject({ kind: "PROJECT_DOCUMENT_TO_APPROVE", subjectEntity: "ProjectDocumentVersion", subjectId: "v2", occurrence: "", exerciseId: null, href: "/projects/c1/documents/d1" });
    expect(n[0]!.title).toBe("Document to approve: Drainage layout");
    expect(n[0]!.body).toBe('CON/1 · A Contractor: Version 2 of "Drainage layout" waits on your approval.');
  });
  it("what the contractor sent and asked for names the contractor, and tells every S.O. once", () => {
    const sent = projectDocumentNotices({ ...base, target: { kind: "PROJECT_DOCUMENT_FROM_CONTRACTOR", subjectEntity: "ProjectDocumentVersion", subjectId: "v1", recipientPersonIds: ["b", "a"] } });
    expect(sent.map((x) => x.recipientPersonId)).toEqual(["a", "b"]);
    expect(sent[0]!.title).toBe("Drainage layout from A Contractor");
    const asked = projectDocumentNotices({ ...base, target: { kind: "PROJECT_DOCUMENT_REQUESTED", subjectEntity: "ProjectDocumentRequest", subjectId: "r1", recipientPersonIds: ["a"] } });
    expect(asked[0]).toMatchObject({ subjectEntity: "ProjectDocumentRequest", subjectId: "r1", title: "A Contractor asks for Drainage layout" });
    expect(asked[0]!.body).not.toContain("Version");
  });
  it("never carries a figure beyond the version's own label", () => {
    for (const kind of ["PROJECT_DOCUMENT_TO_APPROVE", "PROJECT_DOCUMENT_FROM_CONTRACTOR", "PROJECT_DOCUMENT_REQUESTED"] as const) {
      const [n] = projectDocumentNotices({ ...base, versionLabel: "Version 1", target: { kind, subjectEntity: "ProjectDocumentVersion", subjectId: "v", recipientPersonIds: ["a"] } });
      expect(`${n!.title} ${n!.body}`.replace("Version 1", "").replace("CON/1", ""), kind).not.toMatch(/\d/);
    }
  });
});

describe("an award return sent online, and a contractor's question (ADR 0045 D3, D4; WV-8)", () => {
  const base = { awardLabel: "AW/1 · Syarikat Maju", contractorName: "Syarikat Maju", exerciseId: "ex1", href: "/projects/aw1?stage=award&tab=return", recipients: ["b", "a", "b"] };

  it("tells each recipient once, keyed on the lodged return or the question, on the exercise", () => {
    const n = awardReturnNotices({ ...base, kind: "AWARD_RETURN_LODGED", subjectId: "r1" });
    expect(n.map((x) => x.recipientPersonId)).toEqual(["a", "b"]);
    expect(n[0]).toMatchObject({ kind: "AWARD_RETURN_LODGED", subjectEntity: "AwardOnlineReturn", subjectId: "r1", occurrence: "", exerciseId: "ex1", href: base.href });
    const q = awardReturnNotices({ ...base, kind: "AWARD_QUERY_RAISED", subjectId: "q1" });
    expect(q[0]).toMatchObject({ kind: "AWARD_QUERY_RAISED", subjectEntity: "AwardQuery", subjectId: "q1" });
    expect(q[0]!.title).toBe("Question from Syarikat Maju: AW/1 · Syarikat Maju");
  });

  it("tells nobody when nobody resolves", () => {
    expect(awardReturnNotices({ ...base, kind: "AWARD_RETURN_LODGED", subjectId: "r1", recipients: [] })).toEqual([]);
  });

  it("names no figure", () => {
    for (const kind of ["AWARD_RETURN_LODGED", "AWARD_QUERY_RAISED"] as const) for (const n of awardReturnNotices({ ...base, kind, subjectId: "x" })) expect(n.title + n.body).not.toMatch(/RM\s?\d|\d[\d,]{3,}\.\d\d/);
  });
});
