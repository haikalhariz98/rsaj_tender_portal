import { describe, expect, it } from "vitest";

import type { BaselineValues } from "@/lib/contract/baseline";
import type { LadBasis } from "@/lib/lad/frozen";
import type { ScopeDecision } from "@/lib/lad/scopes";
import { parseSen } from "@/lib/money";

import { assembleInterim, type AssembleInput, type DamagesIn, type IssuedInterim } from "./assemble";

/**
 * 6.13 Part B run 1b (flagged against Part A; a shared rule's output): the interim's damages per scope. Where the facts
 * are Part A's (one decision, one rate, no extension, no waiver), the per-scope path prints exactly what Part A's did:
 * the same figures, the same lines and totals, the same refusals. FIXTURE ONLY (Part A's assemble.test.ts fixture).
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

const BASIS: LadBasis = { decisions: [], extensions: [], waiversApplied: [], waiversApproved: [], scopeDates: { WHOLE: BASE.dateForCompletion }, segments: {} };
const scoped = (d: ScopeDecision | null, o: Partial<DamagesIn> = {}): DamagesIn => ({ wholeDate: BASE.dateForCompletion, scopes: [{ key: "WHOLE", label: "the whole works", dateNow: BASE.dateForCompletion, decision: d }], issued: [], returned: [], waiversApplied: [], waiversToApply: [], faults: [], basis: BASIS, ...o });
const asScope = (dec: NonNullable<AssembleInput["decision"]>): ScopeDecision => ({ id: "d1", outcome: dec.outcome, reason: dec.reason, certificateIssued: dec.certificateIssued, from: dec.from, until: dec.until, rate: dec.rate, dateForCompletion: dec.dateForCompletion ?? null, superseded: null, occupation: null });
const parity = (i: AssembleInput) => {
  const a = assembleInterim(i);
  const b = assembleInterim({ ...i, damages: scoped(i.decision ? asScope(i.decision) : null) });
  return { a, b };
};

describe("Part A's facts through the per-scope path print what Part A printed", () => {
  it("one decision charging: the same figures, lines, totals and refusals", () => {
    const { a, b } = parity(INPUT);
    expect(b.faults).toEqual(a.faults);
    expect(b.result.snapshot!.lines).toEqual(a.result.snapshot!.lines);
    expect(b.result.snapshot!.totals).toEqual(a.result.snapshot!.totals);
    expect({ ...b.result.figures, ladCredit: undefined }).toEqual({ ...a.result.figures, ladCredit: undefined });
    expect(b.result.figures!.ladCredit).toBe(0n);
    expect(b.judgedUnder!.lad).toEqual(a.judgedUnder!.lad);
  });

  it("excusable or pending, nothing to charge, and no decision past the date: the same", () => {
    for (const decision of [{ ...INPUT.decision!, outcome: "EXCUSED_OR_PENDING" as const, reason: "Entitlement pending (claim CM/1)" }, { ...INPUT.decision!, from: "2026-08-01" }, null]) {
      const i = { ...INPUT, decision, valuation: { ...INPUT.valuation, deductions: [] } };
      const { a, b } = parity(i);
      expect(b.faults, String(decision?.outcome ?? "none") + " " + String(decision?.from ?? "")).toEqual(a.faults);
      expect(b.result.snapshot?.lines, String(decision?.outcome ?? "none") + " " + String(decision?.from ?? "")).toEqual(a.result.snapshot?.lines);
      expect(b.result.snapshot?.totals, String(decision?.outcome ?? "none") + " " + String(decision?.from ?? "")).toEqual(a.result.snapshot?.totals);
    }
  });
});

describe("the per-scope path's own lines (FR-LAD-011; 613A-C2)", () => {
  const issuedLine = { certificateId: "c1", number: "IP/1", scopeKey: "WHOLE", segments: [{ from: "2026-07-01", until: "2026-07-11", rate: s("269.38"), days: 10 }], gross: s("2693.80"), rounding: 0n };
  it("a credit returned on extension of time is its own line, taken off the deductions", () => {
    const d = asScope({ ...INPUT.decision!, from: "2026-07-01", dateForCompletion: "2026-06-30" });
    const r = assembleInterim({ ...INPUT, valuation: { ...INPUT.valuation, deductions: [] }, damages: scoped({ ...d, superseded: { eotNumber: "EOT/1", newDate: "2026-07-14" } }, { scopes: [{ key: "WHOLE", label: "the whole works", dateNow: "2026-07-14", decision: { ...d, superseded: { eotNumber: "EOT/1", newDate: "2026-07-14" } } }], issued: [issuedLine] }) });
    expect(r.faults.filter((f) => f.level === "block")).toEqual([]);
    const lines = r.result.snapshot!.lines;
    expect(lines.find((l) => l.key === "ladCredit")?.value).toBe("2693.80");
    expect(lines.find((l) => l.key === "ladNote")?.value).toBe("None: the decision was closed by the extension of time EOT/1, and the new date for completion is not past");
    expect(r.result.snapshot!.totals.find((t) => t.key === "totalDeductions")!.terms).toContainEqual({ key: "ladCredit", sign: -1 });
    expect(r.result.figures!.ladCredit).toBe(s("2693.80"));
    expect(r.judgedUnder!.ladCredits).toEqual([{ lineCertificateId: "c1", lineNumber: "IP/1", scopeKey: "WHOLE", segmentFrom: "2026-07-01", days: 10, rate: "269.38", amount: "2693.80" }]);
  });

  it("two scopes print two blocks, the second keyed apart, each in its scope's words", () => {
    const d = asScope(INPUT.decision!);
    const r = assembleInterim({ ...INPUT, damages: { ...scoped(d), scopes: [{ key: "WHOLE", label: "the whole works", dateNow: BASE.dateForCompletion, decision: d }, { key: "SECTION:2", label: "Section 2: the pump house", dateNow: BASE.dateForCompletion, decision: { ...d, id: "d2", rate: s("100.00") } }] } });
    const keys = r.result.snapshot!.lines.map((l) => l.key).filter((k) => k.startsWith("lad"));
    expect(keys).toEqual(["ladRate", "ladFrom", "ladTo", "ladDays", "ladWaived", "ladAmount", "ladRate_2", "ladFrom_2", "ladTo_2", "ladDays_2", "ladWaived_2", "ladAmount_2", "ladRounding"]);
    expect(r.result.snapshot!.lines.find((l) => l.key === "ladAmount_2")?.labelEn).toBe("Liquidated damages, Section 2: the pump house");
    expect(r.judgedUnder!.ladScopes!.map((x) => x.key)).toEqual(["WHOLE", "SECTION:2"]);
  });

  it("the basis is frozen with the waivers it applies", () => {
    const r = assembleInterim({ ...INPUT, damages: scoped(asScope(INPUT.decision!), { waiversToApply: [{ id: "w1", scopeKey: "WHOLE", amount: s("100.00"), label: "CM/2" }] }) });
    expect(r.judgedUnder!.ladBasis!.waiversApplied).toEqual(["w1"]);
    expect(r.result.snapshot!.lines.find((l) => l.key === "ladWaived")?.value).toBe("100.00");
  });
});
