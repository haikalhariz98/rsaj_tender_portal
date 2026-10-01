import { describe, expect, it } from "vitest";

import { conditionsOutstanding } from "./readiness";

describe("conditions outstanding (the Conditions tab's count)", () => {
  const met = { state: "MET" };
  const done = { satisfiedOn: new Date("2026-09-01") };
  const open = { satisfiedOn: null };

  it("counts the gate's three conditions that are not met, though no customer condition is recorded", () => {
    expect(conditionsOutstanding([{ state: "NOT_MET" }, { state: "NOT_SET" }, { state: "NOT_MET" }], [])).toBe(3);
  });

  it("counts an unset item as outstanding: it never reads as met", () => {
    expect(conditionsOutstanding([met, { state: "NOT_SET" }], [])).toBe(1);
  });

  it("adds the customer's conditions not yet satisfied, and ignores satisfied ones", () => {
    expect(conditionsOutstanding([met, met, met], [done, open, open])).toBe(2);
  });

  it("is zero only when everything is met", () => {
    expect(conditionsOutstanding([met, met, met], [done])).toBe(0);
  });
});
