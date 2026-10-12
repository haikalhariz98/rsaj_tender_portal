import { describe, expect, it } from "vitest";

import { bidFindingText, officerStatement, RECORDED_LATER_LABEL, RECORDING_STAMP_LABEL } from "./labels";

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
  "LODGEMENT_CLOSED", "CONSEQUENCE_NOT_SET", "WINDOW_NOT_EDITABLE", "VALIDITY_ALREADY_SET", "VALIDITY_REQUIRED", "DAYS_REQUIRED", "PROVENANCE_REQUIRED",
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

describe("the receipt time on the register (6.6 review S-1)", () => {
  it("is labelled the server's recording time, and an after-the-event recording never claims otherwise", () => {
    expect(RECORDING_STAMP_LABEL).toBe("Server's recording time");
    expect(RECORDED_LATER_LABEL).not.toMatch(/server-stamped|entered/i);
  });
  it("the officer's stated time and reason read as the officer's statement", () => {
    expect(officerStatement("17 Nov 2026 · 14:10:00", "Handed in at the counter during an outage")).toBe(
      "The officer's statement: received 17 Nov 2026 · 14:10:00. Why it was recorded after the event: Handed in at the counter during an outage.",
    );
  });
  it("a statement with a part missing says so rather than leaving a gap", () => {
    expect(officerStatement(null, null)).toMatch(/received at a time not recorded.*: not recorded\.$/);
  });
});

describe("the checklist card's words (6.6 review S-5)", () => {
  it("names the parts the approved documents mark mandatory, and says which a bidder returns is not set", async () => {
    const { CHECKLIST_RETURN_NOT_SET, CHECKLIST_TITLE } = await import("./labels");
    expect(CHECKLIST_TITLE).toBe("Parts the approved documents mark mandatory");
    expect(CHECKLIST_RETURN_NOT_SET).toBe("Which of these a bidder returns is not set; the check at opening waits for it.");
    const { readFileSync } = await import("node:fs");
    const tab = readFileSync("src/app/sourcing/[id]/bids/workspace.tsx", "utf8");
    expect(tab).toMatch(/title=\{CHECKLIST_TITLE\}/);
    expect(tab).toMatch(/\{CHECKLIST_RETURN_NOT_SET\}/);
    expect(tab).not.toMatch(/title="Mandatory documents"/);
  });
});

describe("the late-admission hold, worded for where it is read (6.6 review copy nit)", () => {
  const gate = (count: number, extra: Record<string, string> = {}) => bidFindingText({ code: "LATE_UNDECIDED", level: "block", data: { count, committeeSet: "yes", ...extra } });
  it("on the Award tab (and elsewhere) it names the Received section of Bids and opening, and one envelope reads as it", () => {
    expect(gate(1)).toBe("1 late envelope waits for the committee's decision on admission. Table it in the Received section of Bids and opening; it is decided at the sitting, either way.");
    expect(gate(2)).toBe("2 late envelopes wait for the committee's decision on admission. Table each in the Received section of Bids and opening; it is decided at the sitting, either way.");
  });
  it("in the Received section itself it points below, never to the section it is in", () => {
    expect(gate(1, { here: "yes" })).toBe("1 late envelope waits for the committee's decision on admission. Table it below; it is decided at the sitting, either way.");
    expect(gate(1, { here: "yes" })).not.toMatch(/Received section/);
    expect(bidFindingText({ code: "LATE_UNDECIDED", level: "block", data: { count: 2, committeeSet: "no", here: "yes" } })).toMatch(/then table each below\.$/);
  });
});
