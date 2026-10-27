import { describe, expect, it } from "vitest";

import { soRouteFaults } from "./so-route";

/** BD-613-78 as ruled (plan closeout-plan.md §4.4, §6.3). */

const so = { roleCode: "PD", label: "Project Director" };

describe("soRouteFaults", () => {
  it("compares only the approving step with the contract's S.O.", () => {
    expect(soRouteFaults("making_good", "PD", so)).toEqual([]);
    expect(soRouteFaults("making_good", "HOD", so).map((f) => f.code)).toEqual(["SO_ROUTE_MISMATCH"]);
    expect(soRouteFaults("final_payment", "HOD", so).map((f) => f.code)).toEqual(["SO_ROUTE_MISMATCH"]);
  });
  it("an S.O. not resolved refuses; another domain is not checked", () => {
    expect(soRouteFaults("making_good", "PD", null).map((f) => f.code)).toEqual(["SO_UNRESOLVED"]);
    expect(soRouteFaults("practical_completion", "HOD", null)).toEqual([]);
  });
});
