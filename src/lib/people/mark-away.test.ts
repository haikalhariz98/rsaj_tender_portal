import { describe, expect, it } from "vitest";

import { markAwayDisabled, marksAway } from "./mark-away";

describe("marking a person away needs the permission to draft configuration (ruling on log line 1770)", () => {
  it("only the change from available to away is the act", () => {
    expect(marksAway(true, false)).toBe(true);
    expect(marksAway(true, true)).toBe(false);
    expect(marksAway(false, true)).toBe(false);
    expect(marksAway(false, false)).toBe(false);
  });

  it("the switch is withheld only where it would turn away ON without the permission", () => {
    expect(markAwayDisabled(true, false)).toBe(true);
    expect(markAwayDisabled(true, true)).toBe(false);
    // A person already away can be marked available again by anyone who can edit them (moving nothing back).
    expect(markAwayDisabled(false, false)).toBe(false);
    expect(markAwayDisabled(false, true)).toBe(false);
  });
});
