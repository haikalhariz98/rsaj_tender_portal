import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { soOriginationFaults } from "./application";
import { variationFaultWords } from "./labels";

/**
 * The product owner's ruling (decisions log, 2026-10-07, 2b review): a Superintending Officer does not decide a variation they originated or keyed. FR-VAR places origination
 * with the implementing department or the S.O.'s Representative, not the S.O., so the refusal costs the specified flow nothing. A permissive gap is the opposite of "unset means
 * refuse". Both hands on the decision are judged: the S.O. it is attributed to, and the officer who enters it.
 */

const origination = { originatorPersonIds: ["rep"], keyedByPersonIds: ["clerk", null] };
const faults = (x: { decidedFor: string; enteredBy?: string; origination?: typeof origination }) =>
  soOriginationFaults({ decidedFor: x.decidedFor, enteredBy: x.enteredBy ?? x.decidedFor, origination: x.origination ?? origination }).map((f) => `${f.code}:${f.data?.who}`);

describe("a Superintending Officer does not decide a variation they originated or keyed", () => {
  it("is allowed where the S.O. neither originated nor keyed it (the flow the specification describes, and the demo's)", () => {
    expect(faults({ decidedFor: "so" })).toEqual([]);
  });
  it("is refused where the S.O. is the originator", () => {
    expect(faults({ decidedFor: "rep" })).toEqual(["SO_ORIGINATED:so"]);
  });
  it("is refused where the S.O. keyed the origination", () => {
    expect(faults({ decidedFor: "clerk" })).toEqual(["SO_KEYED_ORIGINATION:so"]);
  });
  it("is refused where the officer entering the decision for the S.O. originated it or keyed it", () => {
    expect(faults({ decidedFor: "so", enteredBy: "rep" })).toEqual(["SO_ORIGINATED:officer"]);
    expect(faults({ decidedFor: "so", enteredBy: "clerk" })).toEqual(["SO_KEYED_ORIGINATION:officer"]);
  });
  it("names both hands where both are the problem, and one finding for one person", () => {
    expect(faults({ decidedFor: "rep", enteredBy: "clerk" })).toEqual(["SO_ORIGINATED:so", "SO_KEYED_ORIGINATION:officer"]);
    expect(faults({ decidedFor: "rep", enteredBy: "rep" })).toEqual(["SO_ORIGINATED:so"]);
    // Someone who both originated it and keyed it is the originator: one refusal, not two.
    expect(faults({ decidedFor: "rep", origination: { originatorPersonIds: ["rep"], keyedByPersonIds: ["rep"] } })).toEqual(["SO_ORIGINATED:so"]);
  });
  it("counts an earlier originator and every officer who keyed it, however many times it was originated", () => {
    const again = { originatorPersonIds: ["rep", "first-rep"], keyedByPersonIds: ["clerk", "other-clerk"] };
    expect(faults({ decidedFor: "first-rep", origination: again })).toEqual(["SO_ORIGINATED:so"]);
    expect(faults({ decidedFor: "other-clerk", origination: again })).toEqual(["SO_KEYED_ORIGINATION:so"]);
  });
  it("compares no one where the act names no person (a loader's `personId` is empty), even if the origination holds an empty id", () => {
    expect(faults({ decidedFor: "so", enteredBy: "", origination: { originatorPersonIds: ["rep", ""], keyedByPersonIds: ["", null] } })).toEqual([]);
  });
  it("has nobody to compare with where the origination names no keying officer (made before sign-in, or by the system)", () => {
    expect(faults({ decidedFor: "so", origination: { originatorPersonIds: ["rep"], keyedByPersonIds: [null] } })).toEqual([]);
    expect(faults({ decidedFor: "so", origination: { originatorPersonIds: ["rep"], keyedByPersonIds: [] } })).toEqual([]);
  });
});

describe("the refusal is given in words, in English and in Malay, for each hand", () => {
  for (const code of ["SO_ORIGINATED", "SO_KEYED_ORIGINATION"]) {
    for (const who of ["so", "officer"]) {
      it(`${code} (${who})`, () => {
        const words = variationFaultWords({ code, level: "block", data: { who } });
        expect(words.en).toMatch(/originat|keyed/);
        expect(words.ms.length).toBeGreaterThan(30);
        expect(words.en).not.toMatch(/SO_|_[A-Z]+/);
        expect(words.en).not.toBe(variationFaultWords({ code: "__NONE__", level: "block" }).en);
      });
    }
    it(`${code} says a different thing for the S.O. than for the officer entering it`, () => {
      expect(variationFaultWords({ code, level: "block", data: { who: "so" } }).en).not.toBe(variationFaultWords({ code, level: "block", data: { who: "officer" } }).en);
    });
  }
});

describe("the act asks before it records (source scan)", () => {
  const src = readFileSync(path.join(process.cwd(), "src", "app", "projects", "[id]", "variation-actions.ts"), "utf8");
  const body = src.slice(src.indexOf("export async function decideVariation("), src.indexOf("export async function sendVariationForApproval("));
  it("reads the origination's attribution in the act's transaction and refuses before the variation is written", () => {
    expect(body).toMatch(/c\.tx\.actAttribution\.findMany\(\{ where: \{ organisationId: c\.l\.org\.id, entity: "Variation", entityId: v\.id, slot: "originator" \}/);
    const ask = body.indexOf("soOriginationFaults(");
    expect(ask).toBeGreaterThan(-1);
    expect(body.indexOf('refuse("Not recorded:"', ask)).toBeGreaterThan(ask);
    expect(body.indexOf("variation.updateMany(")).toBeGreaterThan(ask);
    expect(body).toMatch(/decidedFor: so\.person\.id,\s*enteredBy: actor\.personId/);
  });
});
