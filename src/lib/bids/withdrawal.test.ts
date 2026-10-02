import { describe, expect, it } from "vitest";

import { CLOSING, exercise, S } from "./fixture";
import { returnFaults, returnState, withdrawFaults } from "./withdrawal";

const before = new Date(CLOSING.getTime() - 600 * S);
const after = new Date(CLOSING.getTime() + 1 * S);
type Input = Parameters<typeof withdrawFaults>[0];
type Env = NonNullable<Input["envelope"]>;
const env: Env = { kind: "BID", late: false, status: "RECEIVED", withdrawn: false };
const base: Input = { exercise: exercise(), now: before, envelope: env, markings: "Letter ref ABC/1 withdrawing our tender", personActive: true };
const codes = (i: Partial<Input>) => withdrawFaults({ ...base, ...i }).map((f) => f.code);

describe("a withdrawal (FR-BID-004, X-11)", () => {
  it("before the closing, of a counter envelope or one in the box", () => {
    expect(codes({})).toEqual([]);
    expect(codes({ envelope: null })).toEqual([]);
  });
  it("after the closing is refused, at 14:30:01 but not at 14:30:00", () => {
    expect(codes({ now: after })).toEqual(["AFTER_CLOSING"]);
    expect(codes({ now: CLOSING })).toEqual([]);
  });
  it("a late envelope, an envelope already withdrawn and the estimate are refused", () => {
    expect(codes({ envelope: { ...env, late: true } })).toEqual(["ENVELOPE_LATE"]);
    expect(codes({ envelope: { ...env, withdrawn: true } })).toEqual(["ALREADY_WITHDRAWN"]);
    expect(codes({ envelope: { ...env, status: "WITHDRAWN" } })).toEqual(["ALREADY_WITHDRAWN"]);
    expect(codes({ envelope: { ...env, kind: "COMPANY_ESTIMATE" } })).toEqual(["NOT_A_BID"]);
  });
  it("needs the letter's markings and an officer", () => expect(codes({ markings: "", personActive: false })).toEqual(["MARKINGS_REQUIRED", "PERSON_REQUIRED"]));
});

describe("handing a withdrawn envelope back unopened", () => {
  const withdrawn = { status: "WITHDRAWN" as const, returnedUnopenedOn: null };
  it("on a day from the withdrawal to today", () => {
    expect(returnFaults({ envelope: withdrawn, withdrawnOn: "2026-11-10", day: "2026-11-12", today: "2026-11-20", cancelled: false })).toEqual([]);
    const c = (day: string) => returnFaults({ envelope: withdrawn, withdrawnOn: "2026-11-10", day, today: "2026-11-20", cancelled: false }).map((f) => f.code);
    expect(c("2026-11-21")).toEqual(["DAY_IN_FUTURE"]);
    expect(c("2026-11-09")).toEqual(["BEFORE_WITHDRAWAL"]);
  });
  it("only a withdrawn envelope, once", () => {
    expect(returnFaults({ envelope: { status: "RECEIVED", returnedUnopenedOn: null }, withdrawnOn: null, day: "2026-11-12", today: "2026-11-20", cancelled: false }).map((f) => f.code)).toEqual(["NOT_WITHDRAWN"]);
    expect(returnFaults({ envelope: { status: "WITHDRAWN", returnedUnopenedOn: new Date() }, withdrawnOn: null, day: "2026-11-12", today: "2026-11-20", cancelled: false }).map((f) => f.code)).toEqual(["ALREADY_RETURNED"]);
  });
  it("a withdrawn envelope is held unopened until handed back", () => {
    expect(returnState(withdrawn)).toBe("HELD_UNOPENED");
    expect(returnState({ status: "WITHDRAWN", returnedUnopenedOn: new Date() })).toBe("RETURNED_UNOPENED");
    expect(returnState({ status: "RECEIVED", returnedUnopenedOn: null })).toBe("NOT_WITHDRAWN");
  });
});
