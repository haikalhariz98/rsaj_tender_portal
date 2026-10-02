import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { finaliseFaults, type BidForFinalise } from "./finalise";
import { ALL_PRESENT, CHECKLIST, open } from "./fixture";
import { GROUND_LABEL, openingFindingText, REPORTED_LABEL } from "./labels";
import { judgeBid, verdictFaults, type BidForVerdict, type VerdictPolicy } from "./verdict";
import { consequenceFor, frozenConsequence, ineligibleOf } from "@/lib/suppliers/opening-hook";

/**
 * 6.15a (flagged against accepted 6.7, new test only): FR-BID-008 on paper, OD-6 A. A linked bidder the
 * supplier register found not eligible, frozen when its envelope was opened, is eliminated or reported
 * by the register's consequence; unset blocks only where such a bid exists. An offer with no finding
 * is judged exactly as before.
 */

const bid = (over: Partial<BidForVerdict> = {}): BidForVerdict => ({ saleFinding: "LIVE_SALE", restrictionFinding: "NOT_RESTRICTED", isAlternative: false, alternativeStatus: null, ...over });
const policy = (ineligible: VerdictPolicy["ineligible"]): VerdictPolicy => ({ completenessEliminates: false, unpurchased: "REPORT", ineligible });
const v = (b: BidForVerdict, p: VerdictPolicy, verdict: "PASS" | "REJECT", reason = "") => verdictFaults({ state: open(), sameOpening: true, bid: b, checklist: CHECKLIST, answers: ALL_PRESENT, policy: p, verdict, reason }).map((f) => f.code);

describe("the verdict on a bidder the register found not eligible", () => {
  it("ELIMINATE: a ground; carrying it is refused, not carrying it (with a reason) is recorded", () => {
    expect(judgeBid(bid({ ineligible: true }), CHECKLIST, ALL_PRESENT, policy("ELIMINATE")).grounds).toEqual(["NOT_ELIGIBLE"]);
    expect(v(bid({ ineligible: true }), policy("ELIMINATE"), "PASS")).toEqual(["PASS_NOT_ELIGIBLE"]);
    expect(v(bid({ ineligible: true }), policy("ELIMINATE"), "REJECT", "Not eligible on the register.")).toEqual([]);
  });
  it("REPORT: reported to the committee, carried", () => {
    expect(judgeBid(bid({ ineligible: true }), CHECKLIST, ALL_PRESENT, policy("REPORT")).reported).toEqual(["NOT_ELIGIBLE_REPORTED"]);
    expect(v(bid({ ineligible: true }), policy("REPORT"), "PASS")).toEqual([]);
  });
  it("not set: blocks, only where such a finding exists", () => {
    expect(v(bid({ ineligible: true }), policy(null), "PASS")).toEqual(["INELIGIBLE_CONSEQUENCE_NOT_SET"]);
    expect(v(bid({ ineligible: false }), policy(null), "PASS")).toEqual([]);
    expect(v(bid(), { completenessEliminates: false, unpurchased: "REPORT" }, "PASS")).toEqual([]);
  });
  it("has words, never a code", () => {
    expect(GROUND_LABEL.NOT_ELIGIBLE).toMatch(/supplier register/);
    expect(REPORTED_LABEL.NOT_ELIGIBLE_REPORTED).toMatch(/reported to the committee/);
    expect(openingFindingText({ code: "INELIGIBLE_CONSEQUENCE_NOT_SET", level: "block" })).toMatch(/Configuration › Supplier register/);
    expect(openingFindingText({ code: "PASS_NOT_ELIGIBLE", level: "block" })).toMatch(/cannot be carried/);
  });
});

describe("finalising", () => {
  const b = (n: number): BidForFinalise => ({ listingNo: n, initials: ["p1"], unanswered: 0, verdict: "PASS", unpurchased: false });
  const base: Parameters<typeof finaliseFaults>[0] = { state: open(), bids: [b(1)], present: [{ personId: "p1", name: "Aminah" }], signed: ["p1"], pages: 1, checklist: CHECKLIST, withdrawals: [], unopened: 0, admittedOpened: true, completenessEliminates: false, unpurchased: "REPORT", invitedReading: "PURCHASERS", estimate: { required: false, lodged: false, paperAnswered: false }, personActive: true };
  it("the consequence unset blocks only where a not-eligible finding exists", () => {
    expect(finaliseFaults({ ...base, ineligible: { consequence: null, anyFound: true } }).map((f) => f.code)).toEqual(["INELIGIBLE_CONSEQUENCE_NOT_SET"]);
    expect(finaliseFaults({ ...base, ineligible: { consequence: null, anyFound: false } })).toEqual([]);
    expect(finaliseFaults({ ...base, ineligible: { consequence: "REPORT", anyFound: true } })).toEqual([]);
  });
});

describe("the frozen finding and the frozen consequence", () => {
  it("only a NOT_ELIGIBLE finding counts; not assessed or none does not", () => {
    expect(ineligibleOf({ verdict: "NOT_ELIGIBLE", rows: [] })).toBe(true);
    expect(ineligibleOf({ verdict: "NOT_ASSESSED", rows: [] })).toBe(false);
    expect(ineligibleOf(null)).toBe(false);
  });
  it("the consequence frozen at finalising wins over the policy now; not frozen reads the policy", () => {
    expect(frozenConsequence({ ineligible: { consequence: "REPORT" } })).toBe("REPORT");
    expect(frozenConsequence({})).toBeUndefined();
    expect(consequenceFor({ ineligible: { consequence: "REPORT" } }, "ELIMINATE")).toBe("REPORT");
    expect(consequenceFor({}, "ELIMINATE")).toBe("ELIMINATE");
    expect(consequenceFor({ ineligible: { consequence: null } }, "ELIMINATE")).toBeNull();
  });
  it("openEnvelope judges a linked bidder after the exercise side is locked, and only a linked one", () => {
    const src = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const body = src.slice(src.indexOf("export async function openEnvelope("), src.indexOf("export async function recordAlternative("));
    expect(body).toMatch(/const eligibility = party\?\.vendorId \? await eligibilityAtOpening\(tx, l\.org, party\.vendorId, l\.ex\.id\) : null;/);
    expect(body.indexOf("inOpening(")).toBeLessThan(body.indexOf("eligibilityAtOpening("));
    expect(body.indexOf("eligibilityAtOpening(")).toBeLessThan(body.indexOf("tx.openedBid.create"));
  });
});
