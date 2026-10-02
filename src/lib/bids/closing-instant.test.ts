import { describe, expect, it } from "vitest";

import { windowPhase } from "@/lib/window/phase";

import { lockFaults } from "./box";
import { correctionFaults } from "./correction";
import { CLOSING, exercise, S } from "./fixture";
import { isLate } from "./lateness";
import { judgeReceipt } from "./receipt";
import { withdrawFaults } from "./withdrawal";

/**
 * The two readings of the closing instant, pinned together (BD-66-3, approved in the 6.6 review,
 * S-7). The window (6.5's phase) reads CLOSED from the closing instant itself; a bidder's act is
 * late only from the next second. So at 14:30:00 the window is closed while an envelope recorded
 * in that second is in time, and a withdrawal or a correction in it is still taken; from 14:30:01
 * both read closed. The box may be locked from the instant. If the customer's governing document
 * says "before 14:30" instead, this is the switch to change, and this test says where.
 */

const W = { status: "ADVERTISED" as const, purchaseFromDay: new Date("2026-10-21T00:00:00Z"), purchaseCloseDay: new Date("2026-11-10T00:00:00Z"), closingAt: CLOSING };
const at = (ms: number) => new Date(CLOSING.getTime() + ms);
const blocks = (fs: readonly { code: string; level: string }[]) => fs.filter((f) => f.level === "block").map((f) => f.code);

describe("the closing instant, read two ways (BD-66-3)", () => {
  it("one millisecond before the closing the window is not yet closed, and submission is open", () => {
    expect(windowPhase(W, at(-1), "Asia/Kuala_Lumpur")).toEqual({ phase: "CLOSED_FOR_PURCHASE", submissionOpen: true });
  });

  it("at 14:30:00 exactly: the window reads CLOSED, and an envelope recorded in that second is in time", () => {
    expect(windowPhase(W, CLOSING, "Asia/Kuala_Lumpur")).toEqual({ phase: "CLOSED", submissionOpen: false });
    expect(isLate(CLOSING, CLOSING)).toBe(false);
    expect(judgeReceipt(CLOSING, CLOSING)).toMatchObject({ late: false, recordedAfterClosing: false, receivedAt: CLOSING });
  });

  it("anywhere in the closing second (14:30:00.999) the bidder is still in time; the window is closed", () => {
    expect(windowPhase(W, at(999), "Asia/Kuala_Lumpur").phase).toBe("CLOSED");
    expect(isLate(at(999), CLOSING)).toBe(false);
    expect(judgeReceipt(at(999), CLOSING)).toMatchObject({ late: false, receivedAt: CLOSING });
  });

  it("from 14:30:01 both read closed: the envelope is late", () => {
    expect(windowPhase(W, at(S), "Asia/Kuala_Lumpur").phase).toBe("CLOSED");
    expect(isLate(at(S), CLOSING)).toBe(true);
    expect(judgeReceipt(at(S), CLOSING)).toMatchObject({ late: true, recordedAfterClosing: true, receivedAt: at(S) });
  });

  it("a withdrawal and a correction follow the bidder's reading: taken in the closing second, refused from the next", () => {
    const x = exercise();
    const withdraw = (now: Date) => blocks(withdrawFaults({ exercise: x, now, envelope: null, markings: "Tender T/1", personActive: true }));
    expect(withdraw(CLOSING)).not.toContain("AFTER_CLOSING");
    expect(withdraw(at(S))).toContain("AFTER_CLOSING");
    const correct = (now: Date) => blocks(correctionFaults({ exercise: x, now, envelope: { kind: "BID", status: "RECEIVED", channel: "COUNTER", markings: "M", receivedByPersonId: "p1" }, change: { markings: "M2" }, reason: "Typo", personActive: true }));
    expect(correct(CLOSING)).not.toContain("CORRECTION_CLOSED");
    expect(correct(at(S))).toContain("CORRECTION_CLOSED");
  });

  it("the box follows the window's reading: lockable from the closing instant, refused a millisecond before", () => {
    const x = exercise();
    expect(blocks(lockFaults({ exercise: x, now: CLOSING, events: [], personActive: true }))).toEqual([]);
    expect(blocks(lockFaults({ exercise: x, now: at(-1), events: [], personActive: true }))).toContain("BEFORE_CLOSING");
  });
});
