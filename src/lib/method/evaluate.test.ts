import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { evaluateExercise, saveBlockers, type EvaluationContext, type ExerciseDraft } from "./evaluate";
import { SPEC_BASES, SPEC_MAPPINGS, SPEC_MATRIX, SPEC_METHODS, SPEC_REASONS, SPEC_TAXONOMIES, SPEC_TERMS, SPEC_TYPES } from "./fixture";
import { presentEvaluation } from "./present";

const on = new Date("2026-09-30T00:00:00Z");
const ctx = (over: Partial<EvaluationContext> = {}): EvaluationContext => ({
  funder: { dal: SPEC_MATRIX, override: null, supersedes: false },
  termsBands: SPEC_TERMS,
  boundaryProvenance: "ASSUMED",
  posture: "PROCURES",
  on,
  config: { methods: SPEC_METHODS, reasons: SPEC_REASONS, types: SPEC_TYPES, bases: SPEC_BASES, taxonomies: SPEC_TAXONOMIES, mappings: SPEC_MAPPINGS, policy: { dominanceSharePct: null, provenance: null } },
  approved: { value: parseSen("330000.00"), ruleKey: "REQ_OVER", ruleLabel: "Above RM300,000", checkedAgainstMatrix: true },
  siblings: [],
  lockedAt: null,
  currentTypeCode: null,
  picks: [],
  ...over,
});
const draft = (d: Partial<ExerciseDraft> = {}): ExerciseDraft => ({
  id: null,
  value: parseSen("300000.00"),
  methodCode: "open_quotation",
  methodReason: "",
  externalRouteNote: "",
  parentContractRef: null,
  scope: [{ kind: "MEASURED_CONSTRUCTION", amount: parseSen("300000.00"), description: "" }],
  contractTypeCode: null,
  typeReason: "",
  typePersonId: null,
  basisCode: "BQ",
  justificationReasonCode: null,
  justificationText: "",
  evidenceNote: "",
  dossierReference: null,
  emergencyTrigger: "",
  coordinationMeetingOn: null,
  ...d,
});
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("an exercise judged whole", () => {
  it("RM300,000.00 on open quotation: quotation regime, derived Works, on the boundary and not ruled", () => {
    const ev = evaluateExercise(draft(), ctx());
    expect(ev.bands.regime).toBe("quotation");
    expect(ev.type).toEqual({ state: "DERIVED", code: "WORK", faults: [] });
    expect(codes(ev.findings)).toContain("BOUNDARY_NOT_RULED");
    expect(saveBlockers(ev.findings)).toEqual([]);
  });
  it("a half-written draft may be saved; what it does give must be real", () => {
    const half = evaluateExercise(draft({ methodCode: "selective_direct", methodReason: "Sole distributor", basisCode: null }), ctx());
    expect(codes(half.findings)).toContain("REASON_REQUIRED");
    expect(saveBlockers(half.findings)).toEqual([]);
    const wrong = evaluateExercise(draft({ value: parseSen("330000.01"), scope: [{ kind: "GOODS_DELIVERED", amount: parseSen("330000.01"), description: "" }] }), ctx());
    expect(codes(saveBlockers(wrong.findings))).toContain("EXCEEDS_APPROVED_VALUE");
  });
  it("an override of the proposed method is refused on save without its reason", () => {
    const ev = evaluateExercise(draft({ methodCode: "direct" }), ctx());
    expect(codes(saveBlockers(ev.findings))).toEqual(["OVERRIDE_REASON_REQUIRED"]);
  });
  it("in words: no finding, state or step reads as a code", () => {
    const ev = evaluateExercise(draft({ methodCode: "selective_quotation", methodReason: "Two firms only", value: parseSen("80000.00"), scope: [{ kind: "GOODS_DELIVERED", amount: parseSen("80000.00"), description: "" }] }), ctx());
    const p = presentEvaluation(ev, {
      name: (c) => SPEC_MATRIX.roles[c]?.nameEn ?? "An office",
      typeName: (c) => SPEC_TYPES.find((t) => t.code === c)!.nameEn,
      taxonomyName: (c) => `Classification ${c.length}`,
      valueName: () => "A value",
      approved: ctx().approved,
      boundarySource: "",
    });
    expect(p.nameApproval?.steps.map((s) => s.role)).toEqual(["Head of Department", "Head of Department", "Head of Division", "Functional Director"]);
    const text = JSON.stringify({ ...p, appointment: { ...p.appointment, steps: p.appointment.steps.map((s) => ({ ...s, actCode: "" })) }, nameApproval: { ...p.nameApproval, steps: [] } });
    expect(text).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
    expect(text).not.toMatch(/\b(GTE?|DERIVED|CHOSEN|AMBIGUOUS)\b/);
  });
});
