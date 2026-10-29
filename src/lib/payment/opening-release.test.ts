import { describe, expect, it } from "vitest";

import type { BaselineValues } from "@/lib/contract/baseline";
import { parseSen as s, senToDecimalString as d } from "@/lib/money";

import { assembleInterim, type AssembleInput } from "./assemble";
import { openingAsIssued, openingReleaseRow, releaseState } from "./opening";
import { releaseOf } from "./retention";

/**
 * Code review run 2 residual MUST 1 (the reviewer's reproduction, rv/opening-release.ts, made a test): retention
 * released before the system is never clawed back. Opening: gross 100,000.00, retention held 10,000.00, of it
 * 5,000.00 released, previously certified 95,000.00 (= 100,000.00 − (10,000.00 − 5,000.00)).
 *   Same gross next time: held 10,000.00 less released 5,000.00 = 5,000.00; less = 5,000.00 + 95,000.00;
 *     carried forward 0.00; recommended 0.00 (it was −5,000.00).
 *   +20,000.00 of work: held 12,000.00 less 5,000.00 = 7,000.00; less 102,000.00; recommended 18,000.00.
 */
const released = { MAIN: s("5000.00"), NSC: 0n, NS: 0n };
const o = openingAsIssued({ id: "op", lastSequence: 7, grossToDate: s("100000.00"), previouslyCertified: s("95000.00"), retention: { MAIN: s("10000.00"), NSC: 0n, NS: 0n }, released, damagesChargedUntil: null });
const BASE = { contractSum: s("10000000.00"), dateForCompletion: "2030-01-01", retentionApplies: true, retentionPercent: "10", retentionCapPercent: "5", retentionSource: "AWARD", firstInterimMinimum: s("0.00"), subsequentInterimMinimum: s("0.00"), unfixedMaterialsPct: null, sections: [], ladDaily: s("100.00") } as unknown as BaselineValues;
const input = (main: string, withOpeningRelease: boolean): AssembleInput => ({
  valuation: { id: "v", trigger: "VALUATION_DATE", triggerDate: null, valuationDate: "2026-10-01", mainWorks: s(main), jointRecorded: true, materials: [], parties: [], deductions: [] },
  computedOn: "2026-10-02",
  baseline: { version: 1, values: BASE },
  policy: { materialsPct: "75", materialsProvenance: "STATED", preExecutionLimit: 3, preExecutionProvenance: "STATED", remainder: "LARGEST_REMAINDER", remainderProvenance: "ASSUMED" },
  issued: [o],
  foreign: [],
  liveKinds: [],
  adjustments: [],
  releases: withOpeningRelease ? openingReleaseRow(released) : [],
  advances: [],
  decision: null,
  pending: [],
  preExecution: { executed: true, gate: [], withoutReceipt: [], perkesoRecorded: true },
});

describe("the opening position's released retention is a release", () => {
  it("the defect, reproduced: without it the same gross recommends −5,000.00", () => {
    const a = assembleInterim(input("100000.00", false));
    expect(a.faults.map((f) => f.code)).toContain("RECOMMENDED_NEGATIVE");
  });
  it("same gross: recommends 0.00", () => {
    const a = assembleInterim(input("100000.00", true));
    expect(a.sequence).toBe(8);
    expect(d(a.result.figures!.held.net.MAIN)).toBe("5000.00");
    expect(d(a.result.figures!.recommended)).toBe("0.00");
  });
  it("+20,000.00 of work: recommends 18,000.00", () => {
    const a = assembleInterim(input("120000.00", true));
    expect(d(a.result.figures!.held.held.MAIN)).toBe("12000.00");
    expect(d(a.result.figures!.carryForward)).toBe("18000.00");
    expect(d(a.result.figures!.recommended)).toBe("18000.00");
    expect(a.judgedUnder!.released.MAIN).toBe("5000.00");
  });
});

describe("the release act: the opening's release is the first release", () => {
  it("a first release is refused when the opening already released retention; the balance waits for making good", () => {
    const st = releaseState([], released);
    expect(st.already).toEqual({ first: true, balance: false });
    const r = releaseOf({ kind: "RELEASED_FIRST", held: { MAIN: s("10000.00"), NSC: 0n, NS: 0n }, already: st.already, firstReleasePct: "50", asBuiltHandedOver: true, balanceEvent: { state: "NOT_REACHED", event: "MAKING_GOOD", missing: "MAKING_GOOD" }, firstReleased: st.firstReleased });
    expect(r.faults.map((f) => f.code)).toContain("ALREADY_RELEASED");
    const bal = releaseOf({ kind: "RELEASED_BALANCE", held: { MAIN: s("10000.00"), NSC: 0n, NS: 0n }, already: st.already, firstReleasePct: "50", asBuiltHandedOver: true, balanceEvent: { state: "REACHED", event: "MAKING_GOOD" }, firstReleased: st.firstReleased });
    expect(bal.faults).toEqual([]);
    expect(d(bal.amounts!.MAIN)).toBe("5000.00");
  });
  it("no opening release: the first release is open", () => {
    expect(releaseState([], { MAIN: 0n, NSC: 0n, NS: 0n }).already.first).toBe(false);
    expect(releaseState([], null).already.first).toBe(false);
  });
});
