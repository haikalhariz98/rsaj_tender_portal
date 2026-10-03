import { describe, expect, it } from "vitest";

import type { BaselineValues } from "@/lib/contract/baseline";
import { parseSen, senToDecimalString } from "@/lib/money";

import { assembleInterim, chargedUntilOf, heldOnLatest, previousOf, readJudgedUnder, type AssembleInput, type IssuedInterim } from "./assemble";

/**
 * The valuation assembled into its certificate: the same function the Payments tab previews and the raise act runs.
 * FIXTURE ONLY (the plan's worked example; RSAJ figures in test fixtures, never seeded).
 */

const s = parseSen;
const BASE: BaselineValues = {
  contractSum: s("1077508.60"),
  contractDate: "2026-01-05",
  possessionDate: "2026-01-12",
  completionPeriod: 24,
  completionUnit: "WEEKS",
  dateForCompletion: "2026-06-30",
  dlpApplies: true,
  dlpMonths: 12,
  dlpSource: "AWARD",
  ladKind: "PERCENT_OF_SUM_PER_DAY",
  ladAmount: null,
  ladPct: "0.025",
  ladUnit: "per day",
  ladDaily: s("269.38"),
  ladSource: "APPENDIX",
  retentionApplies: true,
  retentionPercent: "10",
  retentionCapPercent: "5",
  retentionSource: "AWARD",
  pcSums: s("50000.00"),
  provisionalSums: s("30000.00"),
  sumsSource: "BQ",
  buildersWorksValue: s("997508.60"),
  firstInterimMinimum: s("1000.00"),
  firstInterimSource: "DERIVED",
  subsequentInterimMinimum: s("5000.00"),
  subsequentInterimSource: "APPENDIX",
  honourCertificateDays: null,
  honourSource: null,
  unfixedMaterialsPct: null,
  onCostPct: null,
  designWorkValue: null,
  sectionalCompletion: false,
  sectionalSource: "APPENDIX",
  sections: [],
};
const figures = (o: Record<string, string>) => new Map(Object.entries(o));
const PRIOR: IssuedInterim = { certificateId: "c1", sequence: 1, figures: figures({ carryForward: "250000.00", gross: "300000.00", retentionMain: "30000.00", retentionNsc: "0.00", retentionNs: "0.00" }), judgedUnder: null };

const INPUT: AssembleInput = {
  valuation: {
    id: "v2",
    trigger: "VALUATION_DATE",
    triggerDate: null,
    valuationDate: "2026-07-10",
    mainWorks: s("400000.00"),
    jointRecorded: true,
    materials: [{ id: "m1", value: s("20000.00"), protectedOnSite: true, notTooEarly: true, formsPartOfWorks: true, temporary: false, submittedOn: "2026-07-10" }],
    parties: [
      { partyId: "p1", name: "Nominated electrical", kind: "NOMINATED_SUBCONTRACTOR", value: s("30000.00"), due: s("27000.00"), submittedOn: "2026-07-09" },
      { partyId: "p2", name: "Nominated pumps", kind: "NOMINATED_SUPPLIER", value: s("10000.00"), due: s("9000.00"), submittedOn: "2026-07-09" },
    ],
    deductions: [{ kind: "LAD_ROUNDING", label: "", amount: s("0.20") }],
  },
  computedOn: "2026-07-12",
  baseline: { version: 3, values: BASE },
  policy: { materialsPct: "75", materialsProvenance: "STATED", preExecutionLimit: 3, preExecutionProvenance: "STATED", remainder: "LARGEST_REMAINDER", remainderProvenance: "ASSUMED" },
  issued: [PRIOR],
  foreign: [],
  adjustments: [s("57800.00"), s("-20000.00")],
  releases: [],
  advances: [{ id: "a1", party: "MAIN", amount: s("10000.00"), schedule: [{ sequence: 2, amount: s("5000.00") }, { sequence: 3, amount: s("5000.00") }] }],
  decision: { outcome: "LAD_APPLIES", reason: "No ground for an extension", certificateIssued: true, from: "2026-07-01", until: null, rate: s("269.38") },
  pending: [{ id: "pd1", amount: s("1200.00"), paidOn: "2026-07-05" }, { id: "pd2", amount: s("999.00"), paidOn: "2026-07-11" }],
  preExecution: { executed: true, gate: [], withoutReceipt: [], perkesoRecorded: true },
};

