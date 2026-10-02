import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { grandSummary, PRODUCT_SUMMARY_LABELS } from "./grand-summary";

/** FR-OPN-010: qualified or not, the lowest qualifying offer marked; ties all marked, never broken. */

const bid = (listingNo: number, price: string, verdict: "PASS" | "REJECT") => ({ listingNo, bidderName: `B${listingNo}`, price: parseSen(price), verdict });

describe("the Grand Summary", () => {
  it("passed 297,000.00, 297,000.00, 310,000.00 and rejected 250,000.00 → both 297,000.00 lowest (tie, listing order); 250,000.00 not qualified and never lowest", () => {
    const r = grandSummary({ finalised: true, bids: [bid(1, "297000.00", "PASS"), bid(2, "250000.00", "REJECT"), bid(3, "310000.00", "PASS"), bid(4, "297000.00", "PASS")], labels: { qualified: null, notQualified: null, lowest: null } });
    if (!("summary" in r)) throw new Error("refused");
    expect(r.summary.rows.map((x) => [x.listingNo, x.qualified, x.lowest])).toEqual([[1, true, true], [2, false, false], [3, true, false], [4, true, true]]);
    expect(r.summary.rows[1].label).toBe(PRODUCT_SUMMARY_LABELS.notQualified);
  });
  it("before finalisation → NOT_FINALISED", () => expect(grandSummary({ finalised: false, bids: [], labels: { qualified: null, notQualified: null, lowest: null } })).toEqual({ fault: { code: "NOT_FINALISED", level: "block" } }));
  it("labels from configuration; unset reads the product's English words", () => {
    const r = grandSummary({ finalised: true, bids: [bid(1, "1.00", "PASS")], labels: { qualified: "Layak", notQualified: null, lowest: "Terendah" } });
    if (!("summary" in r)) throw new Error("refused");
    expect(r.summary.labels).toEqual({ qualified: "Layak", notQualified: "Not qualified", lowest: "Terendah" });
    expect(r.summary.rows[0].label).toBe("Terendah");
  });
  it("compares in sen: a cent apart is not a tie", () => {
    const r = grandSummary({ finalised: true, bids: [bid(1, "9007199254740.93", "PASS"), bid(2, "9007199254740.92", "PASS")], labels: { qualified: null, notQualified: null, lowest: null } });
    if (!("summary" in r)) throw new Error("refused");
    expect(r.summary.rows.map((x) => x.lowest)).toEqual([false, true]);
  });
});
