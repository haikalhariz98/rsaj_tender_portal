import { describe, expect, it } from "vitest";

import { cmgdRaiseFaults, cmgdSnapshotOf, type CmgdRaiseInput } from "./making-good";

/** FR-CMP-015, 018; plan closeout-plan.md §4.4, §6.3; rulings 4 and 6. */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const ok: CmgdRaiseInput = { cpcIssued: true, dlp: { applies: true, start: "2025-10-01", endExclusive: "2026-10-01" }, today: "2026-10-20", open: 0, live: null, madeGoodOn: "2026-10-15", finalInspectionOn: "2026-10-18" };

describe("cmgdRaiseFaults", () => {
  it("DEFECTS_OPEN counts every line neither made good nor withdrawn (a reported line not yet accepted counts)", () => {
    expect(cmgdRaiseFaults(ok)).toEqual([]);
    expect(cmgdRaiseFaults({ ...ok, open: 2 })).toEqual([{ code: "DEFECTS_OPEN", level: "block", data: { n: 2 } }]);
  });
  it("refuses each by name", () => {
    expect(codes(cmgdRaiseFaults({ ...ok, cpcIssued: false }))).toEqual(["CPC_NOT_ISSUED"]);
    expect(codes(cmgdRaiseFaults({ ...ok, dlp: { applies: false } }))).toEqual(["DLP_NOT_APPLICABLE"]);
    expect(codes(cmgdRaiseFaults({ ...ok, today: "2026-09-30", madeGoodOn: "2026-09-29", finalInspectionOn: "2026-09-29" }))).toEqual(["DLP_NOT_ENDED"]);
    expect(codes(cmgdRaiseFaults({ ...ok, live: { number: "CMGD/1" } }))).toEqual(["CMGD_LIVE"]);
    expect(codes(cmgdRaiseFaults({ ...ok, finalInspectionOn: "2026-10-21" }))).toEqual(["DAY_IN_FUTURE"]);
  });
});

describe("cmgdSnapshotOf (ruling 6, FR-CMP-015)", () => {
  it("carries the performance bond's value, the retention balance and each security's number", () => {
    const snap = cmgdSnapshotOf({ securities: [{ kind: "PERFORMANCE_BOND", form: "BANK_GUARANTEE", reference: "BG-77", value: 2500000n }, { kind: "RETENTION_BOND", form: "CASH", reference: "OR-12", value: 100000n }], retentionBalance: 1234567n });
    expect(snap.performanceBond).toEqual({ value: "25000.00", reference: "BG-77" });
    expect(snap.retentionBalance).toBe("12345.67");
    expect(snap.securities.map((s) => s.reference)).toEqual(["BG-77", "OR-12"]);
  });
});
