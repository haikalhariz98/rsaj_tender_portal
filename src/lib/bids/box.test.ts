import { describe, expect, it } from "vitest";

import { boxState, lockedAtOrAfterClosing, lockFaults } from "./box";
import { CLOSING, exercise, S } from "./fixture";

const base = { exercise: exercise(), now: CLOSING, events: [], personActive: true };

describe("locking the box at the closing", () => {
  it("at or after the closing", () => {
    expect(lockFaults(base)).toEqual([]);
    expect(lockFaults({ ...base, now: new Date(CLOSING.getTime() + 60 * S) })).toEqual([]);
  });
  it("refused before the closing", () => expect(lockFaults({ ...base, now: new Date(CLOSING.getTime() - 1 * S) }).map((f) => f.code)).toEqual(["BEFORE_CLOSING"]));
  it("refused once locked or opened, and without an officer", () => {
    const locked = [{ kind: "LOCKED" as const, occurredAt: CLOSING, personName: "A" }];
    expect(lockFaults({ ...base, events: locked }).map((f) => f.code)).toEqual(["ALREADY_LOCKED"]);
    expect(lockFaults({ ...base, events: [...locked, { kind: "UNLOCKED_FOR_OPENING" as const, occurredAt: new Date(CLOSING.getTime() + 3600 * S), personName: "B" }] }).map((f) => f.code)).toEqual(["OPENED"]);
    expect(lockFaults({ ...base, personActive: false }).map((f) => f.code)).toEqual(["PERSON_REQUIRED"]);
  });
  it("says where the box stands, and whether it was locked at or after the closing", () => {
    expect(boxState([])).toEqual({ state: "NOT_LOCKED" });
    const e = [{ kind: "LOCKED" as const, occurredAt: CLOSING, personName: "Officer One" }];
    expect(boxState(e)).toEqual({ state: "LOCKED", at: CLOSING, by: "Officer One" });
    expect(lockedAtOrAfterClosing(e, CLOSING)).toBe(true);
    expect(lockedAtOrAfterClosing([{ ...e[0], occurredAt: new Date(CLOSING.getTime() - S) }], CLOSING)).toBe(false);
    expect(lockedAtOrAfterClosing(e, null)).toBe(false);
  });
});