describe("the worked example, assembled from the contract's records", () => {
  const a = assembleInterim(INPUT);
  it("certificate 2: recommended 150,606.00, every reading frozen with it", () => {
    expect(a.faults).toEqual([]);
    expect(a.sequence).toBe(2);
    expect(senToDecimalString(a.result.figures!.recommended)).toBe("150606.00");
    const j = a.judgedUnder!;
    expect(j.recoupments).toEqual([{ advanceId: "a1", party: "MAIN", recoup: "5000.00", balanceAfter: "5000.00" }]);
    // A premium paid after the valuation day waits for the next certificate.
    expect(j.pendingDeductionIds).toEqual(["pd1"]);
    expect(j.lad).toMatchObject({ state: "CHARGED", from: "2026-07-01", to: "2026-07-10", until: "2026-07-11", days: 10, amount: "2693.80" });
    expect(j.materialsPct).toEqual({ state: "SET", pct: "75", source: "POLICY" });
    expect(j.preExecution).toEqual({ limit: 3, provenance: "STATED" });
    expect(readJudgedUnder(JSON.parse(JSON.stringify(j)))).toEqual(j);
  });
  it("the waterfall on the payment recommended: everyone due is paid, the contractor takes the rest", () => {
    expect(a.waterfall!.sufficient).toBe(true);
    expect(senToDecimalString(a.waterfall!.contractor)).toBe("114606.00");
  });
});

describe("from the history", () => {
  it("previously certified is what the issued certificates carried forward; the previous gross the latest's", () => {
    const two = { ...PRIOR, certificateId: "c2", sequence: 2, figures: figures({ carryForward: "100000.00", gross: "420000.00" }) };
    expect(previousOf([two, PRIOR])).toEqual({ previous: s("350000.00"), previousGross: s("420000.00") });
  });
  it("the damages days charged before are not charged again", () => {
    const issued = { ...PRIOR, judgedUnder: { ...assembleInterim(INPUT).judgedUnder!, sequence: 1 } };
    expect(chargedUntilOf([issued])).toBe("2026-07-11");
    const next = assembleInterim({ ...INPUT, issued: [PRIOR, { ...issued, sequence: 2, certificateId: "c2" }], valuation: { ...INPUT.valuation, valuationDate: "2026-08-10", parties: INPUT.valuation.parties.map((p) => ({ ...p, submittedOn: "2026-08-01" })), materials: INPUT.valuation.materials.map((m) => ({ ...m, submittedOn: "2026-08-01" })), mainWorks: s("500000.00") } });
    expect(next.lad).toMatchObject({ state: "CHARGED", from: "2026-07-11", to: "2026-08-10", days: 31 });
  });
  it("what the latest certificate held, before what was released by then (for a release)", () => {
    expect(heldOnLatest([PRIOR])).toEqual({ certificateId: "c1", held: { MAIN: s("30000.00"), NSC: 0n, NS: 0n } });
    expect(heldOnLatest([])).toBeNull();
  });
});

