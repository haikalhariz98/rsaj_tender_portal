import { describe, expect, it } from "vitest";

import { pepperListState, pepperStillNeeded, wrappedUnderHeld, type PepperExerciseFacts } from "./pepper";

const base: PepperExerciseFacts = { exerciseId: "e1", wrappedUnderHeldPepper: true, cancelled: false, mainFinalised: false, lateInRoll: [] };
const late = (admission: PepperExerciseFacts["lateInRoll"][number]["admission"], over: Partial<PepperExerciseFacts["lateInRoll"][number]> = {}) => ({ withdrawn: false, admission, supplementaryFinalised: false, ...over });

describe("pepperStillNeeded (20y)", () => {
  it("is false when not wrapped under the held pepper, whatever else is true", () => {
    expect(pepperStillNeeded({ ...base, wrappedUnderHeldPepper: false })).toBe(false);
  });
  it("is false for a wrap under a different name#check of the same name (the caller matches the full id)", () => {
    // The facts carry only the verdict of the full-id match; a different check value of the same name is false there.
    expect(pepperStillNeeded({ ...base, wrappedUnderHeldPepper: false, mainFinalised: false })).toBe(false);
  });
  it("is false when the exercise is cancelled", () => {
    expect(pepperStillNeeded({ ...base, cancelled: true })).toBe(false);
  });
  it("is true while the main opening is not finalised", () => {
    expect(pepperStillNeeded(base)).toBe(true);
  });
  it("is false when the main opening is finalised and no late bid is in the roll", () => {
    expect(pepperStillNeeded({ ...base, mainFinalised: true })).toBe(false);
  });
  it.each(["NOT_TABLED", "PENDING", "DEFERRED"] as const)("is true for a late bid %s", (a) => {
    expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late(a)] })).toBe(true);
  });
  it("is false for a late bid the committee did not admit", () => {
    expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late("NOT_ADMITTED")] })).toBe(false);
  });
  it("is true for an admitted late bid whose supplementary opening is not finalised, false once it is", () => {
    expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late("ADMITTED")] })).toBe(true);
    expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late("ADMITTED", { supplementaryFinalised: true })] })).toBe(false);
  });
  it("ignores a withdrawn late bid, whatever its admission says", () => {
    for (const a of ["NOT_TABLED", "PENDING", "DEFERRED", "ADMITTED"] as const) expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late(a, { withdrawn: true })] })).toBe(false);
  });
  it("is true while any one of several late bids still follows", () => {
    expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late("NOT_ADMITTED"), late("ADMITTED", { supplementaryFinalised: true }), late("PENDING")] })).toBe(true);
    expect(pepperStillNeeded({ ...base, mainFinalised: true, lateInRoll: [late("NOT_ADMITTED"), late("ADMITTED", { supplementaryFinalised: true }), late("PENDING", { withdrawn: true })] })).toBe(false);
  });
  it("a cancelled exercise is false even with a pending late bid", () => {
    expect(pepperStillNeeded({ ...base, cancelled: true, mainFinalised: true, lateInRoll: [late("PENDING")] })).toBe(false);
  });
});

describe("pepperListState", () => {
  it("never reads a missing or unusable pepper as nothing needing it", () => {
    expect(pepperListState({ status: "NOT_SET" }, 0)).toBe("NOT_HELD");
    expect(pepperListState({ status: "INVALID" }, 0)).toBe("INVALID");
  });
  it("names none and some for a held pepper", () => {
    expect(pepperListState({ status: "SET", id: "p#abc" }, 0)).toBe("NONE");
    expect(pepperListState({ status: "SET", id: "p#abc" }, 2)).toBe("SOME");
  });
});

describe("wrappedUnderHeld", () => {
  it("matches the full id only", () => {
    expect(wrappedUnderHeld(["deploy1#abc123"], "deploy1#abc123")).toBe(true);
    expect(wrappedUnderHeld(["deploy1#zzz999"], "deploy1#abc123")).toBe(false);
    expect(wrappedUnderHeld(["deploy1"], "deploy1#abc123")).toBe(false);
    expect(wrappedUnderHeld([null], "deploy1#abc123")).toBe(false);
    expect(wrappedUnderHeld([null, "deploy1#abc123"], "deploy1#abc123")).toBe(true);
    expect(wrappedUnderHeld([], "deploy1#abc123")).toBe(false);
  });
});
