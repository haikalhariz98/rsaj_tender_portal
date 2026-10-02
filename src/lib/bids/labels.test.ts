import { describe, expect, it } from "vitest";

import { bidFindingText } from "./labels";

/// Every code a bid rule can return, so a new one without words fails here.
const CODES = [
  "TIME_ZONE_UNSET", "CLOSING_NOT_SET", "NOT_PUBLISHED", "CANCELLED", "EXERCISE_CANCELLED", "AFTER_OPENING",
  "PERSON_REQUIRED", "MARKINGS_REQUIRED", "CHANNEL_NOT_FOR_OFFICER", "KIND_NOT_FOR_RECEIPT", "ENTERED_NOT_BEFORE_RECORDING", "BEFORE_WINDOW", "REASON_REQUIRED",
  "PARENT_ONLY_FOR_ALTERNATIVE", "PARENT_NOT_A_BID", "RECORDED_AFTER_CLOSING", "STATED_BEFORE_CLOSING",
  "AFTER_CLOSING", "ENVELOPE_LATE", "ALREADY_WITHDRAWN", "NOT_A_BID", "NOT_WITHDRAWN", "ALREADY_RETURNED", "DAY_IN_FUTURE", "BEFORE_WITHDRAWAL",
  "CORRECTION_CLOSED", "IMMUTABLE_FIELD", "NOTHING_CHANGED", "WITHDRAWN",
  "BEFORE_CLOSING", "ALREADY_LOCKED", "OPENED",
  "LATE_UNDECIDED", "COMMITTEE_NOT_SET", "NOT_LATE", "ALREADY_TABLED", "ALREADY_DECIDED", "OTHER_COMMITTEE", "SITTING_CLOSED",
  "VALIDITY_NOT_SET", "BID_VALIDITY_EXPIRED", "VALIDITY_NOT_JUDGED", "NOT_CLOSED", "NOT_LATER", "PARTY_REQUIRED", "NOT_RECOMMENDED",
  "CONSENT_DAY_REQUIRED", "CONSENT_DAY_IN_FUTURE", "PENDING_EXISTS", "ALREADY_APPLIED", "CONSENT_REQUIRED",
  "LODGEMENT_CLOSED", "CONSEQUENCE_NOT_SET", "WINDOW_NOT_EDITABLE", "VALIDITY_ALREADY_SET", "DAYS_REQUIRED", "PROVENANCE_REQUIRED",
];

describe("bid finding words", () => {
  it.each(CODES)("%s has its own words, never the fallback and never the code", (code) => {
    const text = bidFindingText({ code, level: "block" });
    expect(text).not.toBe(bidFindingText({ code: "NO_SUCH_CODE", level: "block" }));
    expect(text).not.toMatch(/[A-Z]{3,}_[A-Z]/);
  });
  it("an undecided late envelope names where to act, and the unset committee's setting", () => {
    expect(bidFindingText({ code: "LATE_UNDECIDED", level: "block", data: { count: 2, committeeSet: "yes" } })).toMatch(/^2 late envelopes wait/);
    expect(bidFindingText({ code: "LATE_UNDECIDED", level: "block", data: { count: 1, committeeSet: "no" } })).toMatch(/Configuration › Invitation/);
  });
  it("an expired validity names the day and the way out", () => {
    expect(bidFindingText({ code: "BID_VALIDITY_EXPIRED", level: "block", data: { expiry: "2027-03-17" } })).toMatch(/17 Mar 2027.*extension/);
  });
});
