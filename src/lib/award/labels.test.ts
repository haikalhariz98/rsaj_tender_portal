import { describe, expect, it } from "vitest";

import { findingText as methodFindingText } from "@/lib/method/labels";

import { awardFindingText } from "./labels";

// Every code the award's own rules return has its own text: none falls through to
// another module's wording, and none renders a code.
const CODES = [
  "REGIME_NOT_DETERMINED", "NO_AWARD_IN_REGIME", "INSTRUMENT_NOT_SET", "VALUE_NOT_POSITIVE", "EXCEEDS_APPROVED_VALUE", "VALUE_OUTSIDE_EXERCISE_REGIME", "APPOINTMENT_BAND_CHANGED", "ABOVE_ESTIMATE",
  "NOT_DRAFT", "EXERCISE_NOT_IN_PREPARATION", "ANOTHER_ROUTE_OPEN", "DEPENDS_ON_METHOD", "NO_METHOD_KEY", "NO_RULE", "ROUTE_ERROR", "EVIDENCE_NOT_ATTACHED",
  "NOT_APPROVED_YET", "EXERCISE_NOT_OPEN", "REQUISITION_NOT_APPROVED", "REQUISITION_NOT_ROUTED", "SOURCING_NOT_PERMITTED", "SOURCING_NOT_RECORDED", "APPOINTMENT_NOT_APPROVED",
  "COMMITTEE_DECISION_NOT_RECORDED", "NO_COMMITTEE_APPROVAL_IN_ROUTE", "SIGNATORY_UNRESOLVED", "SIGNATORY_AMBIGUOUS", "SIGNATORY_GAP", "SIGNATORY_BOUNDARY_UNDECIDED",
  "INDENT_NUMBER_REQUIRED", "INDENT_NUMBER_FORMAT", "INDENT_EXPIRED", "RECIPIENTS_NOT_SET", "REGULATED_NOT_ANSWERED", "TEMPLATE_NOT_SET", "TEMPLATE_TEXT_NOT_SET",
  "TEMPLATE_LANGUAGE_NOT_SET", "TEMPLATE_INCOMPLETE", "TEMPLATE_UNKNOWN_FIELD", "VARIANT_NONE", "VARIANT_AMBIGUOUS", "TERMS_NOT_SET", "TERMS_UNDECIDED", "RETENTION_REQUIRED",
  "DLP_REQUIRED", "BOND_NOT_DECIDED", "BOND_REASON_REQUIRED", "BOND_BASIS_NOT_SET", "CONTRACT_SERIES_NOT_SET", "QUOTATION_KEY_NOT_SET", "START_DATE_REQUIRED",
];

describe("award fault texts", () => {
  it("every code has its own words, and none shows a code", () => {
    for (const code of CODES) {
      const text = awardFindingText({ code, level: "block", data: { kind: "LETTER_OF_ACCEPTANCE", fields: "awardee.name", committee: "Tender Board", template: "T", count: 1, regime: "tender", fresh: "tender", exercise: "quotation" } });
      expect(text, code).not.toMatch(/[A-Z]{2,}_[A-Z_]+/);
      if (code !== "NO_APPROVED_ROUTE") expect(text, code).not.toBe(methodFindingText({ code: "__none__", level: "block" }));
    }
  });
  it("the template's missing fields are named by label, not by key", () => {
    const t = awardFindingText({ code: "TEMPLATE_INCOMPLETE", level: "block", data: { kind: "LETTER_OF_ACCEPTANCE", fields: "awardee.name,approver.receivedOn" } });
    expect(t).toContain("awardee, date received by the approver not recorded");
    expect(t).not.toContain("awardee.name");
  });
});
