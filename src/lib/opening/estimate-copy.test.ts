import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { copyCheck, copyFindingFault, explanationFaults } from "./estimate-copy";
import { finaliseFaults } from "./finalise";
import { CHECKLIST, open } from "./fixture";

/**
 * C-1: the paper estimate is compared only in the finalising transaction; a MISMATCH never refuses
 * finalising, it is a finding that holds evaluation and the award until explained; a refused
 * finalise never depends on the typed figure.
 */

describe("the comparison", () => {
  it("equal → MATCH; differ → MISMATCH; not in the box → NOT_IN_BOX", () => {
    expect(copyCheck({ figure: parseSen("420000.00") }, parseSen("420000.00"))).toBe("MATCH");
    expect(copyCheck({ figure: parseSen("420000.01") }, parseSen("420000.00"))).toBe("MISMATCH");
    expect(copyCheck({ notInBox: true }, parseSen("420000.00"))).toBe("NOT_IN_BOX");
  });
  it("a MISMATCH or NOT_IN_BOX unexplained holds evaluation and the award; explained, it does not; MATCH never", () => {
    expect(copyFindingFault("MISMATCH", false)?.code).toBe("ESTIMATE_COPY_UNEXPLAINED");
    expect(copyFindingFault("NOT_IN_BOX", false)?.code).toBe("ESTIMATE_COPY_UNEXPLAINED");
    expect(copyFindingFault("MISMATCH", true)).toBeNull();
    expect(copyFindingFault("MATCH", false)).toBeNull();
    expect(copyFindingFault(null, false)).toBeNull();
  });
});

describe("a refused finalise never depends on the typed figure (C-1)", () => {
  it("the finalise faults take only whether the paper was answered: identical for any figure", () => {
    const refused = (paperAnswered: boolean) =>
      finaliseFaults({ state: open(), bids: [{ listingNo: 1, initials: [], unanswered: 0, verdict: null, unpurchased: false }], present: [{ personId: "p1", name: "A" }], signed: [], pages: null, checklist: CHECKLIST, withdrawals: [], unopened: 0, admittedOpened: true, completenessEliminates: false, unpurchased: "REPORT", invitedReading: "PURCHASERS", estimate: { required: true, lodged: true, paperAnswered }, personActive: true });
    // Two different typed figures are both "answered": the refusal is the same list.
    expect(refused(true)).toEqual(refused(true));
    expect(refused(true).map((f) => f.code)).not.toContain("ESTIMATE_COPY_NOT_ANSWERED");
    expect(refused(false).map((f) => f.code)).toContain("ESTIMATE_COPY_NOT_ANSWERED");
    expect(JSON.stringify(refused(true))).not.toMatch(/420000/);
  });
});

describe("the explanation (append-only)", () => {
  const f = (x: Partial<Parameters<typeof explanationFaults>[0]>) => explanationFaults({ finalised: true, check: "MISMATCH", explained: false, text: "The paper copy was version 1; version 2 was lodged after an addendum.", personActive: true, ...x }).map((y) => y.code);
  it("recorded once, after finalising, for a finding", () => {
    expect(f({})).toEqual([]);
    expect(f({ explained: true })).toEqual(["ALREADY_EXPLAINED"]);
    expect(f({ check: "MATCH" })).toEqual(["NOTHING_TO_EXPLAIN"]);
    expect(f({ finalised: false })).toEqual(["NOT_FINALISED"]);
    expect(f({ text: "" })).toEqual(["EXPLANATION_REQUIRED"]);
  });
});
