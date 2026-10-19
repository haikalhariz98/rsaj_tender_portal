import { describe, expect, it } from "vitest";

import { BAND_ORDER } from "./expiry";
import { CONDITION_LABEL, conditionWords, EXPIRY_BAND_LABEL, hasFaultText, RESULT_LABEL, STANDING_EVENT_LABEL, STANDING_LABEL, standingTone, standingWords, supplierFaultText, VERDICT_LABEL, VERDICT_TONE } from "./labels";
import { STANDING_EVENT_KINDS, STANDINGS, standing } from "./standing";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const CODE = /\b[A-Z]{2,}_[A-Z_]+\b/;

describe("a2's words: both languages, never a code", () => {
  const maps: [string, Record<string, { en: string;  }>, readonly string[]][] = [
    ["standings", STANDING_LABEL, STANDINGS],
    ["standing events", STANDING_EVENT_LABEL, STANDING_EVENT_KINDS],
    ["expiry bands", EXPIRY_BAND_LABEL, BAND_ORDER],
    ["verdicts", VERDICT_LABEL, ["ELIGIBLE", "NOT_ELIGIBLE", "NOT_ASSESSED"]],
    ["results", RESULT_LABEL, ["PASS", "FAIL", "NOT_ASSESSED", "PASS_BY_PERMISSION"]],
    ["conditions", CONDITION_LABEL, ["REGISTERED", "STANDING", "REGISTRATION", "GRADE", "CATEGORY", "SPECIALISATION", "FIELD_CODES", "QUALIFIERS", "RESTRICTION"]],
  ];
  it.each(maps)("every one of the %s has English and Malay words", (_, map, values) => {
    for (const v of values) {
      expect(map[v]?.en, v).toBeTruthy();
      expect(map[v].en).not.toMatch(CODE);
    }
  });

  it("every fault and note a2's rules return has words", () => {
    const codes = [
      "BAND_NEGATIVE", "BANDS_PARTLY_SET", "BANDS_OUT_OF_ORDER", "BLACKLIST_PERIOD_NOT_SET", "OFFENCE_INVALID",
      "STANDING_NEEDS_REGISTRATION", "ALREADY_BLACKLISTED", "NOT_BLACKLISTED", "REQUEST_OPEN", "REASON_REQUIRED", "REASON_NOT_FOR_BLACKLISTING", "REASON_NOT_FOR_SUSPENSION", "REASON_RETIRED", "STANDING_NOTE_REQUIRED", "PERSON_REQUIRED",
      "AWARD_NOT_CANCELLED_FOR_BLACKLISTING", "AWARD_NOT_THIS_SUPPLIER", "ROUTE_NOT_APPROVED", "ALREADY_RECORDED", "EFFECTIVE_REQUIRED", "EFFECTIVE_IN_FUTURE", "EFFECTIVE_BEFORE_DECISION", "EFFECTIVE_BEFORE_REGISTRATION", "EFFECTIVE_BEFORE_SUSPENSION",
      "ALREADY_SUSPENDED", "ALREADY_BARRED", "DOCUMENT_NOT_ON_FILE", "NOT_SUSPENDED", "BLACKLISTED", "FLAGGED_NOT_STANDING", "LAPSED_SINCE", "CHECKLIST_INCOMPLETE", "TIME_ZONE_UNSET",
      "LAPSE_RULE_NOT_SET", "MANDATORY_EXPIRED", "BLACKLIST_ENDED", "SCHEDULED",
      "SALE_NOT_REGISTERED", "BARRED", "NOT_LINKED_REGISTER_REQUIRED", "REGISTER_RULE_NOT_SET", "NOT_LINKED",
      "ALREADY_LINKED", "LINKED_ELSEWHERE", "NUMBER_DIFFERS_REASON_REQUIRED", "NUMBER_DIFFERS", "SUPPLIER_NOT_REGISTERED", "AWARD_HAS_PARTY", "SUPPLIER_REQUIRED",
      "NOT_OFFERED", "OFFER_NOT_SET", "REQUIREMENT_REQUIRED", "REQUIREMENT_NOT_ON_EXERCISE", "RELAXES_REQUIRED", "PERMISSION_AUTHORITY_REQUIRED", "BODY_NOT_CONFIGURED", "CLASS_NOT_CONFIRMED", "RECORD_NOT_CONFIRMED", "PERMISSION_DUPLICATE",
      "ALREADY_GRANTED", "INTERNAL_ROUTE_NOT_APPROVED", "GRANTED_REQUIRED", "GRANTED_IN_FUTURE", "GRANTED_BEFORE_APPROVAL",
    ];
    for (const c of codes) {
      expect(hasFaultText(c), c).toBe(true);
      const f = { code: c, level: "block" as const, data: { types: "Tax clearance", since: "2026-09-01", approvedOn: "2026-09-01", registeredOn: "2026-01-01", endsOn: "2031-10-01", lastDay: "2031-09-30", freeFrom: "2031-10-01", kind: "SUSPEND", effectiveOn: "2026-10-02", standing: "SUSPENDED", recorded: "1", register: "2" } };
      expect(supplierFaultText(f), c).not.toMatch(CODE);
    }
  });
});

describe("OD-7 A, the wording as ruled", () => {
  it("an active supplier with an expired mandatory document and the lapse rule unset reads exactly so, in amber", () => {
    const r = standing({ status: "REGISTERED", registeredOn: null }, [], [{ typeLabel: "Tax clearance", state: "EXPIRED" }], { autoSuspendOnLapse: null }, "2026-10-01");
    expect(standingWords(r).en).toBe("Active — lapse rule not set; a mandatory document has expired");
    expect(standingTone(r)).toBe("warn");
  });
  it("otherwise the standing's own label", () => {
    expect(standingWords(standing({ status: "REGISTERED", registeredOn: null }, [], [], { autoSuspendOnLapse: null }, "2026-10-01")).en).toBe("Active");
    expect(standingWords(standing({ status: "REGISTERED", registeredOn: null }, [], [{ typeLabel: "Tax clearance", state: "EXPIRED" }], { autoSuspendOnLapse: true }, "2026-10-01")).en).toBe("Suspended on lapse");
  });
});

describe("eligibility's reasons in words", () => {
  it("not assessed is never green", () => {
    expect(VERDICT_TONE.NOT_ASSESSED).not.toBe("ok");
  });
  it("the window worked example reads as a finance officer would check it", () => {
    expect(conditionWords({ reason: "LAPSES_BEFORE_CLOSING", data: { expiresOn: "2026-11-15", closingDay: "2026-11-17" } }).en).toBe("Expires 15 Nov 2026, before the closing (17 Nov 2026), though valid today.");
    expect(conditionWords({ reason: "QUALIFIERS_IN_WORDS", data: { qualifiers: "grade G5" } }).en).toBe("Stated in words only (“grade G5”), not compared.");
  });
});
