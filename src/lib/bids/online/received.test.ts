import { describe, expect, it } from "vitest";

import { RECEIVED_WORDS, receivedView } from "./received";

/**
 * Received (SR-13; ruling 18 as amended by 20u, 20l). A worked example: sequences 1 to 5 were taken; 2 was replaced by 4, and 3 was withdrawn; 5 came after the
 * closing. Three bids stand: 1, 4 and 5 (late). Before the opening starts Received shows them as 1st, 2nd and 3rd by stamp, with no receipt numbers, so the gaps at
 * 2 and 3 do not show; from the start it shows the numbers 1, 4 and 5.
 */

const t = (s: string) => new Date(`2026-11-04T${s}Z`);
const ROWS = [
  { sequence: 1, receivedAt: t("01:00:00"), late: false, status: "SUBMITTED" as const },
  { sequence: 2, receivedAt: t("01:30:00"), late: false, status: "REPLACED" as const },
  { sequence: 3, receivedAt: t("02:00:00"), late: false, status: "WITHDRAWN" as const },
  { sequence: 4, receivedAt: t("02:30:00"), late: false, status: "SUBMITTED" as const },
  { sequence: 5, receivedAt: t("04:10:00"), late: true, status: "SUBMITTED" as const },
];

describe("Received before and after the opening's start", () => {
  it("before the start: the standing bids, in stamp order, each with its ordinal, stamp and late flag, and no sequence", () => {
    expect(receivedView(ROWS, false)).toEqual({
      count: 3,
      standing: [
        { ordinal: 1, sequence: null, receivedAt: t("01:00:00"), late: false },
        { ordinal: 2, sequence: null, receivedAt: t("02:30:00"), late: false },
        { ordinal: 3, sequence: null, receivedAt: t("04:10:00"), late: true },
      ],
    });
  });

  it("from the start: the sequence appears", () => {
    expect(receivedView(ROWS, true).standing.map((r) => r.sequence)).toEqual([1, 4, 5]);
  });

  it("an opened bid still stands; replaced and withdrawn ones never show, and nothing names a bidder, a part or a size", () => {
    const v = receivedView([...ROWS.slice(0, 2), { ...ROWS[3], status: "OPENED" }], true);
    expect(v.count).toBe(2);
    expect(Object.keys(v.standing[0]).sort()).toEqual(["late", "ordinal", "receivedAt", "sequence"]);
  });

  it("two stamps in the same second are ordered by their sequence", () => {
    const same = [{ ...ROWS[3], receivedAt: t("01:00:00") }, ROWS[0]];
    expect(receivedView(same, true).standing.map((r) => r.sequence)).toEqual([1, 4]);
  });

  it("the words carry 20u's: the order of the bids now standing, not the receipt number, which can change and is shown once the opening starts", () => {
    expect(RECEIVED_WORDS.ordinalNote).toMatch(/order of the bids now standing/);
    expect(RECEIVED_WORDS.ordinalNote).toMatch(/not the receipt number/);
    expect(RECEIVED_WORDS.ordinalNote).toMatch(/can change before the closing/);
    expect(RECEIVED_WORDS.ordinalNote).toMatch(/receipt number is shown once the opening starts/);
    expect(RECEIVED_WORDS.sequenceLabel).toBe("Receipt number");
    expect(RECEIVED_WORDS.ordinalLabel.length).toBeGreaterThan(2);
  });
});
