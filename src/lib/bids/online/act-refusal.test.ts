import { describe, expect, it } from "vitest";

import { submitFaultOfRefusal, withdrawFaultOfRefusal, type SubmitStep, type WithdrawStep } from "./act-refusal";

describe("the database's refusals of a submit, said in words (ruling 20aa, build plan step 10)", () => {
  it("PA010 on the envelope is a stale stamp, and nowhere else", () => {
    expect(submitFaultOfRefusal("PA010", "ENVELOPE")).toBe("STAMP_STALE");
    for (const step of ["BID", "PARTS", "REPLACED", "COMMIT"] as SubmitStep[]) expect(submitFaultOfRefusal("PA010", step), step).toBe("NOT_TAKEN");
  });

  it("PA012 on a submit is never a stale stamp: the replaced bid's move is judged by the replacement's own stamp, so it is a defect", () => {
    for (const step of ["REPLACED", "ENVELOPE_FOLLOWS", "ENVELOPE"] as SubmitStep[]) expect(submitFaultOfRefusal("PA012", step), step).toBe("NOT_TAKEN");
  });

  it("PA027 is a rival that committed first", () => {
    expect(submitFaultOfRefusal("PA027", "COMMIT")).toBe("LIVE_BID_HELD");
  });

  it("every other sealed refusal is not taken, including PA013, PA016 and PA028", () => {
    for (const state of ["PA011", "PA013", "PA014", "PA016", "PA024", "PA028", "PA999"]) expect(submitFaultOfRefusal(state, "COMMIT"), state).toBe("NOT_TAKEN");
  });
});

describe("the database's refusals of a withdrawal, said in words", () => {
  it("PA012 on the target's move is a stale stamp, and on its envelope's follow it is not", () => {
    expect(withdrawFaultOfRefusal("PA012", "TARGET")).toBe("STAMP_STALE");
    for (const step of ["TARGET_ENVELOPE", "ALTERNATIVES", "LINKS", "COMMIT"] as WithdrawStep[]) expect(withdrawFaultOfRefusal("PA012", step), step).toBe("NOT_TAKEN");
  });

  it("every other sealed refusal is not taken, PA027 included", () => {
    for (const state of ["PA010", "PA013", "PA016", "PA027", "PA028"]) expect(withdrawFaultOfRefusal(state, "TARGET"), state).toBe("NOT_TAKEN");
  });
});
