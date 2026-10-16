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
      inTime: 2,
      late: 1,
      standing: [
        { ordinal: 1, sequence: null, receivedAt: t("01:00:00"), late: false },
        { ordinal: 2, sequence: null, receivedAt: t("02:30:00"), late: false },
        { ordinal: 3, sequence: null, receivedAt: t("04:10:00"), late: true },
      ],
    });
  });

  it("counts the standing bids, and of them those in time and those late, so no screen counts (review S2)", () => {
    expect(receivedView(ROWS, true)).toMatchObject({ count: 3, inTime: 2, late: 1 });
    expect(receivedView([], false)).toEqual({ count: 0, inTime: 0, late: 0, standing: [] });
    const v = receivedView(ROWS.map((r) => ({ ...r, late: true })), false);
    expect([v.count, v.inTime, v.late]).toEqual([3, 0, 3]);
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

  it("the words carry 20u's, as 20ar amended them: the order of the bids now standing, which can change, and the portal's order of receipt once the opening starts, never 'receipt number'", () => {
    // Ruling 20ab: the words are `Words`, English and Malay; the Malay says the same things.
    expect(RECEIVED_WORDS.ordinalNote.en).toMatch(/order of the bids now standing/);
    expect(RECEIVED_WORDS.ordinalNote.en).toMatch(/can change before the closing/);
    expect(RECEIVED_WORDS.ordinalNote.en).toMatch(/order of receipt for the exercise is shown once the opening starts/);
    expect(RECEIVED_WORDS.ordinalNote.ms).toMatch(/boleh berubah sebelum tarikh tutup/);
    expect(RECEIVED_WORDS.ordinalNote.ms).toMatch(/susunan penerimaan portal/i);
    expect(RECEIVED_WORDS.sequenceLabel).toEqual({ en: "Portal order of receipt", ms: "Susunan penerimaan portal" });
    // 20ar: since 20an a supplier's receipt carries its own submission number, so neither language may call the sequence a receipt number.
    for (const x of Object.values(RECEIVED_WORDS)) {
      expect(x.en).not.toMatch(/receipt number/i);
      expect(x.ms).not.toMatch(/nombor resit/i);
    }
    expect(RECEIVED_WORDS.ordinalLabel.en.length).toBeGreaterThan(2);
    expect(RECEIVED_WORDS.ordinalLabel.ms.length).toBeGreaterThan(2);
  });
});
