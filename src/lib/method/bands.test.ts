import { describe, expect, it } from "vitest";

import { regimeFor } from "@/lib/authority/resolve";
import type { Matrix } from "@/lib/authority/types";
import { parseSen } from "@/lib/money";

import { determineBands, termsFor, type BandContext } from "./bands";
import { SPEC_MATRIX, SPEC_METHODS, SPEC_TERMS } from "./fixture";
import type { Method } from "./types";

const on = new Date("2026-09-30T00:00:00Z");
const withSwitch = (inclusive: boolean): Matrix => ({ ...SPEC_MATRIX, policy: { ...SPEC_MATRIX.policy, boundaryInclusive: inclusive } });
const ctx = (over: Partial<BandContext> = {}, matrix: Matrix = SPEC_MATRIX): BandContext => ({
  funder: { dal: matrix, override: null, supersedes: false },
  termsBands: SPEC_TERMS,
  boundaryProvenance: "ASSUMED",
  methods: SPEC_METHODS,
  posture: "PROCURES",
  on,
  method: null,
  ...over,
});
const m = (code: string): Method => SPEC_METHODS.find((x) => x.code === code)!;
const bands = (v: string, c: Partial<BandContext> = {}, matrix?: Matrix) => determineBands(parseSen(v), ctx(c, matrix));

describe("three band families, held separately (FR-MTD-001)", () => {
  it("RM60,000: requisition to the Functional Director, quotation regime, terms above RM50,000 with retention and DLP — at once", () => {
    const d = bands("60000.00");
    expect(d.requisition.ruleKey).toBe("REQ_300K");
    expect(d.requisition.approverCode).toBe("FD");
    expect(d.regime).toBe("quotation");
    expect(d.appointment.approverCode).toBe("CEO");
    expect(d.terms.state).toBe("APPLIES");
    expect(d.terms.band?.bandKey).toBe("Q_LONG");
    expect(d.terms.band?.retentionApplies).toBe(true);
    expect(d.terms.band?.defectsLiabilityApplies).toBe(true);
  });

  it("none reads another's edges: RM50,000 is the requisition edge and the terms edge, but not a regime edge", () => {
    const d = bands("50000.00");
    expect(d.requisition.ruleKey).toBe("REQ_50K");
    expect(d.regime).toBe("quotation");
    expect(d.terms.band?.bandKey).toBe("Q_SHORT");
  });
});

describe("the method band and who approves, before creation (FR-MTD-002)", () => {
  it("RM14,999: below the quotation regime, appointment by value, no committee", () => {
    const d = bands("14999.00");
    expect(d.regime).toBe("below");
    expect(d.proposed).toEqual({ state: "PROPOSED", code: "direct" });
    expect(d.appointment.state).toBe("RESOLVED");
    expect(d.appointment.approverCode).toBe("FD");
    expect(d.appointment.committeeCode).toBeNull();
  });

  it("RM15,001: quotation regime, Quotation Committee mandatory recommendation, CEO approves", () => {
    const d = bands("15001.00");
    expect(d.regime).toBe("quotation");
    expect(d.appointment.committeeCode).toBe("QC");
    expect(d.appointment.committeeAct).toBe("MR");
    expect(d.appointment.approverCode).toBe("CEO");
  });

  it("RM300,001: tender regime, Tender Board approves", () => {
    const d = bands("300001.00");
    expect(d.regime).toBe("tender");
    expect(d.appointment.approverCode).toBe("TBC");
  });

  it("with no default method in the regime the approver depends on the method, never a guessed one", () => {
    const methods = SPEC_METHODS.map((x) => ({ ...x, defaultInQuotation: false }));
    const d = bands("60000.00", { methods });
    expect(d.proposed.state).toBe("NO_DEFAULT");
    expect(d.appointment.state).toBe("DEPENDS_ON_METHOD");
    expect(d.appointment.approverCode).toBeNull();
    expect(d.findings.map((f) => f.code)).toContain("DEPENDS_ON_METHOD");
  });

  it("two defaults in one regime propose nothing either", () => {
    const methods = SPEC_METHODS.map((x) => (x.code === "selective_quotation" ? { ...x, defaultInQuotation: true } : x));
    expect(bands("60000.00", { methods }).appointment.state).toBe("DEPENDS_ON_METHOD");
  });

  it("a chosen method is previewed rather than the proposed one", () => {
    const d = bands("60000.00", { method: m("direct") });
    expect(d.appointment.ruleKey).toBe("DA_300K");
  });
});

