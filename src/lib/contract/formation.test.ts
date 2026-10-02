import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { amendmentFaults, applicableChecks, arithmeticVariance, assemblyFaults, checkFaults, completeFaults, formationFaults, frontLoadingItems, reconciliationFaults } from "./formation";

const S = parseSen;
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("which checks a basis takes (FR-CON-005)", () => {
  it("on a bill: arithmetic, front loading, rate uniformity", () => {
    expect(applicableChecks(true)).toEqual(["ARITHMETIC", "FRONT_LOADING", "RATE_UNIFORMITY"]);
  });
  it("not on a bill: arithmetic, front loading, the schedule's adjustment", () => {
    expect(applicableChecks(false)).toEqual(["ARITHMETIC", "FRONT_LOADING", "SOR_ADJUSTMENT"]);
  });
  it("the basis unanswered: not read as either", () => {
    expect(applicableChecks(null)).toBeNull();
    expect(codes(checkFaults(null, []))).toEqual(["CHECKS_NOT_SET"]);
  });
  it("each check not complete is named", () => {
    const fs = checkFaults(["ARITHMETIC", "FRONT_LOADING", "RATE_UNIFORMITY"], [{ kind: "ARITHMETIC", completedOn: "2026-09-25" }, { kind: "FRONT_LOADING", completedOn: null }]);
    expect(fs.map((f) => f.data?.check)).toEqual(["FRONT_LOADING", "RATE_UNIFORMITY"]);
  });
});

describe("the assembly (FR-CON-003)", () => {
  it("a part cancelled by an alternative needs what it cancels stated", () => {
    expect(assemblyFaults([{ label: "Specification", state: "CANCELLED_BY_ALTERNATIVE", cancelledStatement: "  " }]).map((f) => [f.code, f.data?.part])).toEqual([["CANCELLED_WITHOUT_STATEMENT", "Specification"]]);
    expect(assemblyFaults([{ label: "Specification", state: "CANCELLED_BY_ALTERNATIVE", cancelledStatement: "Clause 4 replaced by the alternative's precast design." }])).toEqual([]);
  });
  it("no parts frozen: not complete", () => {
    expect(codes(assemblyFaults([]))).toEqual(["NO_PARTS"]);
  });
});

describe("the reconciliation (FR-CON-004)", () => {
  const sig = { contractorSignatoryName: "Tan Ah Kow", contractorSignedOn: "2026-09-25", officerSignedOn: "2026-09-25" };
  it("all three comparisons are needed", () => {
    expect(reconciliationFaults([{ comparison: "TENDER_DOCUMENT", outcome: "MATCHES", amendments: [] }]).map((f) => f.data?.comparison)).toEqual(["TENDER_TABLE_DOCUMENT", "DRAWINGS"]);
  });
  it("amended needs its amendments, each signed by both", () => {
    const base = [{ comparison: "TENDER_DOCUMENT" as const, outcome: "MATCHES" as const, amendments: [] }, { comparison: "DRAWINGS" as const, outcome: "MATCHES" as const, amendments: [] }];
    expect(codes(reconciliationFaults([...base, { comparison: "TENDER_TABLE_DOCUMENT", outcome: "AMENDED", amendments: [] }]))).toEqual(["AMENDMENT_NOT_RECORDED"]);
    expect(codes(reconciliationFaults([...base, { comparison: "TENDER_TABLE_DOCUMENT", outcome: "AMENDED", amendments: [{ ...sig, officerSignedOn: null }] }]))).toEqual(["AMENDMENT_UNSIGNED"]);
    expect(reconciliationFaults([...base, { comparison: "TENDER_TABLE_DOCUMENT", outcome: "AMENDED", amendments: [sig] }])).toEqual([]);
  });
  it("an amendment signed in the future, or without the contractor's signatory, is refused", () => {
    expect(codes(amendmentFaults({ description: "Rate for item 4.2 restated", contractorSignatoryName: "", contractorSignedOn: "2026-09-26", officerSignedOn: "2026-09-25" }, "2026-09-25"))).toEqual(["SIGNATORY_REQUIRED", "FUTURE_DATE"]);
    expect(amendmentFaults({ description: "x", contractorSignatoryName: "y", contractorSignedOn: "2026-09-25", officerSignedOn: "2026-09-25" }, "2026-09-25")).toEqual([]);
  });
});

describe("arithmetic corrections (FR-CON-005 a)", () => {
  it("the variance is Σ(corrected − tendered), exactly", () => {
    // 1,250.40 → 1,205.40 (−45.00); 310.10 → 311.00 (+0.90); 0.01 → 0.02 (+0.01) = −44.09
    expect(arithmeticVariance([{ tendered: S("1250.40"), corrected: S("1205.40") }, { tendered: S("310.10"), corrected: S("311.00") }, { tendered: S("0.01"), corrected: S("0.02") }])).toBe(S("-44.09"));
    expect(arithmeticVariance([])).toBe(0n);
  });
});