describe("refusals before raising, each naming its rule", () => {
  const codes = (i: AssembleInput) => assembleInterim(i).faults.map((f) => f.code);
  it("no joint valuation, no main works", () => {
    expect(codes({ ...INPUT, valuation: { ...INPUT.valuation, jointRecorded: false, mainWorks: null } })).toEqual(expect.arrayContaining(["JOINT_NOT_RECORDED", "MAIN_WORKS_NOT_RECORDED"]));
  });
  it("a list submitted after the valuation day goes to the next cycle", () => {
    expect(codes({ ...INPUT, valuation: { ...INPUT.valuation, materials: [{ ...INPUT.valuation.materials[0], submittedOn: "2026-07-11" }] } })).toContain("LINE_AFTER_CUT_OFF");
  });
  it("past the date for completion with no decision: record the non-completion decision", () => {
    expect(codes({ ...INPUT, decision: null })).toContain("NON_COMPLETION_DECISION_REQUIRED");
  });
  it("excusable or pending: proceeds without a damages line, the reasons on the certificate", () => {
    const a = assembleInterim({ ...INPUT, decision: { ...INPUT.decision!, outcome: "EXCUSED_OR_PENDING", reason: "Late possession claimed" }, valuation: { ...INPUT.valuation, deductions: [] } });
    expect(a.faults).toEqual([]);
    expect(a.result.snapshot!.lines.find((l) => l.key === "ladNote")?.value).toMatch(/Late possession claimed/);
  });
  it("below the first minimum, as certificate 1: held to the next cycle", () => {
    const a = assembleInterim({ ...INPUT, issued: [], decision: null, valuation: { ...INPUT.valuation, valuationDate: "2026-06-30", mainWorks: s("999.99"), materials: [], parties: [], deductions: [] }, advances: [], pending: [] });
    expect(a.faults.map((f) => f.code)).toEqual(["BELOW_MINIMUM"]);
  });
  it("the value to date beyond the revised contract sum needs a Variation Order Certificate first", () => {
    expect(codes({ ...INPUT, valuation: { ...INPUT.valuation, mainWorks: s("1100000.00") } })).toContain("VOC_REQUIRED");
  });
  it("FR-PAY-014 at open is a warning, never a refusal", () => {
    const a = assembleInterim({ ...INPUT, preExecution: { executed: false, gate: [], withoutReceipt: [], perkesoRecorded: false }, policy: { ...INPUT.policy, preExecutionLimit: 1 } });
    expect(a.warnings.map((x) => [x.code, x.level])).toEqual([["CONTRACT_NOT_SIGNED", "warn"]]);
    expect(a.faults).toEqual([]);
  });
  it("an interim certificate issued without a valuation: refused by name, and the sequence still counts it", () => {
    const a = assembleInterim({ ...INPUT, foreign: [{ number: "IPC/2026/0007", sequence: 2 }] });
    expect(a.faults.map((f) => [f.code, f.data])).toContainEqual(["INTERIM_NOT_FROM_VALUATION", { number: "IPC/2026/0007" }]);
    expect(a.sequence).toBe(3);
    expect(assembleInterim(INPUT).sequence).toBe(2);
  });
});

describe("BD-613-48 (FREEZE): the damages rate and date are the decision's and its CNC's, never today's baseline", () => {
  // The CNC was issued at 269.38 a day on a date for completion of 30 Jun 2026. The baseline is then revised: the
  // rate to 300.00 and the date for completion to 10 Jul (an extension). The next interim still charges 269.38 from
  // the window entered with the decision, and says why.
  const frozen = { ...INPUT.decision!, rate: s("269.38"), dateForCompletion: "2026-06-30" };
  const revisedBase = { ...BASE, ladDaily: s("300.00"), dateForCompletion: "2026-07-10" };
  const a = assembleInterim({ ...INPUT, baseline: { version: 4, values: revisedBase }, decision: frozen, baselineDamages: { rate: s("300.00"), dateForCompletion: "2026-07-10" } });
  it("charges the CNC's rate over the frozen window", () => {
    expect(a.lad.state).toBe("CHARGED");
    if (a.lad.state === "CHARGED") expect(senToDecimalString(a.lad.rate)).toBe("269.38");
    expect(a.result.snapshot!.lines.find((l) => l.key === "ladRate")?.value).toBe("269.38");
  });
  it("warns, on the certificate and with the valuation, that the CNC's rate applies until a new decision", () => {
    expect(a.warnings.map((w) => [w.code, w.level])).toContainEqual(["LAD_BASELINE_REVISED", "warn"]);
    expect(a.result.snapshot!.lines.find((l) => l.key === "ladRateNote")?.value).toMatch(/certificate's rate applies until a new decision/);
    expect(a.faults).toEqual([]);
  });
  it("no revision, no warning; a decision applying damages with no rate refuses (RATE_NOT_SET)", () => {
    const same = assembleInterim({ ...INPUT, decision: frozen, baselineDamages: { rate: s("269.38"), dateForCompletion: "2026-06-30" } });
    expect(same.warnings.map((w) => w.code)).not.toContain("LAD_BASELINE_REVISED");
    const none = assembleInterim({ ...INPUT, decision: { ...frozen, rate: null } });
    expect(none.faults.map((f) => f.code)).toContain("LAD_RATE_NOT_SET");
  });
});
