import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { openingFindingText } from "./labels";
import { frozenRuleFaults } from "./start";

/**
 * Review M-4: the main opening is not started on a rule frozen unset that would make finalising it
 * impossible — what follows from an incomplete bid (frozen with the window, 6.6 CR-2), or which
 * parts a bidder returns (frozen with the approved documents). Review S-4: the words never say
 * "set it" — the setting reaches later exercises only; this one's exit is cancellation (C-9).
 */

describe("starting on rules that could never be finalised (M-4)", () => {
  it("both set: nothing", () => expect(frozenRuleFaults({ completenessEliminates: false, checklist: { notJudged: [] } })).toEqual([]));
  it("what follows from an incomplete bid not frozen with the window: refused, naming it", () => {
    expect(frozenRuleFaults({ completenessEliminates: null, checklist: { notJudged: [] } })).toEqual([{ code: "CONSEQUENCE_NOT_SET", level: "block" }]);
  });
  it("a part whose return is not set on the approved documents: refused, naming the parts", () => {
    expect(frozenRuleFaults({ completenessEliminates: true, checklist: { notJudged: ["Specification", "Drawings"] } })).toEqual([{ code: "CHECKLIST_NOT_JUDGED", level: "block", data: { parts: "Specification, Drawings" } }]);
  });
  it("both: both", () => expect(frozenRuleFaults({ completenessEliminates: null, checklist: { notJudged: ["Specification"] } }).map((f) => f.code)).toEqual(["CONSEQUENCE_NOT_SET", "CHECKLIST_NOT_JUDGED"]));
  it("startOpening refuses on them before the panel is assigned, and the Opening section's start reads the same rule", () => {
    const actions = readFileSync("src/app/sourcing/[id]/opening/actions.ts", "utf8");
    const start = actions.slice(actions.indexOf("export async function startOpening"), actions.indexOf("export async function startSupplementaryOpening"));
    expect(start.indexOf("frozenRuleFaults(")).toBeGreaterThan(0);
    expect(start.indexOf("frozenRuleFaults(")).toBeLessThan(start.indexOf("panelFaults("));
    expect(start).toMatch(/if \(blocking\(rf\)\.length\) return refuse\(rf\);/);
    expect(readFileSync("src/lib/opening/read.ts", "utf8")).toMatch(/allowed: allowedOf\(\[\.\.\.sf, \.\.\.rf,/);
  });
});

describe("the words (S-4)", () => {
  const notJudged = openingFindingText({ code: "CHECKLIST_NOT_JUDGED", level: "block", data: { parts: "Specification" } });
  const consequence = openingFindingText({ code: "CONSEQUENCE_NOT_SET", level: "block" });
  it("never 'set it': the answer was not set when the documents were approved; later documents take the setting", () => {
    expect(notJudged).not.toMatch(/\bset it\b/i);
    expect(notJudged).toMatch(/^Whether a bidder returns Specification was not set when the tender documents were approved/);
    expect(notJudged).toMatch(/Documents approved later take the setting \(Configuration › Tender documents\)/);
  });
  it("this exercise's exit is cancellation (C-9)", () => {
    // SR-06 (ruling 9): the Invitation tab is gone; the exit is named at Tender documents, under Publishing.
    expect(notJudged).toMatch(/this exercise's exit is to cancel it, from Tender documents, under Publishing\.$/);
    expect(consequence).not.toMatch(/\bset it\b/i);
    expect(consequence).toMatch(/Windows published later take the setting \(Configuration › Invitation, under Bid receipt, by sourcing method\)/);
    expect(consequence).toMatch(/this exercise's exit is to cancel it/);
  });
});
