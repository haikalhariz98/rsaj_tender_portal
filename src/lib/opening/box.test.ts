import { describe, expect, it } from "vitest";

import { boxEnvelopeJudgement, inTime, lockGap, lockGapFinding, registerBoxFaults, timeLabel } from "./box";
import { CLOSING, S, at, open } from "./fixture";

/**
 * OD-4, C-3 (ADR 0017): a bid in the box is in time by the box's LOCKED event (its server stamp),
 * never by when it is recorded; the closing-to-lock gap is shown, never a tolerance; the box is
 * emptied before the first envelope is opened.
 */

describe("in time by the lock (C-3 a, b)", () => {
  it("a box envelope recorded hours after the closing is in time: it is judged by the lock, stored recorded-after-closing", () => {
    const j = boxEnvelopeJudgement(at(12 * 60 * S + 10 * S), CLOSING);
    expect(j).toEqual({ receivedAt: at(730 * S), receivedSource: "BOX_AT_OPENING", late: false, closingAtJudged: CLOSING, recordedAfterClosing: true });
    expect(inTime({ receivedSource: "BOX_AT_OPENING", late: false })).toBe(true);
  });
  it("6.6's reading governs the other branch: an officer-received envelope recorded late is late", () => {
    expect(inTime({ receivedSource: "SERVER", late: true })).toBe(false);
    expect(inTime({ receivedSource: "ENTERED", late: false })).toBe(true);
  });
  it("its time is labelled as the lock's, never as a receipt time", () => {
    expect(timeLabel("BOX_AT_OPENING")).toBe("In the box when it was locked");
    expect(timeLabel("SERVER")).toBe("Server-stamped");
  });
});

describe("the closing-to-lock gap (C-3 c)", () => {
  it("LOCKED 14:42:10 → gap 12 min 10 s, a finding shown to the committee", () => {
    expect(lockGap(CLOSING, at(730 * S))).toEqual({ seconds: 730, text: "12 min 10 s" });
    expect(lockGapFinding(CLOSING, at(730 * S))).toEqual({ code: "LOCK_GAP", level: "warn", data: { gap: "12 min 10 s", seconds: 730 } });
  });
  it("locked in the closing second: no gap, said; hours are shown too", () => {
    expect(lockGapFinding(CLOSING, at(500))).toEqual({ code: "LOCKED_AT_CLOSING", level: "info" });
    expect(lockGap(CLOSING, at(3723 * S)).text).toBe("1 h 2 min 3 s");
  });
});

describe("registering a box envelope", () => {
  const base: Parameters<typeof registerBoxFaults>[0] = { state: open(), anyOpened: false, kind: "BID", markings: "Tender T/1", personActive: true, closing: CLOSING, lockedAt: at(730 * S) };
  const codes = (x: Partial<typeof base>) => registerBoxFaults({ ...base, ...x }).map((f) => f.code);
  it("after the box is opened and before any envelope is opened", () => {
    expect(codes({})).toEqual([]);
    expect(codes({ anyOpened: true })).toEqual(["BOX_EMPTIED"]);
    expect(codes({ state: open({ unsealed: false, sittingAuthorised: false }) })).toEqual(["NOT_UNSEALED"]);
  });
  it("only at the main opening, a bid, with its markings", () => {
    expect(codes({ state: open({ kind: "SUPPLEMENTARY" }) })).toEqual(["NOT_MAIN"]);
    expect(codes({ kind: "COMPANY_ESTIMATE" })).toEqual(["NOT_A_BID"]);
    expect(codes({ markings: " " })).toEqual(["MARKINGS_REQUIRED"]);
    expect(codes({ lockedAt: null })).toEqual(["NOT_LOCKED_AFTER_CLOSING"]);
  });
});
