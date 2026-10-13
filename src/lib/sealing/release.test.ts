import { describe, expect, it } from "vitest";

import { releasePlan } from "./release";

/**
 * Who a non-last authorisation of the unseal forwards its shares to (ADR 0036 D10, ruling 20k: every named officer).
 */

describe("the unseal's releases (D10, 20k: every named officer)", () => {
  it.each([2, 3, 5])("with %i named officers, each authorisation but the last forwards to those still to act", (n) => {
    const named = Array.from({ length: n }, (_, i) => `r${i + 1}`);
    for (let k = 0; k < n; k++) {
      const plan = releasePlan({ namedOfficerRowIds: named, authorisedRowIds: named.slice(0, k), actorRowId: named[k] });
      expect(plan.last, `authorisation ${k + 1}`).toBe(k === n - 1);
      expect(plan.forwardTo).toEqual(named.slice(k + 1));
    }
  });

  it("an officer who has already authorised, or someone not named, changes nothing", () => {
    expect(releasePlan({ namedOfficerRowIds: ["r1", "r2", "r3"], authorisedRowIds: ["r1"], actorRowId: "r1" })).toEqual({ last: false, forwardTo: ["r2", "r3"] });
    expect(releasePlan({ namedOfficerRowIds: ["r1", "r2"], authorisedRowIds: ["r1"], actorRowId: "x9" })).toEqual({ last: false, forwardTo: ["r2"] });
    expect(releasePlan({ namedOfficerRowIds: [], authorisedRowIds: [], actorRowId: "r1" })).toEqual({ last: false, forwardTo: [] });
  });
});
