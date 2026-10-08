import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { anonymisedScoringWords, anonymousBidder, criterionNeedsName, stageAnonymity, stageReveals } from "./anonymise";
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
  it("a bid is called Bidder n by its listing number", () => {
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
    expect(read).toMatch(/bidder: anon\.anonymous \? anonymousBidder\(b\.listingNo\) : b\.bidderName/);
  });
});
