import { describe, expect, it } from "vitest";

import { publishSealingWords } from "./ceremony";
import { pepperForWrapFault, REKEY_WORDS, rekeyRefusals, SHARE_WORDS, shareFaults } from "./share";

describe("setting a share (D3, D4)", () => {
  const ok = { channel: "ONLINE" as const, status: "DRAFT" as const, namedOfficer: true, now: new Date("2026-10-14T10:00:00Z"), closing: new Date("2026-11-01T10:00:00Z"), published: false, hasLiveShare: false, submissions: 0 };

  it("is allowed to a named officer of an online exercise before the closing", () => {
    expect(shareFaults(ok)).toEqual([]);
    expect(shareFaults({ ...ok, closing: null })).toEqual([]);
  });

  it("is refused in each other case, one reason at a time", () => {
    expect(shareFaults({ ...ok, channel: "PAPER" })).toEqual(["NOT_ONLINE"]);
    expect(shareFaults({ ...ok, channel: null })).toEqual(["NOT_ONLINE"]);
    expect(shareFaults({ ...ok, status: "CANCELLED" })).toEqual(["EXERCISE_CANCELLED"]);
    expect(shareFaults({ ...ok, namedOfficer: false })).toEqual(["NOT_NAMED_OFFICER"]);
    expect(shareFaults({ ...ok, now: new Date("2026-11-01T10:00:01Z") })).toEqual(["AFTER_CLOSING"]);
    expect(shareFaults({ ...ok, now: new Date("2026-11-01T10:00:00.900Z") })).toEqual([]);
  });

  it("after publication lets only an officer who has a share set a new one, and not once a bid exists", () => {
    expect(shareFaults({ ...ok, published: true })).toEqual(["NEW_OFFICER_AFTER_PUBLICATION"]);
    expect(shareFaults({ ...ok, published: true, hasLiveShare: true })).toEqual([]);
    expect(shareFaults({ ...ok, published: true, hasLiveShare: true, submissions: 1 })).toEqual(["SUBMISSIONS_EXIST"]);
  });

  it("says each in words, with no code on show", () => {
    for (const w of [...Object.values(SHARE_WORDS), ...Object.values(REKEY_WORDS)]) expect(w).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
  });
});

describe("the pepper a share is wrapped with (D4, 20v)", () => {
  it("is required unless the organisation's mode is DEMONSTRATION, and an invalid one is never set aside", () => {
    expect(pepperForWrapFault("LIVE", "NOT_SET")).toBe("PEPPER_NOT_SET");
    expect(pepperForWrapFault(null, "NOT_SET")).toBe("PEPPER_NOT_SET");
    expect(pepperForWrapFault("DEMONSTRATION", "NOT_SET")).toBeNull();
    expect(pepperForWrapFault("DEMONSTRATION", "INVALID")).toBe("PEPPER_INVALID");
    expect(pepperForWrapFault("LIVE", "SET")).toBeNull();
  });
});

describe("publication's words for a key not yet made", () => {
  it("do not say that no officers have still to set one when fewer than two are named", () => {
    expect(publishSealingWords({ code: "KEY_NOT_SET", level: "block", data: { missing: 0 } })).toMatch(/at least two/);
  });
});

describe("changing the key of a published exercise (20g, 20p)", () => {
  const ok = { channel: "ONLINE" as const, status: "ADVERTISED" as const, published: true, namedOfficer: true, reason: "A passphrase was lost", hasLiveKey: true, officers: 2, stale: false, submissions: 0, now: new Date("2026-10-14T10:00:00Z"), closing: new Date("2026-11-01T10:00:00Z") };

  it("is allowed to a named officer, with a reason, before the closing and any bid", () => expect(rekeyRefusals(ok)).toEqual([]));

  it("is refused after the closing, with a bid, with no reason, with no key, with a stale key, with one officer, and unpublished", () => {
    expect(rekeyRefusals({ ...ok, now: new Date("2026-11-02T00:00:00Z") })).toEqual(["AFTER_CLOSING"]);
    expect(rekeyRefusals({ ...ok, submissions: 1 })).toEqual(["SUBMISSIONS_EXIST"]);
    expect(rekeyRefusals({ ...ok, reason: "  " })).toEqual(["REASON_REQUIRED"]);
    expect(rekeyRefusals({ ...ok, hasLiveKey: false })).toEqual(["NO_LIVE_KEY"]);
    expect(rekeyRefusals({ ...ok, stale: true })).toEqual(["KEY_STALE"]);
    expect(rekeyRefusals({ ...ok, officers: 1 })).toEqual(["FEWER_THAN_TWO_OFFICERS"]);
    expect(rekeyRefusals({ ...ok, published: false })).toEqual(["NOT_PUBLISHED"]);
    expect(rekeyRefusals({ ...ok, closing: null })).toEqual(["CLOSING_NOT_SET"]);
  });

  it("refuses the wrong exercise and the wrong person alone", () => {
    expect(rekeyRefusals({ ...ok, channel: "PAPER" })).toEqual(["NOT_ONLINE"]);
    expect(rekeyRefusals({ ...ok, status: "CANCELLED" })).toEqual(["EXERCISE_CANCELLED"]);
    expect(rekeyRefusals({ ...ok, namedOfficer: false })).toEqual(["NOT_NAMED_OFFICER"]);
  });
});

describe("an incoming officer of a substitution (step 17)", () => {
  it("may set their share after publication, whatever submissions exist, only while a substitution waits for them", () => {
    const base = { channel: "ONLINE" as const, status: "ADVERTISED" as const, namedOfficer: true, now: new Date("2026-11-01T09:00:00Z"), closing: new Date("2026-11-01T10:00:00Z"), published: true, hasLiveShare: false, submissions: 3 };
    expect(shareFaults(base)).toEqual(["NEW_OFFICER_AFTER_PUBLICATION"]);
    expect(shareFaults({ ...base, substitutionIncoming: true })).toEqual([]);
    expect(shareFaults({ ...base, substitutionIncoming: true, now: new Date("2026-11-01T10:00:01Z") })).toEqual(["AFTER_CLOSING"]);
    expect(SHARE_WORDS.NEW_OFFICER_AFTER_PUBLICATION).not.toMatch(/not built/);
  });
});