describe("front loading (FR-CON-005 b)", () => {
  const rate = (itemRef: string, tendered: string, estimate: string, provisional = false) => ({ itemRef, tenderedRate: S(tendered), estimateRate: S(estimate), provisional });
  it("no ratio set: nothing listed, the officer's judgement", () => {
    expect(frontLoadingItems([rate("1", "500", "100")], null)).toEqual({ state: "NO_RATIO" });
  });
  it("above the ratio is listed; exactly at it is listed apart, for judgement; below is not", () => {
    const r = frontLoadingItems([rate("a", "150.01", "100.00"), rate("b", "150.00", "100.00"), rate("c", "149.99", "100.00")], "1.5");
    expect(r.state === "JUDGED" && [r.above.map((x) => x.itemRef), r.atRatio.map((x) => x.itemRef)]).toEqual([["a"], ["b"]]);
  });
  it("a four-place ratio is read exactly (no float): 1.3333 × 300.00 = 399.99", () => {
    const r = frontLoadingItems([rate("a", "399.99", "300.00"), rate("b", "400.00", "300.00")], "1.3333");
    expect(r.state === "JUDGED" && [r.above.map((x) => x.itemRef), r.atRatio.map((x) => x.itemRef)]).toEqual([["b"], ["a"]]);
  });
  it("provisionally measured items come first; an estimate of nothing is never divided by", () => {
    const r = frontLoadingItems([rate("firm", "300", "100"), rate("prov", "300", "100", true), rate("zero", "1", "0")], "2");
    expect(r.state === "JUDGED" && r.above.map((x) => x.itemRef)).toEqual(["prov", "firm", "zero"]);
  });
  it("completing front loading needs a rate compared, and a note where anything was listed or no ratio was set", () => {
    const base = { kind: "FRONT_LOADING" as const, applicable: ["ARITHMETIC", "FRONT_LOADING", "RATE_UNIFORMITY"] as const, completedOn: null, on: "2026-09-25", today: "2026-09-25", preparationOn: "2026-09-20", note: "", ratio: "1.5" };
    expect(codes(completeFaults({ ...base, rates: [] }))).toEqual(["NO_RATE_COMPARED"]);
    expect(codes(completeFaults({ ...base, rates: [rate("a", "200", "100")] }))).toEqual(["FRONT_LOADING_NOTE_REQUIRED"]);
    expect(completeFaults({ ...base, rates: [rate("a", "120", "100")] })).toEqual([]);
    expect(codes(completeFaults({ ...base, ratio: null, rates: [rate("a", "120", "100")] }))).toEqual(["FRONT_LOADING_NOTE_REQUIRED"]);
    expect(completeFaults({ ...base, ratio: null, note: "Rates reviewed; none loaded.", rates: [rate("a", "120", "100")] })).toEqual([]);
  });
  it("a check not for the basis, already complete, in the future or before preparation is refused", () => {
    const base = { applicable: ["ARITHMETIC", "FRONT_LOADING", "SOR_ADJUSTMENT"] as const, completedOn: null, on: "2026-09-25", today: "2026-09-25", preparationOn: "2026-09-25", note: "", rates: [], ratio: null };
    expect(codes(completeFaults({ ...base, kind: "RATE_UNIFORMITY" }))).toEqual(["NOT_FOR_BASIS"]);
    expect(codes(completeFaults({ ...base, kind: "ARITHMETIC", completedOn: "2026-09-24" }))).toEqual(["ALREADY_COMPLETE"]);
    expect(codes(completeFaults({ ...base, kind: "ARITHMETIC", on: "2026-09-26" }))).toEqual(["FUTURE_DATE"]);
    expect(codes(completeFaults({ ...base, kind: "ARITHMETIC", on: "2026-09-24" }))).toEqual(["BEFORE_PREPARATION"]);
    expect(completeFaults({ ...base, kind: "SOR_ADJUSTMENT" })).toEqual([]);
  });
});

describe("formation as a whole", () => {
  it("collects the assembly, the reconciliation and the checks", () => {
    expect(codes(formationFaults({ parts: [], reconciliations: [], applicable: null, checks: [] }))).toEqual(["NO_PARTS", "COMPARISON_NOT_RECORDED", "COMPARISON_NOT_RECORDED", "COMPARISON_NOT_RECORDED", "CHECKS_NOT_SET"]);
  });
});
