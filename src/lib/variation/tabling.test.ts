import { describe, expect, it } from "vitest";

import { citeStepFaults, tableStepFaults, type MatterFact } from "./tabling";

/**
 * A committee's step on a variation's route (FR-VAR-010, 013): tabled once and waiting, cited only once decided. The
 * tabling act and the button beside the step read this one rule.
 */

const m = (over: Partial<MatterFact> = {}): MatterFact => ({ withdrawn: false, domain: "vo", committeeCode: "VOC", outcome: "PENDING", ...over });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("tabling the step's matter", () => {
  it("is open with nothing tabled, or only a matter withdrawn, decided, for another approval or before another committee", () => {
    expect(tableStepFaults([], "vo", "VOC")).toEqual([]);
    expect(tableStepFaults([m({ withdrawn: true }), m({ outcome: "CARRIED" }), m({ outcome: "NOT_CARRIED" }), m({ domain: "vo_increase" }), m({ committeeCode: "TENDER_BOARD" })], "vo", "VOC")).toEqual([]);
  });
  it("is refused while a matter stands waiting: tabled and pending, or deferred", () => {
    expect(codes(tableStepFaults([m()], "vo", "VOC"))).toEqual(["ALREADY_TABLED"]);
    expect(codes(tableStepFaults([m({ outcome: "DEFERRED" })], "vo", "VOC"))).toEqual(["ALREADY_TABLED"]);
  });
});

describe("citing the step", () => {
  it("needs a matter tabled for it", () => {
    expect(codes(citeStepFaults([], "vo", "VOC"))).toEqual(["NOT_TABLED_YET"]);
    expect(codes(citeStepFaults([m({ withdrawn: true, outcome: "CARRIED" }), m({ domain: "vo_increase", outcome: "CARRIED" })], "vo", "VOC"))).toEqual(["NOT_TABLED_YET"]);
  });
  it("waits for the committee's decision (pending or deferred is not one)", () => {
    expect(codes(citeStepFaults([m(), m({ outcome: "DEFERRED" })], "vo", "VOC"))).toEqual(["NOT_DECIDED_YET"]);
  });
  it("is open once the committee carried it, or did not (a refusal is cited too)", () => {
    expect(citeStepFaults([m({ outcome: "CARRIED" })], "vo", "VOC")).toEqual([]);
    expect(citeStepFaults([m({ outcome: "NOT_CARRIED" })], "vo", "VOC")).toEqual([]);
  });
});
