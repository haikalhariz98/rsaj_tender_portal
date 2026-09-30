import { describe, expect, it } from "vitest";

import { bandConsistencyFaults, matrixPolicyFaults, termsBandBoundaryFault } from "./boundary";
import { SPEC_MATRIX, SPEC_TERMS } from "./fixture";

const p = { quotationFloor: "15000", tenderFloor: "300000", boundaryValue: "300000", boundaryProvenance: "ASSUMED" as const, boundarySource: "" };
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("an issue's thresholds, on save (rulings R-7, R-8)", () => {
  it("the tender floor must be the boundary: a hard reject", () => {
    expect(matrixPolicyFaults(p)).toEqual([]);
    const f = matrixPolicyFaults({ ...p, boundaryValue: "300000.01" });
    expect(f).toEqual([{ code: "TENDER_FLOOR_NOT_BOUNDARY", level: "block", field: "boundaryValue" }]);
  });
  it("the tender floor must be above the quotation floor", () => {
    expect(codes(matrixPolicyFaults({ ...p, tenderFloor: "15000", boundaryValue: "15000" }))).toEqual(["TENDER_NOT_ABOVE_QUOTATION"]);
  });
  it("a ruling recorded as stated must cite its source", () => {
    expect(codes(matrixPolicyFaults({ ...p, boundaryProvenance: "STATED" }))).toEqual(["BOUNDARY_SOURCE_REQUIRED"]);
    expect(matrixPolicyFaults({ ...p, boundaryProvenance: "STATED", boundarySource: "Quality Instruction 1/2026" })).toEqual([]);
  });
});

describe("where the families could disagree at the boundary", () => {
  it("a consistent issue reports nothing", () => {
    expect(bandConsistencyFaults(SPEC_MATRIX, SPEC_TERMS)).toEqual([]);
  });
  it("an appointment edge on the boundary that is undecided, or that ignores the switch, is reported", () => {
    const rules = SPEC_MATRIX.rules.map((r) =>
      r.ruleKey === "APP_TENDER" ? { ...r, followsBoundarySwitch: null } : r.ruleKey === "DA_3M" ? { ...r, followsBoundarySwitch: false } : r,
    );
    expect(codes(bandConsistencyFaults({ ...SPEC_MATRIX, rules }, []))).toEqual(["REGIME_RULE_DISAGREE", "BOUNDARY_UNDECIDED"]);
  });
  it("requisition rules are not the method family and are not reported", () => {
    expect(SPEC_MATRIX.rules.some((r) => r.domain === "requisition" && r.followsBoundarySwitch === false && r.maxValue === 300_000)).toBe(true);
    expect(bandConsistencyFaults(SPEC_MATRIX, [])).toEqual([]);
  });
  it("a terms band edge on the boundary must decide", () => {
    const edge = { ...SPEC_TERMS[0], maxValue: 300_000, followsBoundarySwitch: null };
    expect(codes(bandConsistencyFaults(SPEC_MATRIX, [edge]))).toEqual(["BOUNDARY_UNDECIDED"]);
    expect(termsBandBoundaryFault(edge, SPEC_MATRIX.policy)).toBe("BOUNDARY_UNDECIDED");
    expect(termsBandBoundaryFault({ ...edge, followsBoundarySwitch: true }, SPEC_MATRIX.policy)).toBeNull();
  });
  it("legacy rows whose boundary is not the tender floor are reported", () => {
    expect(codes(bandConsistencyFaults({ ...SPEC_MATRIX, policy: { ...SPEC_MATRIX.policy, tenderFloor: 250_000 } }, []))).toEqual(["SWITCH_GOVERNS_NO_REGIME"]);
  });
});
