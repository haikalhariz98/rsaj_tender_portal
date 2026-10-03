import { describe, expect, it } from "vitest";

import { decideFaults, openRevision, pointFaults, programmeInForce, scrutinyFaults, submitFaults, type RevisionFacts } from "./programme";

/** FR-SUP-006, 012: submitted, scrutinised, then approved or returned; never approved without its scrutiny. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const rev = (x: Partial<RevisionFacts> = {}): RevisionFacts => ({ revision: 1, submittedOn: "2026-10-01", scrutinisedOn: null, reasonable: null, decision: null, decidedOn: null, ...x });

describe("its points", () => {
  it("at least one; days ascending; 0–100; never falling; not before possession", () => {
    expect(codes(pointFaults([], null))).toEqual(["NO_POINTS"]);
    expect(pointFaults([{ day: "2026-10-01", plannedPct: "0" }, { day: "2026-11-01", plannedPct: "45.5" }, { day: "2026-12-01", plannedPct: "100" }], "2026-10-01")).toEqual([]);
    expect(codes(pointFaults([{ day: "2026-10-01", plannedPct: "101" }], null))).toEqual(["POINT_NOT_A_PERCENT"]);
    expect(codes(pointFaults([{ day: "2026-10-02", plannedPct: "1" }, { day: "2026-10-02", plannedPct: "2" }], null))).toEqual(["POINT_DAYS_NOT_ASCENDING"]);
    expect(codes(pointFaults([{ day: "2026-10-02", plannedPct: "10" }, { day: "2026-10-03", plannedPct: "9.9999" }], null))).toEqual(["POINT_PCT_FALLS"]);
    expect(codes(pointFaults([{ day: "2026-09-30", plannedPct: "0" }], "2026-10-01"))).toEqual(["POINT_BEFORE_POSSESSION"]);
  });
});

describe("submission, scrutiny and decision", () => {
  it("submitted once executed, one revision open at a time", () => {
    expect(submitFaults({ executed: true, submittedOn: "2026-10-01", today: "2026-10-01", openRevision: null })).toEqual([]);
    expect(codes(submitFaults({ executed: false, submittedOn: "2026-10-02", today: "2026-10-01", openRevision: 1 }))).toEqual(["NOT_EXECUTED", "FUTURE_DATE", "OPEN_REVISION"]);
  });
  it("scrutiny answers whether it is reasonable; not reasonable says why", () => {
    const s = { on: "2026-10-02", today: "2026-10-02", reasonable: true as boolean | null, note: "" };
    expect(scrutinyFaults(rev(), s)).toEqual([]);
    expect(codes(scrutinyFaults(rev(), { ...s, reasonable: null }))).toEqual(["ANSWER_REQUIRED"]);
    expect(codes(scrutinyFaults(rev(), { ...s, reasonable: false }))).toEqual(["NOTE_REQUIRED"]);
    expect(codes(scrutinyFaults(rev({ scrutinisedOn: "2026-10-02" }), s))).toEqual(["ALREADY_SCRUTINISED"]);
    expect(codes(scrutinyFaults(rev(), { ...s, on: "2026-09-30" }))).toEqual(["BEFORE_SUBMITTED"]);
  });
  it("never approved without its scrutiny, nor when found not reasonable, nor without points", () => {
    const d = { decision: "APPROVED" as const, on: "2026-10-03", today: "2026-10-03", note: "", points: 3 };
    expect(codes(decideFaults(rev(), d))).toEqual(["NOT_SCRUTINISED"]);
    expect(codes(decideFaults(rev({ scrutinisedOn: "2026-10-02", reasonable: false }), d))).toEqual(["FOUND_UNREASONABLE"]);
    expect(codes(decideFaults(rev({ scrutinisedOn: "2026-10-02", reasonable: true }), { ...d, points: 0 }))).toEqual(["NO_POINTS"]);
    expect(decideFaults(rev({ scrutinisedOn: "2026-10-02", reasonable: true }), d)).toEqual([]);
  });
  it("returned for revision with the reason (the B4 exit), whatever the scrutiny", () => {
    const d = { decision: "RETURNED" as const, on: "2026-10-03", today: "2026-10-03", note: "", points: 0 };
    expect(codes(decideFaults(rev(), d))).toEqual(["REASON_REQUIRED"]);
    expect(decideFaults(rev(), { ...d, note: "Commencement too late for the concrete works." })).toEqual([]);
  });
  it("the programme in force is the latest approved revision; a returned one never replaces it", () => {
    const rs = [rev({ revision: 1, decision: "APPROVED", decidedOn: "2026-10-03", scrutinisedOn: "2026-10-02" }), rev({ revision: 2, decision: "RETURNED", decidedOn: "2026-11-03" }), rev({ revision: 3 })];
    expect(programmeInForce(rs, "2026-12-01")?.revision).toBe(1);
    expect(programmeInForce(rs, "2026-10-02")).toBeNull();
    expect(openRevision(rs)?.revision).toBe(3);
  });
});
