import { describe, expect, it } from "vitest";

import { acceptancePageFaults, EMPTY_RETURN, returnComplete, returnState, type ReturnRecord } from "./stage-two";

const page: ReturnRecord = {
  ...EMPTY_RETURN,
  signedLetterReceivedOn: "2026-09-25",
  signatoryName: "A. Contractor",
  icNumber: "000000-00-0001",
  occupation: "Director",
  address: "1 Demo Lane",
  capacity: "Director, on behalf of the company",
  contractorSigned: true,
  stampAffixed: true,
  witnessName: "B. Witness",
  witnessSigned: true,
};

describe("the Stage Two return (FR-AWD-003)", () => {
  it("two of three documents is incomplete, naming the third", () => {
    expect(returnState({ ...EMPTY_RETURN, signedLetterReceivedOn: "2026-09-20", declarationReceivedOn: "2026-09-20" })).toEqual({ complete: false, missing: ["AUTHORISATION"] });
  });
  it("all three is complete", () => {
    const r = { ...EMPTY_RETURN, signedLetterReceivedOn: "2026-09-20", declarationReceivedOn: "2026-09-20", authorisationReceivedOn: "2026-09-21" };
    expect(returnState(r)).toEqual({ complete: true, missing: [] });
    expect(returnComplete("LETTER_OF_ACCEPTANCE", r)).toBe(true);
  });
});

describe("the acceptance page (FR-AWD-008)", () => {
  it("is complete only with every field", () => {
    expect(acceptancePageFaults(page)).toEqual([]);
    expect(returnComplete("WORK_INDENT", page)).toBe(true);
  });
  it("requires each field on its own", () => {
    for (const [k, code] of [["signatoryName", "SIGNATORY_NAME"], ["icNumber", "IC_NUMBER"], ["occupation", "OCCUPATION"], ["address", "ADDRESS"], ["capacity", "CAPACITY"], ["witnessName", "WITNESS_NAME"]] as const) {
      expect(acceptancePageFaults({ ...page, [k]: "" })).toEqual([code]);
    }
  });
  it("the day the page was received is required, as for a Letter of Acceptance", () => {
    expect(acceptancePageFaults({ ...page, signedLetterReceivedOn: null })).toEqual(["RECEIVED_ON"]);
    expect(returnComplete("WORK_INDENT", { ...page, signedLetterReceivedOn: null })).toBe(false);
  });
  it("a stamp not recorded is not the same as a stamp not affixed", () => {
    expect(acceptancePageFaults({ ...page, stampAffixed: null })).toEqual(["STAMP_NOT_RECORDED"]);
    expect(acceptancePageFaults({ ...page, stampAffixed: false })).toEqual(["STAMP_NOT_AFFIXED"]);
  });
  it("both signatures are required", () => {
    expect(acceptancePageFaults({ ...page, contractorSigned: false, witnessSigned: null })).toEqual(["CONTRACTOR_NOT_SIGNED", "WITNESS_SIGNATURE_NOT_RECORDED"]);
  });
});
