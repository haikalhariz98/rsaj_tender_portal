import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { computedExtension, extendedDates, grantedExtension, issueMovedFaults, lapsedPolicies, movesScope, newCompletion, raiseFaults, scopeDate } from "./extension";

/**
 * 6.13 Part B run 1b: the extension an EOT certificate grants (FR-EOT-003, 008, 009; OD-B6 A as ruled, BD-613-74). Pure.
 * Fixtures: the plan's B5 worked examples (31 Aug 2026 + 14 → 14 Sep 2026; 10 + (8, 5) → 18).
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);

describe("OD-B6 A: the officer states the days; the computation is a check", () => {
  const rows = [
    { extensionDays: 10, concurrency: "CONSECUTIVE" as const, group: null },
    { extensionDays: 8, concurrency: "CONCURRENT" as const, group: "A" },
    { extensionDays: 5, concurrency: "CONCURRENT" as const, group: "A" },
  ];
  it("consecutive 10 + concurrent group (8, 5) → computed 18", () => expect(computedExtension(rows)).toBe(18));
  it("two concurrent groups each count at their longest", () => expect(computedExtension([...rows, { extensionDays: 3, concurrency: "CONCURRENT", group: "B" }, { extensionDays: 4, concurrency: "CONCURRENT", group: "B" }])).toBe(22));
  it("stated 16 warns GRANT_DIFFERS, never refuses; stated 18 says nothing", () => {
    const g = grantedExtension(rows, 16);
    expect(g).toMatchObject({ computed: 18, granted: 16 });
    expect(g.warnings).toEqual([{ code: "GRANT_DIFFERS", level: "warn", data: { granted: 16, computed: 18 } }]);
    expect(grantedExtension(rows, 18).warnings).toEqual([]);
  });
});

describe("the new date for completion", () => {
  it("31 Aug 2026 + 14 days → 14 Sep 2026 (calendar days)", () => expect(newCompletion("2026-08-31", 14)).toBe("2026-09-14"));
  it("a section's date is the whole works' plus its own extensions; a whole-works extension moves every section with it", () => {
    const v = { dateForCompletion: "2026-08-31", sections: [{ ref: "1", extensionDays: 0 }, { ref: "2", extensionDays: 5 }] };
    expect(scopeDate(v, "WHOLE", null)).toBe("2026-08-31");
    expect(scopeDate(v, "SECTION", "2")).toBe("2026-09-05");
    expect(scopeDate(v, "SECTION", "9")).toBeNull();
    expect(scopeDate({ dateForCompletion: null, sections: [] }, "WHOLE", null)).toBeNull();
  });
  it("section scope moves only its section", () => {
    const v = { dateForCompletion: "2026-08-31", extensionDays: 0, sections: [{ ref: "1", extensionDays: 0 }, { ref: "2", extensionDays: 0 }] };
    expect(extendedDates(v, "SECTION", "2", 14)).toEqual({ dateForCompletion: "2026-08-31", extensionDays: 0, sections: [{ ref: "1", extensionDays: 0 }, { ref: "2", extensionDays: 14 }] });
    expect(extendedDates(v, "WHOLE", null, 14)).toEqual({ dateForCompletion: "2026-09-14", extensionDays: 14, sections: [{ ref: "1", extensionDays: 0 }, { ref: "2", extensionDays: 0 }] });
  });
});

describe("raising the EOT certificate", () => {
  const ok = { entitled: true, matterApproved: true, live: null, grantedDays: 14, bestEndeavours: "FULL" as const, unextendedNote: "", previousCompletion: "2026-08-31" };
  it("passes", () => expect(raiseFaults(ok)).toEqual([]));
  it("only once its matter is approved; one live certificate a claim (BD-613-135)", () => {
    expect(codes(raiseFaults({ ...ok, matterApproved: false }))).toEqual(["MATTER_NOT_APPROVED"]);
    expect(codes(raiseFaults({ ...ok, entitled: false }))).toEqual(["NOT_DETERMINED"]);
    const f = raiseFaults({ ...ok, live: { number: "DEMO/CERT/1" } });
    expect(codes(f)).toEqual(["EOT_CERTIFICATE_LIVE"]);
    expect(f[0].data).toEqual({ number: "DEMO/CERT/1" });
  });
  it("granted days above none; partial best endeavours states the un-extended period; a date to extend", () => {
    expect(codes(raiseFaults({ ...ok, grantedDays: 0 }))).toEqual(["GRANTED_DAYS_REQUIRED"]);
    expect(codes(raiseFaults({ ...ok, grantedDays: null }))).toEqual(["GRANTED_DAYS_REQUIRED"]);
    expect(codes(raiseFaults({ ...ok, bestEndeavours: "PARTIAL" }))).toEqual(["UNEXTENDED_NOTE_REQUIRED"]);
    expect(raiseFaults({ ...ok, bestEndeavours: "PARTIAL", unextendedNote: "Seven days of the delay are not extended: the contractor did not re-sequence the works." })).toEqual([]);
    expect(codes(raiseFaults({ ...ok, previousCompletion: null }))).toEqual(["NO_DATE_FOR_COMPLETION"]);
  });
});

describe("two EOT certificates on one scope (both orders)", () => {
  it("raised after the first issued: reads the first's date, nothing moved", () => expect(issueMovedFaults("2026-09-14", "2026-09-14")).toEqual([]));
  it("raised before the first issued: its issue refused EOT_MOVED, naming the date now", () => {
    expect(issueMovedFaults("2026-08-31", "2026-09-14")).toEqual([{ code: "EOT_MOVED", level: "block", data: { day: "2026-09-14" } }]);
    expect(codes(issueMovedFaults("2026-08-31", null))).toEqual(["EOT_MOVED"]);
  });
});

describe("FR-EOT-009: lapsed policies offered for the S.O.'s self-help", () => {
  it("verified policies whose cover ends before the new date for completion, none else", () => {
    const p = (id: string, periodEnd: string, status = "VERIFIED") => ({ id, kind: "WORKS", policyNo: id, periodEnd, status, sumInsured: parseSen("1000.00") });
    const out = lapsedPolicies([p("a", "2026-09-01"), p("b", "2026-09-14"), p("c", "2026-10-01"), p("d", "2026-09-01", "REJECTED")], "2026-09-14");
    expect(out.map((x) => x.id)).toEqual(["a"]);
  });
});

describe("which damages decisions an extension moves (ADR 0030 §2; Phase 2 close-out stage A, the issue hook)", () => {
  it("a whole-works extension moves every scope; a section's moves that section alone; no scope reads as the whole works", () => {
    const whole = { scope: "WHOLE" as const, sectionRef: null };
    const s1 = { scope: "SECTION" as const, sectionRef: "S1" };
    expect(movesScope(whole, { scope: null, sectionRef: null })).toBe(true);
    expect(movesScope(whole, { scope: "SECTION", sectionRef: "S2" })).toBe(true);
    expect(movesScope(s1, { scope: "SECTION", sectionRef: "S1" })).toBe(true);
    expect(movesScope(s1, { scope: "SECTION", sectionRef: "S2" })).toBe(false);
    expect(movesScope(s1, { scope: "WHOLE", sectionRef: null })).toBe(false);
    expect(movesScope(s1, { scope: null, sectionRef: null })).toBe(false);
  });
});
