import { describe, expect, it } from "vitest";

import { BEHAVIOUR_KEYS } from "./profile";
import { BEHAVIOUR_LABEL, findingsShownTo, findingText, findingTextFor } from "./labels";
import type { Finding } from "./types";

/// Every finding code a module in src/lib/method returns. A new code without words
/// falls through to the default and fails here.
const CODES = [
  "NO_APPROVED_ROUTE", "EXCEEDS_APPROVED_VALUE", "SPLIT_ACROSS_REGIME", "REQUISITION_BAND_CHANGED", "REQUISITION_BAND_NOT_CHECKED",
  "BOUNDARY_NOT_RULED", "TERMS_NOT_SET", "TERMS_NO_BAND", "TERMS_OVERLAP", "APPOINTMENT_NO_RULE", "APPOINTMENT_NO_METHOD_KEY", "DEPENDS_ON_METHOD",
  "TENDER_NOT_ABOVE_QUOTATION", "TENDER_FLOOR_NOT_BOUNDARY", "BOUNDARY_SOURCE_REQUIRED", "SWITCH_GOVERNS_NO_REGIME", "BOUNDARY_UNDECIDED", "REGIME_RULE_DISAGREE",
  "METHODS_NOT_SET", "SOURCING_NOT_PERMITTED", "METHOD_REQUIRED", "METHOD_UNKNOWN", "METHOD_RETIRED", "METHOD_NOT_IN_REGIME", "OVERRIDE_REASON_REQUIRED",
  "EXTERNAL_ROUTE_NOTE_REQUIRED", "JUSTIFICATION_REQUIRED", "PARENT_CONTRACT_REQUIRED",
  "NAME_NOT_REQUESTED", "NAME_NOT_APPROVED", "NAME_REJECTED",
  "ITEMS_NOT_SET", "ITEM_EMPTY", "NOT_DRAFT", "NOT_SUBMITTED", "NOT_REVIEWED", "REVIEWER_REQUIRED", "FUTURE_DATE", "TIME_ZONE_UNSET",
  "REASONS_NOT_SET", "REASON_REQUIRED", "REASON_UNKNOWN", "EVIDENCE_NOT_ATTACHED", "DOSSIER_UNNUMBERED", "COORDINATION_RECORD_REQUIRED", "SCOPE_DOCUMENT_NOT_ATTACHED",
  "SCOPE_REQUIRED", "SCOPE_AMOUNT_INVALID", "SCOPE_SUM_MISMATCH", "LOCKED", "TYPE_REQUIRED", "TYPE_UNKNOWN", "TYPE_REASON_REQUIRED", "TYPE_PERSON_REQUIRED",
  "REQUISITION_NOT_APPROVED", "SOURCING_NOT_RECORDED", "TERMINAL", "NOT_ALLOWED", "CANCEL_REASON_REQUIRED", "METHOD_NOT_SET", "TYPE_NOT_SET", "BASIS_NOT_SET",
  "PROPOSAL_NOT_REVIEWED", "TAXONOMY_AMBIGUOUS", "BLOCKING_FAULTS", "BASIS_UNKNOWN",
  "DETERMINATION_CHANGED", "FULLY_IN_EXERCISES", "NAME_EXERCISE_CANCELLED", "NAME_NOT_ASKED", "NAME_ALREADY_REQUESTED",
  "NAME_REJECTION_UNRESOLVED", "GATES_NOT_DETERMINED", "GATE_AWAITING", "GATE_RETURNED", "GATE_ENDED", "GATE_OUTCOME_NOT_RECORDED",
];

describe("every finding has words, and none shows a code", () => {
  it.each(CODES)("%s", (code) => {
    const text = findingText({ code, level: "block" });
    expect(text).not.toBe("A check did not pass.");
    expect(text).not.toMatch(/\b[A-Z]{2,}_[A-Z_]+\b/);
  });
  it("every behaviour has a label", () => {
    for (const k of BEHAVIOUR_KEYS) expect(BEHAVIOUR_LABEL[k]).toBeTruthy();
  });
});

describe("the boundary in one sentence (UX 9)", () => {
  it("says which band, at which value, and whether it is ruled", async () => {
    const { boundarySentence } = await import("./labels");
    expect(boundarySentence("GT", "300000", "ASSUMED")).toBe("A value exactly on RM300,000 falls in the quotation band (assumed; not yet ruled).");
    expect(boundarySentence("GTE", "300000", "STATED")).toBe("A value exactly on RM300,000 falls in the tender band (stated).");
  });
  it("the logged exception does not contradict itself", () => {
    const t = findingText({ code: "BOUNDARY_NOT_RULED", level: "warn", data: { operator: "GT", value: "300000", provenance: "ASSUMED" } });
    expect(t).toMatch(/falls in the quotation band \(assumed; not yet ruled\)/);
    expect(t).not.toMatch(/lower regime|upper regime/);
  });
});

describe("what a reader who may not read the estimate is told (FR-MTD-007, Phase 3a review)", () => {
  const exceeds: Finding = { code: "EXCEEDS_APPROVED_VALUE", level: "block", data: { combined: "RM 912,345.67", approved: "RM 500,000.00" } };
  const split: Finding = { code: "SPLIT_ACROSS_REGIME", level: "warn", data: { combined: "RM 912,345.67", own: "tender", together: "tender" } };
  const onBoundary: Finding = { code: "BOUNDARY_NOT_RULED", level: "warn", data: { operator: "GT", value: "300000.00", provenance: "ASSUMED" } };

  it("a refusal that adds up the requisition's exercises states no sum and no amount where they are withheld", () => {
    for (const f of [exceeds, split]) {
      expect(findingText(f)).toMatch(/RM/);
      expect(findingTextFor(f, true)).not.toMatch(/RM|\d{3}/);
      expect(findingTextFor(f, false)).toBe(findingText(f));
    }
  });
  it("the finding that a value is exactly on a band boundary is left out for that reader, and every finding is kept for one who may read it", () => {
    expect(findingsShownTo([exceeds, onBoundary, split], true)).toEqual([exceeds, split]);
    expect(findingsShownTo([exceeds, onBoundary, split], false)).toEqual([exceeds, onBoundary, split]);
    const given = [onBoundary];
    findingsShownTo(given, true);
    expect(given).toEqual([onBoundary]);
  });
});
