import { describe, expect, it } from "vitest";

import { currentPartIndex, isTarget, startsOpen } from "./open";

describe("startsOpen (0005 R13)", () => {
  it("starts closed when it holds nothing that needs the viewer", () => {
    expect(startsOpen({})).toBe(false);
  });
  it.each(["finding", "actNow", "mustKeep", "inProgress", "policyWithProvenance", "requestedResult"] as const)("starts open for %s", (k) => {
    expect(startsOpen({ [k]: true })).toBe(true);
  });
  it("opens for the section the address names, with or without the hash", () => {
    expect(startsOpen({}, { id: "clauses", target: "clauses" })).toBe(true);
    expect(startsOpen({}, { id: "clauses", target: "#clauses" })).toBe(true);
    expect(startsOpen({}, { id: "clauses", target: "assurance" })).toBe(false);
  });
  it("never matches a missing id or target", () => {
    expect(isTarget(undefined, "x")).toBe(false);
    expect(isTarget("x", null)).toBe(false);
  });
  it("names the first unfinished part, and none when all are finished", () => {
    expect(currentPartIndex([true, true, false, false])).toBe(2);
    expect(currentPartIndex([true, true])).toBe(-1);
  });
});
