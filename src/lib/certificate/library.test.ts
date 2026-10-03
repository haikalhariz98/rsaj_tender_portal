import { describe, expect, it } from "vitest";

import { copyState, likePatterns, openSheetsWhere, outstandingCopiesWhere, pageOf, sheetCounts, sheetOrder } from "./library";
import type { Verdict } from "./routing-sheet";

describe("the Library's page and its search patterns (code review M-3: paged in the database)", () => {
  it("search words are taken literally in the database's LIKE patterns", () => {
    expect(likePatterns(["100%", "a_b", "c\\d", "Fasal"])).toEqual(["%100\\%%", "%a\\_b%", "%c\\\\d%", "%Fasal%"]);
  });
  it("a page asked for is clamped to the pages there are", () => {
    expect(pageOf(undefined, 120, 50)).toBe(0);
    expect(pageOf("3", 120, 50)).toBe(2);
    expect(pageOf("9", 120, 50)).toBe(2);
    expect(pageOf("0", 120, 50)).toBe(0);
    expect(pageOf("x", 0, 50)).toBe(0);
  });
});

describe("Distribution: where a copy stands", () => {
  it("not sent; sent with its acknowledgement awaited; done", () => {
    expect(copyState({ mandatory: true, ackRequired: true, despatchedOn: null, acknowledgedOn: null })).toBe("NOT_SENT");
    expect(copyState({ mandatory: true, ackRequired: true, despatchedOn: "2026-09-02", acknowledgedOn: null })).toBe("ACK_AWAITED");
    expect(copyState({ mandatory: true, ackRequired: false, despatchedOn: "2026-09-02", acknowledgedOn: null })).toBe("DONE");
    expect(copyState({ mandatory: false, ackRequired: true, despatchedOn: "2026-09-02", acknowledgedOn: "2026-09-04" })).toBe("DONE");
  });
});

describe("Routing sheets: the open ones, judged over all of them", () => {
  const v = (verdict: Verdict) => ({ verdict });
  it("counts open, over their target, and not judged (no target, or not received)", () => {
    const sheets = [v({ state: "OPEN", soFar: 30, target: 28, overBy: 2 }), v({ state: "OPEN", soFar: 28, target: 28, overBy: 0 }), v({ state: "NOT_MEASURED", elapsed: null }), v({ state: "NOT_STARTED" }), v({ state: "OVER", elapsed: 29, target: 28, by: 1 })];
    expect(sheetCounts(sheets)).toEqual({ open: 5, overTarget: 2, notJudged: 2 });
  });
  it("worked example (the plan's 4 weeks): received 1 Sep 2026, still open on 29 Sep is 28 days and not over; on 30 Sep, 1 day over", () => {
    expect(sheetCounts([v({ state: "OPEN", soFar: 28, target: 28, overBy: 0 })]).overTarget).toBe(0);
    expect(sheetCounts([v({ state: "OPEN", soFar: 29, target: 28, overBy: 1 })]).overTarget).toBe(1);
  });
  it("lists the longest open first, the not yet received after, then by id", () => {
    const rows = [{ date1: null, id: "b" }, { date1: "2026-09-10", id: "z" }, { date1: "2026-09-01", id: "y" }, { date1: null, id: "a" }, { date1: "2026-09-01", id: "x" }];
    expect([...rows].sort(sheetOrder).map((r) => r.id)).toEqual(["x", "y", "z", "a", "b"]);
  });
});

describe("M-2: a cancelled contract's copies and sheets are kept apart, never chased", () => {
  it("the outstanding lists and counts take contracts not cancelled; the apart count takes the cancelled ones", () => {
    expect(outstandingCopiesWhere("o", false).certificate).toEqual({ status: "ISSUED", contract: { status: { not: "CANCELLED" } } });
    expect(outstandingCopiesWhere("o", true).certificate).toEqual({ status: "ISSUED", contract: { status: "CANCELLED" } });
    expect(outstandingCopiesWhere("o", false).OR).toEqual([{ despatchedOn: null }, { ackRequired: true, acknowledgedOn: null }]);
    expect(openSheetsWhere("o", false)).toEqual({ organisationId: "o", status: "IN_ROUTING", contract: { status: { not: "CANCELLED" } } });
    expect(openSheetsWhere("o", true).contract).toEqual({ status: "CANCELLED" });
  });
  it("the register reads its lists and counts only through these", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/lib/certificate/register.ts", "utf8");
    expect(src).not.toMatch(/certificate: \{ status: "ISSUED" \}/);
    expect(src).not.toMatch(/status: "IN_ROUTING" \}/);
    expect(src.match(/outstandingCopiesWhere\(organisationId, (false|true)\)/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
