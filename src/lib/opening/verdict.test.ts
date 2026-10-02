import { describe, expect, it } from "vitest";

import { ALL_PRESENT, CHECKLIST, answers, open } from "./fixture";
import { judgeBid, verdictFaults, verdictRecord, type BidForVerdict, type VerdictPolicy } from "./verdict";

/**
 * R12, OD-4, FR-DOC-009, FR-BID-006: the opening rejects only on grounds the rules make eliminatory;
 * a gap the method reports goes to the committee; unset blocks.
 */

const bid = (over: Partial<BidForVerdict> = {}): BidForVerdict => ({ saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null, ...over });
const REPORT: VerdictPolicy = { completenessEliminates: false, unpurchased: "REPORT" };
const ELIMINATE: VerdictPolicy = { completenessEliminates: true, unpurchased: "ELIMINATE" };
const v = (x: Partial<Parameters<typeof verdictFaults>[0]>) => verdictFaults({ state: open(), sameOpening: true, bid: bid(), checklist: CHECKLIST, answers: ALL_PRESENT, policy: REPORT, verdict: "PASS", reason: "", ...x }).map((f) => f.code);
const MISSING_FORM = answers({ form: "ABSENT", decl: "PRESENT", "addendum:1": "PRESENT" });

describe("completeness (R12)", () => {
  it("REPORT, and the only ground is completeness → REJECT_ON_COMPLETENESS_NOT_PERMITTED; PASS allowed, reported", () => {
    expect(v({ answers: MISSING_FORM, verdict: "REJECT", reason: "Form missing" })).toEqual(["REJECT_ON_COMPLETENESS_NOT_PERMITTED"]);
    expect(v({ answers: MISSING_FORM, verdict: "PASS" })).toEqual([]);
    expect(judgeBid(bid(), CHECKLIST, MISSING_FORM, REPORT).reported).toEqual(["INCOMPLETE_REPORTED"]);
  });
  it("ELIMINATE and an item ABSENT → PASS_WITH_MISSING_DOCUMENT; REJECT with a reason passes", () => {
    expect(v({ policy: ELIMINATE, answers: MISSING_FORM, verdict: "PASS" })).toEqual(["PASS_WITH_MISSING_DOCUMENT"]);
    expect(v({ policy: ELIMINATE, answers: MISSING_FORM, verdict: "REJECT", reason: "The form of tender is not in the envelope." })).toEqual([]);
    expect(v({ policy: ELIMINATE, answers: MISSING_FORM, verdict: "REJECT", reason: " " })).toEqual(["REASON_REQUIRED"]);
  });
  it("the consequence null → CONSEQUENCE_NOT_SET; items unanswered or not judged block", () => {
    expect(v({ policy: { ...REPORT, completenessEliminates: null } })).toEqual(["CONSEQUENCE_NOT_SET"]);
    expect(v({ answers: answers({ form: "PRESENT" }) })).toEqual(["ANSWERS_INCOMPLETE"]);
    expect(v({ checklist: { ...CHECKLIST, notJudged: ["Specification"] } })).toEqual(["CHECKLIST_NOT_JUDGED"]);
  });
});

describe("the sale (OD-4)", () => {
  it("NO_LIVE_SALE under REPORT → PASS allowed, shown; under ELIMINATE → PASS refused", () => {
    expect(v({ bid: bid({ saleFinding: "NO_LIVE_SALE" }) })).toEqual([]);
    expect(judgeBid(bid({ saleFinding: "NO_LIVE_SALE" }), CHECKLIST, ALL_PRESENT, REPORT).reported).toEqual(["NOT_PURCHASED_REPORTED"]);
    expect(v({ bid: bid({ saleFinding: "NO_LIVE_SALE" }), policy: ELIMINATE })).toEqual(["PASS_WITHOUT_PURCHASE"]);
    expect(v({ bid: bid({ saleFinding: "NOT_ON_INVITEE_LIST" }), policy: ELIMINATE })).toEqual(["PASS_NOT_INVITED"]);
  });
  it("the consequence null → UNPURCHASED_CONSEQUENCE_NOT_SET only where such a bid exists", () => {
    expect(v({ policy: { ...REPORT, unpurchased: null } })).toEqual([]);
    expect(v({ bid: bid({ saleFinding: "NO_LIVE_SALE" }), policy: { ...REPORT, unpurchased: null } })).toEqual(["UNPURCHASED_CONSEQUENCE_NOT_SET"]);
  });
});

describe("eligibility and alternatives", () => {
  it("NOT_EVIDENCED → PASS refused (eliminatory, SK001 7.3.4 (a))", () => expect(v({ bid: bid({ restrictionFinding: "NOT_EVIDENCED" }) })).toEqual(["PASS_NOT_EVIDENCED"]));
  it("an alternative NOT_CONSIDERED → never PASS; NOT_STATED → ALTERNATIVES_NOT_STATED", () => {
    expect(v({ bid: bid({ isAlternative: true, alternativeStatus: "NOT_CONSIDERED" }) })).toEqual(["PASS_ALTERNATIVE_NOT_CONSIDERED"]);
    expect(v({ bid: bid({ isAlternative: true, alternativeStatus: null }) })).toEqual(["ALTERNATIVES_NOT_STATED"]);
    expect(v({ bid: bid({ isAlternative: true, alternativeStatus: "CONSIDERED" }) })).toEqual([]);
  });
  it("REJECT with nothing eliminatory → REJECT_WITHOUT_GROUND; REJECT needs a reason", () => {
    expect(v({ verdict: "REJECT", reason: "Looks too cheap" })).toEqual(["REJECT_WITHOUT_GROUND"]);
    expect(v({ bid: bid({ restrictionFinding: "NOT_EVIDENCED" }), verdict: "REJECT", reason: "" })).toEqual(["REASON_REQUIRED"]);
  });
  it("no verdict chosen; after finalising, never", () => {
    expect(v({ verdict: null })).toEqual(["VERDICT_REQUIRED"]);
    expect(v({ state: open({ finalised: true }) })).toEqual(["FINALISED"]);
  });
  it("the record frozen with the verdict: missing items, grounds, what is reported", () => {
    const j = judgeBid(bid({ saleFinding: "NO_LIVE_SALE" }), CHECKLIST, MISSING_FORM, ELIMINATE);
    expect(verdictRecord(j)).toEqual({ missing: [{ key: "form", label: "Form of tender" }], grounds: ["INCOMPLETE", "NOT_PURCHASED"], reported: [] });
  });
});
