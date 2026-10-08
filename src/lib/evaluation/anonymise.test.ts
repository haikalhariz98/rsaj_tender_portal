import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { anonymisedScoringWords, anonymousBidder, bidIdentityAtStage, bidInSentence, criterionNeedsName, faultsForBid, identityHeld, pseudonymNumbers, stageAnonymity, stageReveals } from "./anonymise";
import { policyFromSnapshot } from "./start";
import { TA109 } from "./ta109-fixture";

/**
 * Anonymised technical scoring (FR-EVL-020, Phase 3b): the technical stage shows "Bidder n", names a bid only for a criterion that needs the named contractor, and the reveal is
 * asked of the gate (which logs it) before any name is put in the view. Unset is not on.
 */

const technical = TA109.stages.find((s) => s.code === "TECHNICAL")!;
const financial = TA109.stages.find((s) => s.code === "FINANCIAL")!;
const checklist = TA109.stages.find((s) => s.code === "COMPLIANCE")!;

describe("which stage is anonymous", () => {
  it("only the technical scored stage of a version that froze the switch on", () => {
    expect(stageAnonymity(technical, true).anonymous).toBe(true);
    expect(stageAnonymity(technical, false).anonymous).toBe(false);
    expect(stageAnonymity(technical, null).anonymous).toBe(false);
    expect(stageAnonymity(technical, undefined).anonymous).toBe(false);
  });
  it("not the financial stage, which is scored but is about the price, and not a checklist", () => {
    expect(stageAnonymity(financial, true).anonymous).toBe(false);
    expect(stageAnonymity(checklist, true).anonymous).toBe(false);
  });
  // Changed with the review of Phase 3b (FR-EVL-020): the number is the bid's pseudonym number, no longer the opening's listing number, which the opening publishes beside the name.
  it("a bid is called Bidder n by its pseudonym number", () => {
    expect(anonymousBidder(3)).toBe("Bidder 3");
  });
});

describe("which criteria name the bidder", () => {
  it("the criterion the model says needs the named contractor, and the contractor performance percentage whatever the model says", () => {
    expect(criterionNeedsName({ needsNamedContractor: true, computedInput: "NONE" })).toBe(true);
    expect(criterionNeedsName({ needsNamedContractor: false, computedInput: "CPR_PERCENT" })).toBe(true);
    expect(criterionNeedsName({ needsNamedContractor: false, computedInput: "NONE" })).toBe(false);
  });
  it("on the technical stage the staff criterion names the bidder and the rest do not", () => {
    const a = stageAnonymity(technical, true);
    expect([...a.namedFor]).toEqual(["STAFF"]);
    expect(stageReveals(a)).toBe(true);
  });
  it("a stage with no such criterion has no reveal to ask for", () => {
    const blind = { ...technical, criteria: technical.criteria.filter((c) => c.code !== "STAFF") };
    expect(stageReveals(stageAnonymity(blind, true))).toBe(false);
    expect(stageReveals(stageAnonymity(technical, false))).toBe(false);
  });
});

describe("the switch is frozen onto a version when it starts, and unset is not on", () => {
  it("is read from the snapshot as a boolean or not at all", () => {
    expect(policyFromSnapshot({ scoreDecimals: 2, anonymisedScoring: true }).anonymisedScoring).toBe(true);
    expect(policyFromSnapshot({ scoreDecimals: 2, anonymisedScoring: false }).anonymisedScoring).toBe(false);
    expect(policyFromSnapshot({ scoreDecimals: 2 }).anonymisedScoring).toBeNull();
    expect(policyFromSnapshot({ anonymisedScoring: "yes" }).anonymisedScoring).toBeNull();
    expect(policyFromSnapshot(null).anonymisedScoring).toBeNull();
  });
  it("says in words which of the three states it is", () => {
    expect(anonymisedScoringWords(true).state).toBe("ON");
    expect(anonymisedScoringWords(false).state).toBe("OFF");
    expect(anonymisedScoringWords(null).state).toBe("NOT_SET");
    expect(anonymisedScoringWords(null).en).toMatch(/Not set/);
    for (const s of [true, false, null]) expect(anonymisedScoringWords(s).en).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });
  it("the version freezes it, and the migration adds it as a nullable column with no default", () => {
    const start = readFileSync(join(process.cwd(), "src/app/sourcing/[id]/evaluation/actions.ts"), "utf8");
    expect(start).toMatch(/anonymisedScoring: c\.policy!\.anonymisedScoring \?\? null/);
    const migration = readFileSync(join(process.cwd(), "prisma/migrations/20261008140000_evaluation_policy_anonymised_scoring/migration.sql"), "utf8");
    expect(migration).toMatch(/ADD COLUMN\s+"anonymisedScoring" BOOLEAN,/);
    expect(migration.split("\n").filter((l) => !l.startsWith("--")).join("\n")).not.toMatch(/DEFAULT/i);
  });
});

