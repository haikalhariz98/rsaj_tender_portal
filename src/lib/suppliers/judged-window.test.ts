import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { cancellationStoodUntil, judgedWhileCancelled, type OpeningJudged } from "./cancellation";

/**
 * 6.13 Part B Run 1a, C1 (promoted by the lead: the list showed false facts; flagged 6.15a). Withdrawing a cancellation
 * lists the bid openings that judged the supplier cancelled while it stood. The list ran from the day it took effect with
 * no end, so withdrawing cancellation A also listed openings caused by a later cancellation B. It is now bounded by the
 * day A stopped standing: the next registration day after A took effect (the supplier's registration day, or the
 * registration a later cancellation names), or the next live cancellation's start, whichever is earlier (exclusive).
 *
 * Worked example: A from 01 Oct 2026; the supplier registered again on 05 Oct 2026 (A ended); B from 08 Oct 2026, cancelling
 * the 05 Oct registration. Openings judged it cancelled on 02 Oct (A's) and on 09 Oct (B's); on 06 Oct it was active.
 * Withdrawing A lists only the 02 Oct opening.
 */

const opening = (exercise: string, judgedOn: string, standing: string): OpeningJudged => ({ exercise, listingNo: 1, judgedOn, standing, rejected: standing === "CANCELLED" });
const openings = [opening("DEMO/T/0001/2026", "2026-10-02", "CANCELLED"), opening("DEMO/T/0002/2026", "2026-10-06", "ACTIVE"), opening("DEMO/T/0003/2026", "2026-10-09", "CANCELLED")];
const A = { id: "A", effectiveOn: "2026-10-01", cancelsRegistrationOn: "2026-01-05", withdrawn: false };
const B = { id: "B", effectiveOn: "2026-10-08", cancelsRegistrationOn: "2026-10-05", withdrawn: false };

describe("the window a cancellation stood in (C1)", () => {
  it("bounded by the next registration day: the supplier's own, or the one a later cancellation names", () => {
    expect(cancellationStoodUntil(A, [A, B], "2026-10-05")).toBe("2026-10-05");
    // The supplier's registration day is the later one; B names the 05 Oct registration that ended A.
    expect(cancellationStoodUntil(A, [A, B], "2026-10-20")).toBe("2026-10-05");
  });

  it("bounded by the next live cancellation's start where no registration day is known after it", () => {
    const Bn = { ...B, cancelsRegistrationOn: null };
    expect(cancellationStoodUntil(A, [A, Bn], null)).toBe("2026-10-08");
    // A withdrawn later cancellation never stood: its start bounds nothing (its registration day still does).
    expect(cancellationStoodUntil(A, [A, { ...Bn, withdrawn: true }], null)).toBeNull();
    expect(cancellationStoodUntil(A, [A, { ...B, withdrawn: true }], null)).toBe("2026-10-05");
  });

  it("still standing (nothing after it): unbounded; the registration day on or before it does not bound it", () => {
    expect(cancellationStoodUntil(A, [A], null)).toBeNull();
    expect(cancellationStoodUntil(A, [A], "2026-10-01")).toBeNull();
    expect(cancellationStoodUntil(A, [A], "2026-01-05")).toBeNull();
  });

  it("withdrawing A lists only the openings A caused, not B's", () => {
    const until = cancellationStoodUntil(A, [A, B], "2026-10-05");
    expect(judgedWhileCancelled(openings, A.effectiveOn, until).map((o) => o.exercise)).toEqual(["DEMO/T/0001/2026"]);
    // Withdrawing B lists B's (it stands: unbounded).
    expect(judgedWhileCancelled(openings, B.effectiveOn, cancellationStoodUntil(B, [A, B], "2026-10-05")).map((o) => o.exercise)).toEqual(["DEMO/T/0003/2026"]);
  });

  it("the bound is exclusive: an opening on the day the supplier registered again, or on the day B took effect, is not A's", () => {
    const onBoundary = [opening("X", "2026-10-05", "CANCELLED"), opening("Y", "2026-10-04", "CANCELLED")];
    expect(judgedWhileCancelled(onBoundary, A.effectiveOn, "2026-10-05").map((o) => o.exercise)).toEqual(["Y"]);
  });
});

describe("the act and the panel bound it the same way (source)", () => {
  const acts = readFileSync("src/app/suppliers/standing-actions.ts", "utf8");
  const panel = readFileSync("src/app/suppliers/[id]/standing-panels.tsx", "utf8");
  it("both pass cancellationStoodUntil's day to judgedWhileCancelled", () => {
    expect(acts).toMatch(/judgedWhileCancelled\(await openingsJudged\(tx, l\.supplier\.id\), storedDay\(ev!\.effectiveOn\), cancellationStoodUntil\(/);
    expect(panel).toMatch(/judgedWhileCancelled\(openings, storedDay\(e\.effectiveOn\), cancellationStoodUntil\(/);
  });
});
