import { describe, expect, it } from "vitest";

import { copyState, mergedPage, newestFirst, pageOf, sheetCounts, sheetOrder } from "./library";
import type { Verdict } from "./routing-sheet";

const at = (iso: string, id: string) => ({ at: new Date(iso), id });

describe("the Library: two sources listed as one, newest first", () => {
  const certs = [at("2026-09-30T10:00:00Z", "c3"), at("2026-09-20T10:00:00Z", "c2"), at("2026-09-01T10:00:00Z", "c1")];
  const awards = [at("2026-09-25T10:00:00Z", "a2"), at("2026-09-20T10:00:00Z", "a1")];
  it("merges exactly across pages; two frozen in one instant are ordered by id", () => {
    expect(mergedPage(certs, awards, 0, 2).map((x) => x.id)).toEqual(["c3", "a2"]);
    expect(mergedPage(certs, awards, 2, 2).map((x) => x.id)).toEqual(["a1", "c2"]);
    expect(mergedPage(certs, awards, 4, 2).map((x) => x.id)).toEqual(["c1"]);
  });
  it("property: every page of a merge equals the same page of one sorted list", () => {
    let seed = 11;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let run = 0; run < 100; run++) {
      const a = Array.from({ length: Math.floor(rnd() * 12) }, (_, i) => at(new Date(Date.UTC(2026, 8, 1 + Math.floor(rnd() * 5))).toISOString(), `a${i}`)).sort(newestFirst);
      const b = Array.from({ length: Math.floor(rnd() * 12) }, (_, i) => at(new Date(Date.UTC(2026, 8, 1 + Math.floor(rnd() * 5))).toISOString(), `b${i}`)).sort(newestFirst);
      const all = [...a, ...b].sort(newestFirst);
      for (let p = 0; p * 5 < all.length; p++) expect(mergedPage(a.slice(0, (p + 1) * 5), b.slice(0, (p + 1) * 5), p * 5, 5)).toEqual(all.slice(p * 5, p * 5 + 5));
    }
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
