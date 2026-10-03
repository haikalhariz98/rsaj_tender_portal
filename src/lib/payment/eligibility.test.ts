import { describe, expect, it } from "vitest";

import { preExecutionFaults, type PreExecutionFacts } from "./eligibility";

/**
 * FR-PAY-014 (checked at issue on the allocated sequence, warned of at open). FIXTURE: the limit 3 is the spec's
 * "1 to 3", a customer figure, never shipped (an unset limit refuses).
 */

const READY: PreExecutionFacts = {
  executed: false,
  limit: 3,
  gate: [
    { key: "RETURNED", state: "MET" },
    { key: "BOND", state: "MET" },
    { key: "INSURANCE", state: "MET" },
  ],
  withoutReceipt: [],
  perkesoRecorded: true,
};
const codes = (seq: number, f: PreExecutionFacts) => preExecutionFaults(seq, f).map((x) => x.code);

describe("certificates before the contract is signed", () => {
  it("certificate 4 is refused before execution; 3 is allowed with the letter returned, the bond and every policy verified", () => {
    expect(codes(4, READY)).toEqual(["CONTRACT_NOT_SIGNED"]);
    expect(codes(3, READY)).toEqual([]);
    expect(codes(1, READY)).toEqual([]);
  });
  it("a policy relied on without its premium receipt (a cover note) is refused", () => {
    expect(preExecutionFaults(2, { ...READY, withoutReceipt: ["Contractor's all risks"] })).toEqual([{ code: "COVER_NOTE_NO_RECEIPT", level: "block", data: { policies: "Contractor's all risks" } }]);
  });
  it("the letter not returned, the bond or a policy not verified, no social security number: each named", () => {
    expect(codes(1, { ...READY, gate: [{ key: "RETURNED", state: "NOT_MET" }, { key: "BOND", state: "NOT_SET" }, { key: "INSURANCE", state: "MET" }], perkesoRecorded: false })).toEqual(["PRE_EXECUTION_GATE", "PRE_EXECUTION_GATE", "PERKESO_NOT_RECORDED"]);
  });
  it("the limit unset refuses every certificate before execution, naming the setting", () => {
    expect(codes(1, { ...READY, limit: null })).toEqual(["PRE_EXECUTION_LIMIT_NOT_SET"]);
  });
  it("once executed, any sequence issues", () => {
    expect(codes(12, { ...READY, executed: true, limit: null, gate: [] })).toEqual([]);
  });
  it("at open the same rule warns rather than refuses", () => {
    expect(preExecutionFaults(4, READY, "warn")).toEqual([{ code: "CONTRACT_NOT_SIGNED", level: "warn", data: { sequence: 4, limit: 3 } }]);
  });
});
