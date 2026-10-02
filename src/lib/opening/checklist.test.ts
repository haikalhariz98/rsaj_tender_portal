import { describe, expect, it } from "vitest";

import { answerFaults, checklistFromSnapshot, missingItems, openingChecklist, unansweredItems } from "./checklist";
import { CHECKLIST, answers } from "./fixture";

/**
 * FR-OPN-008 with the 6.6 ruling: the mandatory parts a bidder returns (the declaration by
 * definition), then every issued addendum; a mandatory part whose return is not set is not judged.
 */

const parts = [
  { partCode: "form", label: "Form of tender", role: "FORM_OF_TENDER", mandatory: true, returnedByBidder: true, sortOrder: 2 },
  { partCode: "cond", label: "Conditions of contract", role: "CONDITIONS", mandatory: true, returnedByBidder: false, sortOrder: 3 },
  { partCode: "decl", label: "Declaration and letter of authorisation", role: "DECLARATION", mandatory: true, returnedByBidder: null, sortOrder: 9 },
  { partCode: "spec", label: "Specification", role: "SPECIFICATION", mandatory: true, returnedByBidder: null, sortOrder: 6 },
  { partCode: "draw", label: "Drawings", role: "DRAWINGS", mandatory: false, returnedByBidder: true, sortOrder: 5 },
];
const addenda = [{ number: 2, title: "Revised drawings" }, { number: 1, title: "Clarification" }];

describe("the checklist at opening", () => {
  it("is the mandatory parts a bidder returns, in print order, the declaration by definition, then addenda 1..n", () => {
    const c = openingChecklist({ parts, addenda });
    expect(c.items.map((i) => i.key)).toEqual(["form", "decl", "addendum:1", "addendum:2"]);
  });
  it("a mandatory part whose return is not set is not judged; one not returned is listed as such", () => {
    const c = openingChecklist({ parts, addenda });
    expect(c.notJudged).toEqual(["Specification"]);
    expect(c.notReturned).toEqual(["Conditions of contract"]);
  });
  it("issued addenda stay on the checklist even with no part returned", () => {
    expect(openingChecklist({ parts: [], addenda }).items.map((i) => i.key)).toEqual(["addendum:1", "addendum:2"]);
  });
  it("round-trips through its frozen snapshot", () => {
    const c = openingChecklist({ parts, addenda });
    expect(checklistFromSnapshot(JSON.parse(JSON.stringify(c)))).toEqual(c);
    expect(checklistFromSnapshot(null)).toEqual({ items: [], notJudged: [], notReturned: [] });
  });
});

describe("answers", () => {
  it("missing is only ABSENT; NOT_APPLICABLE is not missing; unanswered is said", () => {
    const a = answers({ form: "ABSENT", decl: "NOT_APPLICABLE" });
    expect(missingItems(CHECKLIST.items, a).map((i) => i.key)).toEqual(["form"]);
    expect(unansweredItems(CHECKLIST.items, a).map((i) => i.key)).toEqual(["addendum:1"]);
  });
  it("an answer is for an item on the frozen checklist", () => {
    expect(answerFaults(CHECKLIST.items, "nope", "PRESENT").map((f) => f.code)).toEqual(["NOT_ON_CHECKLIST"]);
    expect(answerFaults(CHECKLIST.items, "form", null).map((f) => f.code)).toEqual(["ANSWER_REQUIRED"]);
  });
});
