import { describe, expect, it } from "vitest";

import { creditorReviewFaults, creditorReviewText, type CreditorReviewFacts, type CreditorReviewInput, type CreditorReviewFault } from "./creditor-review";

const TODAY = "2026-10-12";
const sent: CreditorReviewFacts = { sent: true, verification: "NOT_CHECKED", sentOn: "2026-10-09", statementFiles: 1 };
const ok: CreditorReviewInput = { state: "VERIFIED", personActive: true, verifiedOn: "2026-10-12", note: "" };
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("checking a supplier's bank details (one officer, a signed act)", () => {
  it("a sent, unchecked profile with its statement can be passed as in order", () => {
    expect(creditorReviewFaults(ok, sent, TODAY)).toEqual([]);
  });

  it("an unset time zone is said, not guessed", () => {
    expect(codes(creditorReviewFaults(ok, sent, null))).toEqual(["TIME_ZONE_UNSET"]);
  });

  it("a profile still being filled in cannot be checked", () => {
    expect(codes(creditorReviewFaults(ok, { ...sent, sent: false }, TODAY))).toEqual(["NOT_SENT"]);
  });

  it("a profile that was checked is not checked again: a change is a new version", () => {
    for (const verification of ["VERIFIED", "NOT_IN_ORDER"] as const) expect(codes(creditorReviewFaults(ok, { ...sent, verification }, TODAY))).toEqual(["ALREADY_CHECKED"]);
  });

  it("the outcome, the officer and the day are required", () => {
    expect(codes(creditorReviewFaults({ ...ok, state: null }, sent, TODAY))).toEqual(["STATE_REQUIRED"]);
    expect(codes(creditorReviewFaults({ ...ok, personActive: false }, sent, TODAY))).toEqual(["PERSON_REQUIRED"]);
    expect(codes(creditorReviewFaults({ ...ok, verifiedOn: null }, sent, TODAY))).toEqual(["DAY_REQUIRED"]);
    expect(codes(creditorReviewFaults({ ...ok, verifiedOn: "12/10/2026" }, sent, TODAY))).toEqual(["DAY_REQUIRED"]);
  });

  it("the check is not dated after today or before the details were sent", () => {
    expect(codes(creditorReviewFaults({ ...ok, verifiedOn: "2026-10-13" }, sent, TODAY))).toEqual(["IN_FUTURE"]);
    expect(codes(creditorReviewFaults({ ...ok, verifiedOn: "2026-10-08" }, sent, TODAY))).toEqual(["BEFORE_SENT"]);
    expect(creditorReviewFaults({ ...ok, verifiedOn: "2026-10-09" }, sent, TODAY)).toEqual([]);
  });

  it("not in order says why, and in order needs the statement to have been there to check against", () => {
    expect(codes(creditorReviewFaults({ ...ok, state: "NOT_IN_ORDER", note: "  " }, sent, TODAY))).toEqual(["NOTE_REQUIRED"]);
    expect(creditorReviewFaults({ ...ok, state: "NOT_IN_ORDER", note: "The account name differs" }, sent, TODAY)).toEqual([]);
    expect(codes(creditorReviewFaults(ok, { ...sent, statementFiles: 0 }, TODAY))).toEqual(["STATEMENT_REQUIRED"]);
    // With no statement an officer can still say the details are not in order.
    expect(creditorReviewFaults({ ...ok, state: "NOT_IN_ORDER", note: "No statement" }, { ...sent, statementFiles: 0 }, TODAY)).toEqual([]);
  });

  it("there is no second-officer step: nothing here asks who checked it before, or for another person", () => {
    // The input names one officer. The rule has no field for a second, and judges nothing about who made the version.
    expect(Object.keys(ok).sort()).toEqual(["note", "personActive", "state", "verifiedOn"]);
  });

  it("every fault has words in both languages", () => {
    const all: CreditorReviewFault[] = ["TIME_ZONE_UNSET", "NOT_SENT", "ALREADY_CHECKED", "STATE_REQUIRED", "PERSON_REQUIRED", "DAY_REQUIRED", "IN_FUTURE", "BEFORE_SENT", "NOTE_REQUIRED", "STATEMENT_REQUIRED"];
    for (const code of all) {
      const t = creditorReviewText({ code, data: { sentOn: "2026-10-09" } });
      expect(t.en.length, code).toBeGreaterThan(10);
      expect(t.ms.length, code).toBeGreaterThan(10);
      expect(t.en, code).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
    }
  });
});
