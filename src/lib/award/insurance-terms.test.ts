import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";
import type { InsuranceKind } from "@/lib/securities/insurance";

import { baselineOf, type FrozenTender } from "./appendix-baseline";
import { gateDetailText, GATE_ITEM_NOTE, sumDetailText } from "./gate-words";
import { appendixMinimum, governingSum, governingSums, INSURED_KINDS, SUM_COLUMN, sumFindings, type AwardSums } from "./insurance-terms";
import { readinessGate } from "./readiness";

/**
 * 64-C4-b (ruled at 6.13 planning, a flagged step of 6.11): the award's own sums insured per policy kind
 * against the tender Appendix's minimums, and the readiness gate comparing each policy with the figure that
 * governs. Figures are a test fixture (an invented Appendix), never seeded.
 *
 * Worked example a finance officer can check by hand. Awarded sum RM1,077,508.60. The frozen Appendix asks
 * the works policy to cover the sum plus 10% (RM107,750.86, half up), so RM1,185,259.46; third-party
 * liability at least RM2,000,000.00; workmen's compensation at least RM500,000.00.
 * - The award states nothing: those three figures govern, each shown "from the tender Appendix".
 * - The award states public liability at RM1,500,000.00: that governs (the award over the Appendix), and it is
 *   shown with the Appendix's RM2,000,000.00 beside it as "below the tender Appendix's minimum".
 * - A verified CAR policy accepted for the works insuring RM1,185,259.45 is one sen short of RM1,185,259.46:
 *   signing is blocked, naming the works and both figures. At RM1,185,259.46 it is met.
 */

const RM = (s: string) => parseSen(s);
const AWARDED = RM("1077508.60");
const APPENDIX: FrozenTender["appendix"] = {
  ladKind: null,
  ladAmount: null,
  ladPct: null,
  dlpApplies: null,
  dlpMonths: null,
  tplMinimum: RM("2000000"),
  wcMinimum: RM("500000"),
  worksInsuranceUpliftKind: "PERCENT",
  worksInsuranceUpliftAmount: null,
  worksInsuranceUpliftPct: "10",
  insuranceExcess: null,
  sectionalCompletion: null,
};
const B = baselineOf({ packVersion: 1, frozenOn: "2026-09-10", appendix: APPENDIX, regulated: null }, AWARDED);
const NONE: AwardSums = { WORKS: null, PUBLIC_LIABILITY: null, WORKMENS_COMPENSATION: null };

describe("which figure governs each kind", () => {
  it("the award states nothing: the Appendix's minimum governs, with its source (the works: the sum plus the uplift, half up)", () => {
    expect(appendixMinimum("WORKS", B, AWARDED)).toBe(RM("1185259.46"));
    expect(governingSums(NONE, B, AWARDED)).toEqual({
      WORKS: { state: "APPENDIX", sen: RM("1185259.46") },
      PUBLIC_LIABILITY: { state: "APPENDIX", sen: RM("2000000") },
      WORKMENS_COMPENSATION: { state: "APPENDIX", sen: RM("500000") },
    });
  });
  it("an uplift stated as an amount", () => {
    const b = baselineOf({ packVersion: 1, frozenOn: null, appendix: { ...APPENDIX, worksInsuranceUpliftKind: "AMOUNT", worksInsuranceUpliftAmount: RM("50000"), worksInsuranceUpliftPct: null }, regulated: null }, AWARDED);
    expect(governingSum("WORKS", null, b, AWARDED)).toEqual({ state: "APPENDIX", sen: RM("1127508.60") });
  });
  it("the award's figure governs above the Appendix's, and below it too, shown with both figures", () => {
    expect(governingSum("PUBLIC_LIABILITY", RM("2500000"), B, AWARDED)).toEqual({ state: "AWARD", sen: RM("2500000"), appendix: RM("2000000"), belowAppendix: false });
    expect(governingSum("PUBLIC_LIABILITY", RM("1500000"), B, AWARDED)).toEqual({ state: "AWARD", sen: RM("1500000"), appendix: RM("2000000"), belowAppendix: true });
  });
  it("exactly the Appendix's figure is not below it", () => {
    expect(governingSum("WORKMENS_COMPENSATION", RM("500000"), B, AWARDED)).toMatchObject({ belowAppendix: false });
    expect(governingSum("WORKMENS_COMPENSATION", RM("499999.99"), B, AWARDED)).toMatchObject({ belowAppendix: true });
  });
  it("no Appendix: the award's figure governs alone; with none, nothing governs (never 0)", () => {
    expect(governingSum("WORKS", RM("900000"), null, AWARDED)).toEqual({ state: "AWARD", sen: RM("900000"), appendix: null, belowAppendix: false });
    expect(governingSum("WORKS", null, null, AWARDED)).toEqual({ state: "NOT_STATED" });
  });
  it("an Appendix that states no uplift states no works minimum", () => {
    const b = baselineOf({ packVersion: 1, frozenOn: null, appendix: { ...APPENDIX, worksInsuranceUpliftKind: null, worksInsuranceUpliftPct: null }, regulated: null }, AWARDED);
    expect(governingSum("WORKS", null, b, AWARDED)).toEqual({ state: "NOT_STATED" });
  });
  it("one column per kind, every kind listed", () => {
    expect(Object.keys(SUM_COLUMN)).toEqual([...INSURED_KINDS]);
  });
});

const p = (kind: InsuranceKind, sumInsured: string, status = "VERIFIED", substitutesFor: InsuranceKind | null = null) => ({ kind, substitutesFor, status, sumInsured: RM(sumInsured) });

