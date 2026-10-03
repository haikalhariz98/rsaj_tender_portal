import { describe, expect, it } from "vitest";

import { replacementFaults } from "@/lib/lad/non-completion";
import { parseSen as s } from "@/lib/money";

import { assembleInterim } from "./assemble";
import { openingClosed, openingReconciles } from "./opening";

/// Code review run 2 residuals SHOULD 1, 2, 3.
describe("SHOULD 3 / BD-613-50: the opening position closes once a certificate not void rests on it", () => {
  it("raise, void: still open (a voided draft rests on nothing)", () => {
    expect(openingClosed([])).toBe(false);
    expect(openingClosed([{ certificateStatus: null }])).toBe(false);
    expect(openingClosed([{ certificateStatus: "VOID" }])).toBe(false);
  });
  it("raise (draft, routing, signing) or issue: closed", () => {
    for (const st of ["DRAFT", "IN_ROUTING", "SIGNING", "ISSUED"]) expect(openingClosed([{ certificateStatus: "VOID" }, { certificateStatus: st }])).toBe(true);
  });
});

describe("SHOULD 2: a decision is not replaced while a valuation is in progress", () => {
  it("refused, naming the valuation", () => {
    expect(replacementFaults({ live: { id: "a", replacesId: null, certificateStatus: "ISSUED" }, replacesId: "a", reason: "r", valuationInProgress: "interim valuation of 03 Oct 2026" })).toEqual([{ code: "DECISION_VALUATION_IN_PROGRESS", level: "block", data: { valuation: "interim valuation of 03 Oct 2026" } }]);
    expect(replacementFaults({ live: { id: "a", replacesId: null, certificateStatus: "ISSUED" }, replacesId: "a", reason: "r", valuationInProgress: null })).toEqual([]);
  });
});

describe("SHOULD 1: an opening position that does not reconcile is said, on later certificates while assumed", () => {
  it("the warning and the line on the certificate", async () => {
    const r = openingReconciles({ grossToDate: s("100000.00"), previouslyCertified: s("90000.00"), retention: { MAIN: s("10000.00"), NSC: 0n, NS: 0n }, released: { MAIN: s("5000.00"), NSC: 0n, NS: 0n } });
    expect(r[0]).toMatchObject({ code: "OPENING_NOT_RECONCILED", level: "warn", data: { expected: "9500000", entered: "9000000" } });
    const { INPUT_FOR_TESTS } = await import("./opening-residual.fixture");
    const a = assembleInterim({ ...INPUT_FOR_TESTS, openingUnreconciled: { code: "OPENING_NOT_RECONCILED_ASSUMED", level: "warn", data: r[0].data } });
    expect(a.warnings.map((w) => w.code)).toContain("OPENING_NOT_RECONCILED_ASSUMED");
    expect(a.result.snapshot!.lines.find((l) => l.key === "openingNote")?.value).toMatch(/does not reconcile/);
    expect(a.faults).toEqual([]);
  });
});
