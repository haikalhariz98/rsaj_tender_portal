import { describe, expect, it } from "vitest";

import { AMBIGUOUS_SUBSTITUTION_WORDS, pendingSubstitution, pendingSubstitutionWords, START_SUBSTITUTION_WORDS, startSubstitutionFaults, SUBSTITUTION_WORDS, substitutionFaults } from "./substitution";

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

describe("a substitution after publication is two acts (step 17)", () => {
  const dep = { rosterRowId: "r1", officerKeyId: "k1", personId: "p1", name: "Aini" };
  const inc = { rosterRowId: "r2", personId: "p2", name: "Budi", hasKey: false };

  it("pairs one departed holder with one named officer without a share, and nothing else", () => {
    expect(pendingSubstitution({ departed: [], shareless: [inc] })).toEqual({ state: "NONE" });
    expect(pendingSubstitution({ departed: [dep], shareless: [inc] })).toEqual({ state: "PENDING", departing: dep, incoming: inc });
    expect(pendingSubstitution({ departed: [dep, { ...dep, rosterRowId: "r3" }], shareless: [inc] }).state).toBe("AMBIGUOUS");
    expect(pendingSubstitution({ departed: [dep], shareless: [] }).state).toBe("AMBIGUOUS");
    expect(AMBIGUOUS_SUBSTITUTION_WORDS).toMatch(/re-tendered/);
  });

  it("is started only on a published online exercise before the closing, with a live key, the departing officer holding a share, and no other substitution waiting", () => {
    const ok = { change: "CONTROLLED" as const, publishedOnline: true, keyLive: true, pending: "NONE" as const, departingHoldsShare: true };
    expect(startSubstitutionFaults(ok)).toEqual([]);
    expect(startSubstitutionFaults({ ...ok, change: "REFUSED" })).toEqual(["AFTER_CLOSING_RETENDER"]);
    expect(START_SUBSTITUTION_WORDS.AFTER_CLOSING_RETENDER).toMatch(/re-tendered/);
    expect(startSubstitutionFaults({ ...ok, publishedOnline: false })).toEqual(["NOT_PUBLISHED_ONLINE"]);
    expect(startSubstitutionFaults({ ...ok, keyLive: false, departingHoldsShare: false })).toEqual(["KEY_NOT_LIVE"]);
    expect(startSubstitutionFaults({ ...ok, pending: "PENDING" })).toEqual(["ANOTHER_WAITING"]);
    expect(startSubstitutionFaults({ ...ok, departingHoldsShare: false })).toEqual(["DEPARTING_HOLDS_NO_SHARE"]);
  });

  it("says what is waiting and who acts next, and that the opening cannot start meanwhile", () => {
    const p = { state: "PENDING" as const, departing: dep, incoming: inc };
    expect(pendingSubstitutionWords(p)).toMatch(/Budi has first to set their own share, and then Aini releases theirs/);
    expect(pendingSubstitutionWords({ ...p, incoming: { ...inc, hasKey: true } })).toMatch(/Aini has now to release their share to Budi/);
    expect(pendingSubstitutionWords(p)).toMatch(/cannot start/);
  });
});