describe("the terms band (FR-MTD-001, D12)", () => {
  it("no terms rows is not set, never 'none apply'", () => {
    const d = bands("60000.00", { termsBands: [] });
    expect(d.terms.state).toBe("NOT_SET");
    expect(d.findings.map((f) => f.code)).toContain("TERMS_NOT_SET");
  });
  it("rows scoped to the quotation regime do not apply to a tender value", () => {
    expect(bands("400000.00").terms.state).toBe("NONE_IN_REGIME");
  });
  it("a band with no regime applies in every regime", () => {
    const all = [{ ...SPEC_TERMS[1], regime: null, bandKey: "ALL", minValue: null }];
    expect(bands("400000.00", { termsBands: all }).terms.band?.bandKey).toBe("ALL");
  });
  it("rows for the regime that miss the value are a gap", () => {
    const d = bands("60000.00", { termsBands: [SPEC_TERMS[0]] });
    expect(d.terms.state).toBe("NO_BAND_FOR_VALUE");
  });
  it("a band edge on the boundary follows the switch only where it says so", () => {
    const edge = [{ ...SPEC_TERMS[0], bandKey: "E", regime: null, minValue: null, maxValue: 300_000, followsBoundarySwitch: true }];
    expect(termsFor(300_000, "quotation", edge, withSwitch(true).policy).state).toBe("APPLIES");
    expect(termsFor(300_000, "tender", edge, withSwitch(false).policy).state).toBe("NO_BAND_FOR_VALUE");
    const ignores = [{ ...edge[0], followsBoundarySwitch: false }];
    expect(termsFor(300_000, "tender", ignores, withSwitch(false).policy).state).toBe("APPLIES");
  });
});

describe("the D3 sweep: only RM300,000.00 changes between the settings (FR-MTD-003)", () => {
  const grid = ["14999.99", "15000.00", "15000.01", "49999.99", "50000.00", "50000.01", "60000.00", "299999.99", "300000.00", "300000.01", "3000000.00", "5000000.01"];
  const outcome = (v: string, inclusive: boolean) => {
    const d = bands(v, {}, withSwitch(inclusive));
    return JSON.stringify({
      req: d.requisition.ruleKey,
      regime: d.regime,
      app: d.appointment.ruleKey,
      approver: d.appointment.approverCode,
      terms: [d.terms.state, d.terms.band?.bandKey ?? null],
    });
  };

  it("the set of values whose result differs is exactly {RM300,000.00}", () => {
    const differ = grid.filter((v) => outcome(v, true) !== outcome(v, false));
    expect(differ).toEqual(["300000.00"]);
  });

  it("at RM300,000.00: GT keeps quotation and its row, GTE moves to tender and its row", () => {
    const gt = bands("300000.00", {}, withSwitch(true));
    const gte = bands("300000.00", {}, withSwitch(false));
    expect([gt.regime, gt.appointment.ruleKey, gt.boundary.operator]).toEqual(["quotation", "APP_QUOTATION", "GT"]);
    expect([gte.regime, gte.appointment.ruleKey, gte.boundary.operator]).toEqual(["tender", "APP_TENDER", "GTE"]);
  });

  it("the requisition still routes to the Functional Director either way", () => {
    expect(bands("300000.00", {}, withSwitch(true)).requisition.approverCode).toBe("FD");
    expect(bands("300000.00", {}, withSwitch(false)).requisition.approverCode).toBe("FD");
  });

  it("regimeFor(RM300,000.00) flips with the switch: the tender floor always follows it", () => {
    expect(regimeFor(300_000, withSwitch(true).policy)).toBe("quotation");
    expect(regimeFor(300_000, withSwitch(false).policy)).toBe("tender");
  });

  it("every case records the operator; on the boundary an unwritten ruling is the logged exception", () => {
    const d = bands("300000.00");
    expect(d.boundary.onBoundary).toBe(true);
    expect(d.boundary.ruled).toBe(false);
    expect(d.findings.map((f) => f.code)).toContain("BOUNDARY_NOT_RULED");
    expect(bands("300000.00", { boundaryProvenance: "STATED" }).findings.map((f) => f.code)).not.toContain("BOUNDARY_NOT_RULED");
    expect(bands("300000.01").findings.map((f) => f.code)).not.toContain("BOUNDARY_NOT_RULED");
    expect(bands("300000.01").boundary.operator).toBe("GT");
  });
});

