import { describe, expect, it } from "vitest";

import { cpcLineFaults, cpcRaiseFaults, dlpOf, ladWindowFaults, type CpcRaiseInput } from "./completion";

/** Plan closeout-plan.md §4.2, §6.3, CO-5; rulings 5 and 15. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const ok: CpcRaiseInput = { live: null, completionDate: "2026-09-25", possessionDate: "2025-09-01", inspectedOn: "2026-09-26", testReasons: "Works complete save minor defects listed.", today: "2026-10-01", dlp: { applies: true, months: 12 }, sectional: false, variant: "STANDARD", ladWindows: [] };

describe("dlpOf (CO-5)", () => {
  it("completion 2026-09-25 with 12 months (fixture) ends, exclusive, 2026-09-25 plus 12 months", () => {
    expect(dlpOf("2026-09-25", { applies: true, months: 12 })).toEqual({ applies: true, start: "2026-09-25", endExclusive: "2027-09-25" });
    expect(dlpOf("2027-01-31", { applies: true, months: 1 })).toEqual({ applies: true, start: "2027-01-31", endExclusive: "2027-02-28" });
  });
  it("applies false has no dates; null, or applies with no months, is not set", () => {
    expect(dlpOf("2026-09-25", { applies: false, months: null })).toEqual({ applies: false });
    expect(dlpOf("2026-09-25", { applies: null, months: 12 })).toEqual({ applies: null });
    expect(dlpOf("2026-09-25", { applies: true, months: null })).toEqual({ applies: null });
  });
});

describe("cpcRaiseFaults", () => {
  it("passes", () => expect(cpcRaiseFaults(ok)).toEqual([]));
  it("refuses each by name", () => {
    expect(codes(cpcRaiseFaults({ ...ok, live: { number: "CPC/1" } }))).toEqual(["CPC_LIVE"]);
    expect(codes(cpcRaiseFaults({ ...ok, sectional: true }))).toEqual(["SECTIONAL_NOT_BUILT"]);
    expect(codes(cpcRaiseFaults({ ...ok, variant: "IT" }))).toEqual(["IT_VARIANT_NOT_BUILT"]);
    // Code review of close-out stage B (Consider): an unset variant warns, never read silently as the standard one.
    expect(cpcRaiseFaults({ ...ok, variant: null }).map((f) => [f.code, f.level])).toEqual([["VARIANT_NOT_SET", "warn"]]);
    expect(codes(cpcRaiseFaults({ ...ok, dlp: { applies: null, months: null } }))).toEqual(["DLP_NOT_SET"]);
    expect(cpcRaiseFaults({ ...ok, dlp: { applies: false, months: null } })).toEqual([]);
    expect(codes(cpcRaiseFaults({ ...ok, completionDate: "2026-10-02" }))).toEqual(["COMPLETION_IN_FUTURE"]);
    expect(codes(cpcRaiseFaults({ ...ok, completionDate: "2025-08-31" }))).toEqual(["BEFORE_POSSESSION"]);
    expect(codes(cpcRaiseFaults({ ...ok, inspectedOn: "2026-10-02" }))).toEqual(["INSPECTION_IN_FUTURE"]);
    expect(codes(cpcRaiseFaults({ ...ok, testReasons: " " }))).toEqual(["TEST_REASONS_REQUIRED"]);
    expect(codes(cpcRaiseFaults({ ...ok, ladWindows: [{ until: null }] }))).toEqual(["LAD_WINDOW_OPEN"]);
    expect(codes(cpcRaiseFaults({ ...ok, ladWindows: [{ until: "2026-09-20" }] }))).toEqual(["LAD_WINDOW_MISMATCH"]);
    expect(cpcRaiseFaults({ ...ok, ladWindows: [{ until: "2026-09-25" }] })).toEqual([]);
  });
  it("the window is judged again at issue", () => {
    expect(codes(ladWindowFaults("2026-09-25", [{ until: null }, { until: "2026-09-25" }]))).toEqual(["LAD_WINDOW_OPEN"]);
  });
});

describe("a CPC line (FR-CMP-007)", () => {
  const line = { certificateStatus: "DRAFT", description: "Cracked tile, block B", dueOn: "2026-10-30", completionDate: "2026-09-25" };
  it("is added only to a draft, with what it is and a due day not before completion", () => {
    expect(cpcLineFaults(line)).toEqual([]);
    expect(codes(cpcLineFaults({ ...line, certificateStatus: "SIGNING" }))).toEqual(["CPC_NOT_DRAFT"]);
    expect(codes(cpcLineFaults({ ...line, description: "", dueOn: null }))).toEqual(["DESCRIPTION_REQUIRED", "DUE_REQUIRED"]);
    expect(codes(cpcLineFaults({ ...line, dueOn: "2026-09-24" }))).toEqual(["DUE_BEFORE_COMPLETION"]);
  });
});

describe("a CPC line's length (WR-6)", () => {
  const line = { certificateStatus: "DRAFT", description: "x", dueOn: "2026-10-30", completionDate: "2026-09-25" };
  it("is refused at 2,001 characters, not at 2,000", () => {
    expect(cpcLineFaults({ ...line, description: "x".repeat(2000) })).toEqual([]);
    expect(cpcLineFaults({ ...line, description: "x".repeat(2001) }).map((f) => f.code)).toEqual(["DESCRIPTION_TOO_LONG"]);
  });
});