describe("the view names a bidder only after the reveal was asked", () => {
  const read = readFileSync(join(process.cwd(), "src/lib/evaluation/read.ts"), "utf8");
  it("asks the identity gate before the stages are built, and only when a stage reveals", () => {
    const reveal = read.indexOf("(await gates.identity()).state === \"GRANTED\"");
    const stages = read.indexOf("const stages = f.model.stages.map((s) => stageView(");
    expect(reveal).toBeGreaterThan(-1);
    expect(reveal).toBeLessThan(stages);
    expect(read).toMatch(/const revealing = f\.model\.stages\.some\(\(s\) => stageReveals\(stageAnonymity\(s, f\.anonymised\)\)\)/);
  });
  it("puts a name in a score row only for a criterion that names the bidder, once revealed; every other row carries the anonymous name", () => {
    expect(read).toMatch(/named: anon\.namedFor\.has\(cr\.code\) && reveal \? b\.bidderName : null/);
    // Changed with the review of Phase 3b: the row is built by `bidIdentityAtStage` from the pseudonym, so the listing number cannot reach an anonymous row.
    expect(read).toMatch(/\.\.\.bidIdentityAtStage\(anon\.anonymous, b, pseudonym\)/);
    expect(read).not.toMatch(/anonymousBidder\(b\.listingNo\)/);
  });
});

describe("the pseudonym is not derivable from the opening (FR-EVL-020, review of Phase 3b)", () => {
  const ids = ["bid_a", "bid_b", "bid_c", "bid_d", "bid_e", "bid_f", "bid_g", "bid_h"];
  it("numbers each bid 1 to n once, the same way every time the version is read", () => {
    const a = pseudonymNumbers("eval_1", ids);
    expect([...a.values()].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...pseudonymNumbers("eval_1", [...ids].reverse()).entries()].sort()).toEqual([...a.entries()].sort());
  });
  it("does not follow the order the bids were opened in, and another version numbers them another way", () => {
    const a = pseudonymNumbers("eval_1", ids);
    expect(ids.map((id) => a.get(id))).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(ids.map((id) => pseudonymNumbers("eval_2", ids).get(id))).not.toEqual(ids.map((id) => a.get(id)));
  });
  it("an anonymous row carries neither the bidder's name nor its listing number, in any field", () => {
    const row = bidIdentityAtStage(true, { listingNo: 7, bidderName: "Syarikat Contoh" }, 2);
    expect(row).toEqual({ listingNo: 2, ref: "Bidder 2", anonymous: true, bidder: "Bidder 2" });
    expect(JSON.stringify(row)).not.toMatch(/Syarikat|No\. 7|7/);
  });
  it("an open row is the listing number and the name, as before", () => {
    expect(bidIdentityAtStage(false, { listingNo: 7, bidderName: "Syarikat Contoh" }, 2)).toEqual({ listingNo: 7, ref: "No. 7", anonymous: false, bidder: "Syarikat Contoh" });
  });
  it("a finding about a bid on an anonymous stage is renamed to the pseudonym; on an open stage it is untouched", () => {
    const f = { code: "SCORE_MISSING", data: { listingNo: 7, criterion: "Staff" } };
    const [a] = faultsForBid(true, [f], 2);
    expect(a.data).toMatchObject({ listingNo: 2, bidRef: "Bidder 2" });
    expect(JSON.stringify(a)).not.toMatch(/7/);
    expect(faultsForBid(false, [f], 2)[0]).toBe(f);
  });
  it("a reference reads in a sentence as it is: bid No. 3, or Bidder 3", () => {
    expect(bidInSentence("No. 3")).toBe("bid No. 3");
    expect(bidInSentence("Bidder 3")).toBe("Bidder 3");
  });
  it("identities are held while the switch is on and an anonymous technical stage is not yet submitted, and not otherwise", () => {
    const stage = (submitted: boolean) => [{ kind: technical.kind, capitalBase: technical.capitalBase, criteria: technical.criteria, submitted }];
    expect(identityHeld(true, stage(false))).toBe(true);
    expect(identityHeld(true, stage(true))).toBe(false);
    expect(identityHeld(false, stage(false))).toBe(false);
    expect(identityHeld(null, stage(false))).toBe(false);
  });
  it("the words for the switch say the other lists still name the bidders, rather than claiming they are hidden from the team", () => {
    expect(anonymisedScoringWords(true).en).toMatch(/still name the bidders/);
    expect(anonymisedScoringWords(true).en).toMatch(/not the opening's listing number/);
  });
});
