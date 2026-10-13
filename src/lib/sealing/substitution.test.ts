import { describe, expect, it } from "vitest";

import { SUBSTITUTION_WORDS, substitutionFaults } from "./substitution";

/**
 * Substituting a named officer on an online exercise (ADR 0036 D11, ruling 11).
 */

describe("a substitution (D11, ruling 11)", () => {
  it("a controlled change moves the share: the incoming officer's key first, then the departing officer's own release", () => {
    expect(substitutionFaults({ change: "CONTROLLED", incomingHasKey: true, departingIsActor: true, keyLive: true })).toEqual([]);
    expect(substitutionFaults({ change: "CONTROLLED", incomingHasKey: false, departingIsActor: true, keyLive: true })).toEqual(["INCOMING_KEY_NOT_SET"]);
    expect(substitutionFaults({ change: "CONTROLLED", incomingHasKey: true, departingIsActor: false, keyLive: true })).toEqual(["DEPARTING_MUST_RELEASE"]);
    // With no live key there is no share to release.
    expect(substitutionFaults({ change: "CONTROLLED", incomingHasKey: true, departingIsActor: false, keyLive: false })).toEqual([]);
  });

  it("before submission the roster is an ordinary edit, and at or after the closing it is refused and the exercise must be re-tendered", () => {
    expect(substitutionFaults({ change: "FREE", incomingHasKey: true, departingIsActor: true, keyLive: true })).toEqual(["NOT_CONTROLLED"]);
    expect(substitutionFaults({ change: "REFUSED", incomingHasKey: true, departingIsActor: true, keyLive: true })).toEqual(["AFTER_CLOSING_RETENDER"]);
    expect(SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER).toMatch(/re-tendered/);
  });
});