describe("each verified policy against the governing figure", () => {
  const gov = governingSums(NONE, B, AWARDED);
  it("one sen short is short; exactly on the figure is met", () => {
    expect(sumFindings(["WORKS"], gov, [p("CAR", "1185259.45", "VERIFIED", "WORKS")])).toEqual([{ kind: "WORKS", state: "SHORT", governing: { state: "APPENDIX", sen: RM("1185259.46") }, insured: RM("1185259.45") }]);
    expect(sumFindings(["WORKS"], gov, [p("CAR", "1185259.46", "VERIFIED", "WORKS")])).toEqual([]);
  });
  it("only verified policies count, the best of them; a kind with none verified is the gate's 'not verified', not a shortfall", () => {
    expect(sumFindings(["PUBLIC_LIABILITY"], gov, [p("PUBLIC_LIABILITY", "1000", "LODGED")])).toEqual([]);
    expect(sumFindings(["PUBLIC_LIABILITY"], gov, [p("PUBLIC_LIABILITY", "1000"), p("PUBLIC_LIABILITY", "2000000")])).toEqual([]);
  });
  it("a kind not required is not compared", () => {
    expect(sumFindings(["WORKS"], gov, [p("PUBLIC_LIABILITY", "1")])).toEqual([]);
  });
  it("a required kind nothing states a figure for is said, not judged", () => {
    expect(sumFindings(["WORKMENS_COMPENSATION"], governingSums(NONE, null, AWARDED), [p("WORKMENS_COMPENSATION", "1")])).toEqual([{ kind: "WORKMENS_COMPENSATION", state: "NOT_STATED" }]);
  });
  it("the award's figure below the Appendix's governs: a policy meeting it passes", () => {
    const g = governingSums({ ...NONE, PUBLIC_LIABILITY: RM("1500000") }, B, AWARDED);
    expect(sumFindings(["PUBLIC_LIABILITY"], g, [p("PUBLIC_LIABILITY", "1500000")])).toEqual([]);
    expect(sumFindings(["PUBLIC_LIABILITY"], g, [p("PUBLIC_LIABILITY", "1499999.99")])[0]).toMatchObject({ state: "SHORT", governing: { state: "AWARD" } });
  });
});

describe("the readiness gate blocks signing on a shortfall", () => {
  const base = {
    returned: true,
    bondRequired: false as boolean | null,
    bondNotRequiredReason: "Small works",
    requiredBond: { state: "NOT_SET" as const, missing: ["BASIS"] } as never,
    bonds: [],
    requirements: [{ code: "works", nameEn: "Works", kind: "WORKS" as InsuranceKind, contractTypeCode: null, required: true, percent: null, tailMonths: null, tailDays: null }],
    policies: [{ kind: "CAR" as InsuranceKind, substitutesFor: "WORKS" as InsuranceKind | null, status: "VERIFIED" }],
    wcBasis: null,
  };
  const insured = (sum: string) => ({ governing: governingSums(NONE, B, AWARDED), policies: [p("CAR", sum, "VERIFIED", "WORKS")] });
  const ins = (x: object) => readinessGate({ ...base, ...x }).items.find((i) => i.key === "INSURANCE")!;
  it("short: not met, the detail naming the kind and both figures, and the gate not ready", () => {
    const r = readinessGate({ ...base, insured: insured("1185259.45") });
    expect(r.ready).toBe(false);
    const item = r.items.find((i) => i.key === "INSURANCE")!;
    expect(item.state).toBe("NOT_MET");
    expect(item.detail).toEqual([`SHORT:WORKS:${RM("1185259.46")}:APPENDIX:${RM("1185259.45")}`]);
    expect(gateDetailText(item, "")).toBe("Works insurance: the verified policy insures RM1,185,259.45, below RM1,185,259.46 (the tender Appendix's minimum).");
  });
  it("met at the figure", () => {
    expect(ins({ insured: insured("1185259.46") }).state).toBe("MET");
  });
  it("nothing stated: met as before, saying it was not compared", () => {
    const item = ins({ insured: { governing: governingSums(NONE, null, AWARDED), policies: [p("CAR", "1", "VERIFIED", "WORKS")] } });
    expect(item.state).toBe("MET");
    expect(gateDetailText(item, "")).toBe("Works insurance: neither the award nor a tender Appendix states a sum insured, so it is not compared.");
  });
  it("its detail freezes into a snapshot as JSON (no bigint)", () => {
    expect(() => JSON.stringify(readinessGate({ ...base, insured: insured("1") }).items)).not.toThrow();
  });
  it("the award's own figure, named as such", () => {
    expect(sumDetailText(`SHORT:PUBLIC_LIABILITY:${RM("1500000")}:AWARD:${RM("1000000")}`)).toBe("Public liability insurance: the verified policy insures RM1,000,000, below RM1,500,000 (the award's figure).");
  });
  it("the note under the item says what is compared, no longer that sums are not compared", () => {
    expect(GATE_ITEM_NOTE.INSURANCE).not.toMatch(/not yet compared/);
    expect(GATE_ITEM_NOTE.INSURANCE).toMatch(/compared with the award's own figure for its kind, or the tender Appendix's minimum/);
  });
});

describe("every caller of the gate passes the governing sums (no reading skips the comparison)", () => {
  const ROOT = path.join(__dirname, "../../..");
  it("the award page, the contract's gate and the contracts list", () => {
    const read = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
    expect(read("src/lib/award/gate-read.ts")).toMatch(/insured: \{ governing: governingSums\(/);
    expect(read("src/app/awards/[id]/page.tsx")).toMatch(/awardReadiness\(award, ev\.requiredBond, requirements, ev\.appendix\?\.baseline \?\? null\)/);
    expect(read("src/lib/contract/load.ts")).toMatch(/frozenTenderOf\(l\.ex\.id/);
    expect(read("src/lib/contract/load.ts")).toMatch(/frozenTendersOf\(rows\.map/);
  });
});
