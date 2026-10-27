import { describe, expect, it } from "vitest";

import { defectActFaults, defectState, frozenLinesOf, onDraftCpc, overdue, reportDefectFaults, withdrawnCount } from "./defects";
import type { DefectEventFact, DefectFact } from "./types";

/** ADR 0047 D1; plan closeout-plan.md §4.3, §6.3: a line's state is derived from its events only. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
let n = 0;
const ev = (kind: DefectEventFact["kind"], note = "", on = "2026-10-05"): DefectEventFact => ({ kind, on, note, at: `2026-10-05T00:00:${String(n++).padStart(2, "0")}Z` });
const line = (events: DefectEventFact[], dueOn = "2026-10-10"): DefectFact => ({ id: "d1", source: "PRACTICAL_COMPLETION", description: "Leak", location: "Roof", dueOn, events });

describe("defectState", () => {
  it("open, reported, then returned reads open with the note; made good is final; withdrawn ends it with its reason", () => {
    expect(defectState([]).state).toBe("OPEN");
    expect(defectState([ev("REPORTED_RECTIFIED")]).state).toBe("REPORTED_RECTIFIED");
    expect(defectState([ev("REPORTED_RECTIFIED"), ev("RETURNED", "Still leaks")])).toMatchObject({ state: "OPEN", returnNote: "Still leaks" });
    expect(defectState([ev("REPORTED_RECTIFIED"), ev("MADE_GOOD", "", "2026-10-06"), ev("RETURNED", "late")])).toMatchObject({ state: "MADE_GOOD", closedOn: "2026-10-06" });
    expect(defectState([ev("WITHDRAWN", "Contractor gone, to be rectified by others")])).toMatchObject({ state: "WITHDRAWN", withdrawnReason: "Contractor gone, to be rectified by others" });
  });
  it("reads the events in the order recorded, whatever order they are given", () => {
    const a = ev("REPORTED_RECTIFIED");
    const b = ev("RETURNED", "No");
    expect(defectState([b, a]).state).toBe("OPEN");
  });
});

describe("defectActFaults", () => {
  const t = { note: "", on: "2026-10-05", today: "2026-10-05" };
  it("NOT_OPEN: a reported line is not reported again; only a reported line is returned, with a note; a closed line takes nothing", () => {
    expect(defectActFaults("REPORT_RECTIFIED", "OPEN", t)).toEqual([]);
    expect(codes(defectActFaults("REPORT_RECTIFIED", "REPORTED_RECTIFIED", t))).toEqual(["NOT_OPEN"]);
    expect(codes(defectActFaults("RETURN", "OPEN", { ...t, note: "x" }))).toEqual(["NOT_REPORTED"]);
    expect(codes(defectActFaults("RETURN", "REPORTED_RECTIFIED", t))).toEqual(["RETURN_NOTE_REQUIRED"]);
    expect(defectActFaults("ACCEPT", "OPEN", t)).toEqual([]);
    expect(defectActFaults("ACCEPT", "REPORTED_RECTIFIED", t)).toEqual([]);
    expect(codes(defectActFaults("ACCEPT", "MADE_GOOD", t))).toEqual(["LINE_CLOSED"]);
    expect(codes(defectActFaults("WITHDRAW", "OPEN", t))).toEqual(["WITHDRAW_REASON_REQUIRED"]);
    expect(codes(defectActFaults("WITHDRAW", "WITHDRAWN", { ...t, note: "x" }))).toEqual(["LINE_CLOSED"]);
    expect(codes(defectActFaults("ACCEPT", "OPEN", { ...t, on: "2026-10-06" }))).toEqual(["DAY_IN_FUTURE"]);
  });
});

describe("overdue", () => {
  it("is past its due day, or the issued schedule's day once there is one, and still open", () => {
    expect(overdue(line([]), "2026-10-11", null)).toBe(true);
    expect(overdue(line([]), "2026-10-10", null)).toBe(false);
    expect(overdue(line([]), "2026-10-11", "2026-12-31")).toBe(false);
    expect(overdue(line([ev("MADE_GOOD")]), "2026-10-11", null)).toBe(false);
  });
});

describe("reporting a line during the period (FR-CMP-011)", () => {
  const ok = { dlpApplies: true, cpcIssued: true, scheduleIssued: false, description: "Leak", dueOn: "2026-11-01", observedOn: "2026-09-20", completionDate: "2025-10-01", dlpEndExclusive: "2026-10-01", today: "2026-10-25" };
  it("is refused before the CPC, with no DLP, and once the schedule is issued", () => {
    expect(reportDefectFaults(ok)).toEqual([]);
    expect(codes(reportDefectFaults({ ...ok, cpcIssued: false }))).toEqual(["CPC_NOT_ISSUED"]);
    expect(codes(reportDefectFaults({ ...ok, dlpApplies: false }))).toEqual(["DLP_NOT_APPLICABLE"]);
    expect(codes(reportDefectFaults({ ...ok, scheduleIssued: true }))).toEqual(["SCHEDULE_ISSUED"]);
  });
  // Ruling 3 (code review of close-out stage B, P11): observed during the period, reported until the schedule issues.
  it("needs the day it was observed, within the period and not after today; a report after the period's end is allowed while no schedule is issued", () => {
    expect(codes(reportDefectFaults({ ...ok, observedOn: null }))).toEqual(["OBSERVED_REQUIRED"]);
    expect(codes(reportDefectFaults({ ...ok, observedOn: "2025-09-30" }))).toEqual(["OBSERVED_OUTSIDE_DLP"]);
    expect(codes(reportDefectFaults({ ...ok, observedOn: "2026-10-01" }))).toEqual(["OBSERVED_OUTSIDE_DLP"]);
    expect(reportDefectFaults({ ...ok, observedOn: "2026-09-30" })).toEqual([]);
    expect(reportDefectFaults({ ...ok, observedOn: "2025-10-01" })).toEqual([]);
    expect(codes(reportDefectFaults({ ...ok, observedOn: "2026-10-26" }))).toEqual(["DAY_IN_FUTURE"]);
  });
});

describe("frozen lines (ruling 4)", () => {
  it("keep each line's end state, a withdrawn one its reason, and count the withdrawn", () => {
    const lines = frozenLinesOf([line([ev("MADE_GOOD")]), { ...line([ev("WITHDRAWN", "By others")]), id: "d2" }]);
    expect(lines.map((l) => [l.id, l.state, l.reason])).toEqual([
      ["d1", "MADE_GOOD", null],
      ["d2", "WITHDRAWN", "By others"],
    ]);
    expect(withdrawnCount(lines)).toBe(1);
  });
});

// F6 (code review of close-out stage B).
describe("a line on a CPC not yet issued", () => {
  it("is not acted on, and onDraftCpc reads it from the line and the CPC", () => {
    expect(defectActFaults("ACCEPT", "OPEN", { note: "", on: "2026-10-01", today: "2026-10-02", onDraftCpc: true }).map((f) => f.code)).toEqual(["CPC_NOT_ISSUED"]);
    expect(onDraftCpc({ practicalCompletionId: "pc" }, "DRAFT")).toBe(true);
    expect(onDraftCpc({ practicalCompletionId: "pc" }, "ISSUED")).toBe(false);
    expect(onDraftCpc({ practicalCompletionId: null }, null)).toBe(false);
  });
});