describe("a funder that supersedes the limits (FR-REQ-006 partition)", () => {
  const funderMatrix: Matrix = {
    ...SPEC_MATRIX,
    rules: [{ ...SPEC_MATRIX.rules.find((r) => r.ruleKey === "APP_QUOTATION")!, ruleKey: "FUNDER_Q", approverCode: "FD" }],
  };
  it("prefers the funder's issued rule set where it has a rule", () => {
    const d = bands("60000.00", { funder: { dal: SPEC_MATRIX, override: { id: "f", label: "Funder rules", matrix: funderMatrix }, supersedes: true } });
    expect(d.appointment.source).toBe("OVERRIDE");
    expect(d.appointment.approverCode).toBe("FD");
    expect(d.appointment.warnings.map((w) => w.code)).toContain("GOV_OVERRIDE");
  });
  it("otherwise routes by the organisation's limits and says so", () => {
    const d = bands("60000.00", { funder: { dal: SPEC_MATRIX, override: null, supersedes: true } });
    expect(d.appointment.source).toBe("DAL");
    expect(d.appointment.approverCode).toBe("CEO");
    expect(d.appointment.warnings.find((w) => w.code === "GOV_OVERRIDE")?.level).toBe("warn");
  });
  it("is never applied where the route does not supersede", () => {
    const d = bands("60000.00", { funder: { dal: SPEC_MATRIX, override: { id: "f", label: "Funder rules", matrix: funderMatrix }, supersedes: false } });
    expect(d.appointment.source).toBe("DAL");
    expect(d.appointment.warnings.map((w) => w.code)).not.toContain("GOV_OVERRIDE");
  });
});

describe("the comparison a rule or band applied on the boundary (review #7)", () => {
  const ignoring: Matrix = {
    ...withSwitch(false),
    rules: SPEC_MATRIX.rules.map((r) => (r.ruleKey === "DA_300K" || r.ruleKey === "DA_3M" ? { ...r, followsBoundarySwitch: false } : r)),
  };
  it("is recorded with the case", () => {
    const d = bands("300000.00", { method: m("direct") }, withSwitch(false));
    expect(d.appointment.ruleKey).toBe("DA_3M");
    expect(d.appointment.boundaryOperator).toBe("GTE");
    expect(d.findings.map((f) => f.code)).not.toContain("REGIME_RULE_DISAGREE");
  });
  it("a rule that ignores the switch while the regime follows it is carried as a disagreement", () => {
    const d = bands("300000.00", { method: m("direct") }, ignoring);
    expect(d.regime).toBe("tender");
    expect(d.appointment.ruleKey).toBe("DA_300K");
    expect(d.appointment.boundaryOperator).toBe("GT");
    expect(d.findings.find((f) => f.code === "REGIME_RULE_DISAGREE")?.data?.kind).toBe("rule");
  });
  it("so is a terms band that does", () => {
    const edge = [{ ...SPEC_TERMS[0], bandKey: "E", regime: null, maxValue: 300_000, followsBoundarySwitch: false }];
    const d = bands("300000.00", { termsBands: edge }, withSwitch(false));
    expect(d.terms.boundaryOperator).toBe("GT");
    expect(d.findings.find((f) => f.code === "REGIME_RULE_DISAGREE")?.data?.kind).toBe("terms");
  });
});
