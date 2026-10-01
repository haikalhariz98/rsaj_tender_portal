import { describe, expect, it } from "vitest";

import { correctionScansMissing, countedReturnComplete, EMPTY_RETURN, instrumentReturned, returnComplete, scansMissing, scansRequired, type ReturnRecord } from "./stage-two";

const loa: ReturnRecord = { ...EMPTY_RETURN, signedLetterReceivedOn: "2026-09-20", declarationReceivedOn: "2026-09-21", authorisationReceivedOn: "2026-09-21" };
const page: ReturnRecord = {
  ...EMPTY_RETURN, signedLetterReceivedOn: "2026-09-20", signatoryName: "Tan Ah Kow", icNumber: "900101-14-5678", occupation: "Director", address: "1 Jalan Demo", capacity: "Director",
  contractorSigned: true, stampAffixed: true, witnessName: "Siti", witnessSigned: true,
};
const all = new Set(["SIGNED_LETTER", "DECLARATION", "AUTHORISATION"]);

describe("OD-5: a returned item counts only with its scan attached", () => {
  it("a Letter of Acceptance's return is complete only when each of the three has its scan", () => {
    expect(returnComplete("LETTER_OF_ACCEPTANCE", loa)).toBe(true);
    expect(countedReturnComplete("LETTER_OF_ACCEPTANCE", loa, { required: true, attached: all })).toBe(true);
    const two = new Set(["SIGNED_LETTER", "DECLARATION"]);
    expect(countedReturnComplete("LETTER_OF_ACCEPTANCE", loa, { required: true, attached: two })).toBe(false);
    expect(scansMissing("LETTER_OF_ACCEPTANCE", loa, two)).toEqual(["AUTHORISATION"]);
  });
  it("a scan without its received day does not complete it either", () => {
    expect(countedReturnComplete("LETTER_OF_ACCEPTANCE", { ...loa, declarationReceivedOn: null }, { required: true, attached: all })).toBe(false);
  });
  it("an appointment letter's acceptance page needs its scan", () => {
    expect(countedReturnComplete("WORK_INDENT", page, { required: true, attached: new Set() })).toBe(false);
    expect(scansMissing("WORK_INDENT", page, new Set())).toEqual(["ACCEPTANCE_PAGE"]);
    expect(countedReturnComplete("WORK_INDENT", page, { required: true, attached: new Set(["ACCEPTANCE_PAGE"]) })).toBe(true);
    expect(scansMissing("WORK_INDENT", EMPTY_RETURN, new Set())).toEqual([]);
  });
  it("the paper's received day still ends cancellation (BD-17), scan or not", () => {
    expect(instrumentReturned("LETTER_OF_ACCEPTANCE", { signedLetterReceivedOn: "2026-09-20", signatoryName: "" })).toBe(true);
  });
  it("scans are required of every award except one accepted before they were (no scan snapshot)", () => {
    expect(scansRequired("ISSUED", false)).toBe(true);
    expect(scansRequired("ACCEPTED", true)).toBe(true);
    expect(scansRequired("ACCEPTED", false)).toBe(false);
    // Not re-judged: its paper return stands as complete.
    expect(countedReturnComplete("LETTER_OF_ACCEPTANCE", loa, { required: scansRequired("ACCEPTED", false), attached: new Set() })).toBe(true);
  });
});

describe("a BD-24 correction needs a scan only for the item corrected", () => {
  it("correcting the declaration's day needs the declaration's scan, not the others'", () => {
    const after = { ...loa, declarationReceivedOn: "2026-09-22" };
    expect(correctionScansMissing("LETTER_OF_ACCEPTANCE", loa, after, new Set())).toEqual(["DECLARATION"]);
    expect(correctionScansMissing("LETTER_OF_ACCEPTANCE", loa, after, new Set(["DECLARATION"]))).toEqual([]);
  });
  it("a correction that changes no item's day needs no scan", () => {
    expect(correctionScansMissing("LETTER_OF_ACCEPTANCE", loa, { ...loa }, new Set())).toEqual([]);
  });
  it("any change to the acceptance page needs its scan", () => {
    expect(correctionScansMissing("WORK_INDENT", page, { ...page, occupation: "Managing director" }, new Set())).toEqual(["ACCEPTANCE_PAGE"]);
    expect(correctionScansMissing("WORK_INDENT", page, { ...page }, new Set())).toEqual([]);
  });
});

describe("the Return tab's scan line", () => {
  it("says what is outstanding, and labels an award accepted before scans were required", async () => {
    const { returnScansText } = await import("./labels");
    expect(returnScansText({ required: false, missing: [], attached: 0 }).text).toBe("Accepted before scans were required");
    expect(returnScansText({ required: true, missing: ["DECLARATION"], attached: 2 }).text).toMatch(/the signed declaration's scan/);
    expect(returnScansText({ required: true, missing: [], attached: 3 }).tone).toBe("ok");
  });
});

describe("an accepted award is never re-judged on its scans (plan §3)", () => {
  it("a scan withdrawn after acceptance does not make the return read incomplete", async () => {
    const { returnReadsComplete } = await import("./stage-two");
    expect(returnReadsComplete("ACCEPTED", "WORK_INDENT", page, new Set())).toBe(true);
    expect(returnReadsComplete("ISSUED", "WORK_INDENT", page, new Set())).toBe(false);
    expect(returnReadsComplete("ISSUED", "WORK_INDENT", page, new Set(["ACCEPTANCE_PAGE"]))).toBe(true);
  });
});
