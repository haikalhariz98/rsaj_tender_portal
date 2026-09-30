import { describe, expect, it } from "vitest";

import { determinationDrift, issueAuditNames } from "./drift";
import { findingText } from "./labels";

const stored = { contractTypeCode: "works", contractTypeState: "DERIVED", regime: "quotation", appointmentRuleKey: "q", termsBandKey: "t", boundaryOperator: "GT", restricted: false, proposedMethodCode: "open" };

describe("a classification that changed since the last save (review #2)", () => {
  it("passes when nothing re-derived differs", () => {
    expect(determinationDrift(stored, { ...stored })).toEqual([]);
  });
  it("refuses the move, listing what changed and asking for a re-save", () => {
    const f = determinationDrift(stored, { ...stored, termsBandKey: "other", contractTypeCode: "supply" });
    expect(f[0].level).toBe("block");
    const text = findingText(f[0]);
    expect(text).toMatch(/the contract type, the contract terms band/);
    expect(text).toMatch(/Edit/);
  });
  it("treats unset and missing alike", () => {
    expect(determinationDrift({ ...stored, termsBandKey: null }, { ...stored, termsBandKey: undefined })).toEqual([]);
  });
});

describe("a new approval matrix issue with the same keys (ruling on BD-16)", () => {
  const under = { ...stored, authorityMatrixId: "mx1" };
  it("refuses the move, naming the issue", () => {
    const f = determinationDrift(under, { ...under, authorityMatrixId: "mx2" });
    expect(f).toHaveLength(1);
    expect(f[0].data?.changes).toBe("the approval matrix issue");
    expect(findingText(f[0])).toMatch(/the approval matrix issue/);
  });
  it("passes under the same issue", () => {
    expect(determinationDrift(under, { ...under })).toEqual([]);
  });
  it("is audited by label, and a shared label still reads as a change", () => {
    expect(issueAuditNames({ authorityMatrixId: "mx1", matrixLabel: "Limits, issue 1" }, { authorityMatrixId: "mx2", matrixLabel: "Limits, issue 2" })).toEqual({ before: "Limits, issue 1", after: "Limits, issue 2" });
    const same = issueAuditNames({ authorityMatrixId: "mx1", matrixLabel: "Limits" }, { authorityMatrixId: "mx2", matrixLabel: "Limits" });
    expect(same.before).not.toBe(same.after);
    expect(same.after).not.toMatch(/mx2/);
    expect(issueAuditNames(null, { authorityMatrixId: "mx1", matrixLabel: "Limits" })).toEqual({ before: null, after: "Limits" });
    expect(issueAuditNames({ authorityMatrixId: "mx1", matrixLabel: "Limits" }, { authorityMatrixId: "mx1", matrixLabel: "Limits" })).toEqual({ before: "Limits", after: "Limits" });
  });
});

describe("every drift field is one the save writes (6.3 re-review)", async () => {
  const { DRIFT_FIELDS } = await import("./drift");
  const { evaluateExercise } = await import("./evaluate");
  const { determinationColumns } = await import("./snapshot");
  const { SPEC_BASES, SPEC_MAPPINGS, SPEC_MATRIX, SPEC_METHODS, SPEC_REASONS, SPEC_TAXONOMIES, SPEC_TERMS, SPEC_TYPES } = await import("./fixture");
  const { parseSen } = await import("@/lib/money");
  const on = new Date("2026-09-30T00:00:00Z");
  const ev = evaluateExercise(
    {
      id: null, value: parseSen("300000.00"), methodCode: "open_quotation", methodReason: "", externalRouteNote: "", parentContractRef: null,
      scope: [{ kind: "MEASURED_CONSTRUCTION", amount: parseSen("300000.00"), description: "" }], contractTypeCode: null, typeReason: "", typePersonId: null,
      basisCode: "BQ", justificationReasonCode: null, justificationText: "", evidenceNote: "", dossierReference: null, emergencyTrigger: "", coordinationMeetingOn: null,
    },
    {
      funder: { dal: SPEC_MATRIX, override: null, supersedes: false }, termsBands: SPEC_TERMS, boundaryProvenance: "ASSUMED", posture: "PROCURES", on,
      config: { methods: SPEC_METHODS, reasons: SPEC_REASONS, types: SPEC_TYPES, bases: SPEC_BASES, taxonomies: SPEC_TAXONOMIES, mappings: SPEC_MAPPINGS, policy: { dominanceSharePct: null, provenance: null } },
      approved: { value: parseSen("330000.00"), ruleKey: "REQ_OVER", ruleLabel: "Above RM300,000", checkedAgainstMatrix: true }, siblings: [], lockedAt: null, currentTypeCode: null, picks: [],
    },
  );
  const issue = { id: "mx1", label: "Limits, issue 1", boundarySource: "", matrix: SPEC_MATRIX };
  const cols = determinationColumns(ev, issue, (c) => c, on) as Record<string, unknown>;
  const other = (v: unknown) => (typeof v === "boolean" ? !v : v == null ? "set" : `${String(v)}_changed`);
  it.each(DRIFT_FIELDS.map(([k, label]) => [k, label] as const))("%s is written by the save and refuses the move when it changes", (key, label) => {
    expect(Object.keys(cols)).toContain(key);
    const f = determinationDrift(cols, { ...cols, [key]: other(cols[key]) });
    expect(f[0]?.data?.changes).toBe(label);
  });
});
