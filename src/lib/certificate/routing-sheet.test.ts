import { describe, expect, it } from "vitest";

import { parseSen } from "@/lib/money";

import { checkFaults, elapsedDays, freezeRoutingType, receivedFaults, routingSheet, targetFor, typeFaults, verdictOf, type CheckDef, type RouteRow, type RoutingTypeSnapshot, type SheetInput, type TypeNow } from "./routing-sheet";

/**
 * FR-CRT-007–009, ADR 0023. The spec's targets (FR-CRT-008) as fixture rows, never seeded: 4 weeks for
 * non-completion, practical completion and making good defects; a quotation variation 2 weeks up to 20%
 * and 6 weeks above (rulings test "20.00% → 2 weeks, 20.01% → 6 weeks"); interim and final account
 * variant (i) 21 + 21 + 10 = 52 days and variant (ii) 21 + 5 + 15 = 41 days.
 */

const def = (order: number, over: Partial<CheckDef> = {}): CheckDef => ({ order, kind: order === 1 ? "CHECKED" : order === 2 ? "VERIFIED" : "ENDORSED", labelEn: `Check ${order}`, labelMs: null, officeCode: null, officeLabel: null, targetDays: null, ...over });
const type = (over: Partial<RoutingTypeSnapshot> = {}): RoutingTypeSnapshot => ({ typeId: "t", code: "t", labelEn: "Sheet", labelMs: null, subject: "CERTIFICATE", certificateKind: null, upperEdgeInclusive: true, provenance: "ASSUMED", checks: [def(1), def(2)], targets: [], frozenOn: "2026-09-01", ...over });
const target = (targetDays: number, pctMin: string | null = null, pctMax: string | null = null) => ({ pctMin, pctMax, targetDays, provenance: "ASSUMED" as const });
const route = (id: string, openedOn: string, status: string, decidedOn: string | null, n = 0): RouteRow => ({
  id,
  status,
  openedOn,
  createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, n)),
  steps: [
    { sequence: 1, roleLabel: "Head of Section", actingRoleLabel: null, act: "R", committeeCode: null, decision: status === "PENDING" ? "PENDING" : "DONE", decidedByName: "A", decidedOn, receivedOn: null },
    { sequence: 2, roleLabel: "Chief Executive", actingRoleLabel: null, act: "A", committeeCode: null, decision: status === "APPROVED" ? "DONE" : status === "REJECTED" ? "REJECTED" : "PENDING", decidedByName: status === "PENDING" ? null : "B", decidedOn: status === "PENDING" ? null : decidedOn, receivedOn: null },
  ],
});
const sheet = (over: Partial<SheetInput> = {}) => routingSheet({ type: type(), receivedOn: "2026-09-01", routes: [], checks: [], ratio: null, today: "2026-10-02", ...over });
const ratio = (num: string, den: string) => ({ num: parseSen(num), den: parseSen(den) });

/// No approval route yet: nothing on the route bounds the received day (6.14 inc 1 fix R-5).
const NO_ROUTE = { firstOpenedOn: null, firstDecidedOn: null };

describe("elapsed against the target (FR-CRT-008, OD-3 A calendar days)", () => {
  const four = type({ targets: [target(28)] });
  it("4 weeks for non-completion: DATE (1) 2026-09-01, DATE (2) 2026-09-29 → 28 days, met", () => {
    expect(elapsedDays("2026-09-01", "2026-09-29")).toBe(28);
    const s = sheet({ type: four, routes: [route("r1", "2026-09-10", "APPROVED", "2026-09-29")] });
    expect(s.date2).toBe("2026-09-29");
    expect(s.verdict).toEqual({ state: "MET", elapsed: 28, target: 28 });
  });
  it("DATE (2) 2026-09-30 → 29 days, 1 day over", () => {
    const s = sheet({ type: four, routes: [route("r1", "2026-09-10", "APPROVED", "2026-09-30")] });
    expect(s.verdict).toEqual({ state: "OVER", elapsed: 29, target: 28, by: 1 });
  });
  it("open: the days so far against the target", () => {
    expect(sheet({ type: four, routes: [route("r1", "2026-09-10", "PENDING", null)] }).verdict).toEqual({ state: "OPEN", soFar: 31, target: 28, overBy: 3 });
  });
  it("no target set reads not measured, never met", () => {
    const s = sheet({ routes: [route("r1", "2026-09-10", "APPROVED", "2026-09-29")] });
    expect(s.target).toEqual({ state: "NOT_SET" });
    expect(s.verdict).toEqual({ state: "NOT_MEASURED", elapsed: 28 });
  });
  it("no DATE (1): not started", () => {
    expect(verdictOf(null, null, "2026-10-02", { state: "NOT_SET" })).toEqual({ state: "NOT_STARTED" });
  });
});

describe("banded targets on the exact ratio (ADR 0024)", () => {
  const quotation = type({ targets: [target(14, null, "20"), target(42, "20", null)] });
  it("rulings test: 20.00% → 2 weeks, 20.01% → 6 weeks", () => {
    expect(targetFor(quotation, ratio("20000.00", "100000.00"))).toMatchObject({ state: "SET", days: 14 });
    expect(targetFor(quotation, ratio("20010.00", "100000.00"))).toMatchObject({ state: "SET", days: 42 });
  });
  it("the other side of the edge, configured: 20.00% → 6 weeks", () => {
    expect(targetFor({ ...quotation, upperEdgeInclusive: false }, ratio("20000.00", "100000.00"))).toMatchObject({ state: "SET", days: 42 });
  });
  it("the side not decided: exactly 20.00% has no target, 19.99% has", () => {
    expect(targetFor({ ...quotation, upperEdgeInclusive: null }, ratio("20000.00", "100000.00"))).toEqual({ state: "EDGE_UNDECIDED", edge: "20" });
    expect(targetFor({ ...quotation, upperEdgeInclusive: null }, ratio("19990.00", "100000.00"))).toMatchObject({ state: "SET", days: 14 });
  });
  it("a banded type with no ratio handed in has no target", () => {
    expect(targetFor(quotation, null)).toEqual({ state: "NO_RATIO" });
  });
  it("no band covers it; two unbanded rows overlap", () => {
    expect(targetFor(type({ targets: [target(14, "50", null)] }), ratio("1.00", "100.00"))).toEqual({ state: "NO_BAND" });
    expect(targetFor(type({ targets: [target(14), target(28)] }), null)).toEqual({ state: "OVERLAP" });
  });
});

describe("printed totals and their parts (OQ-17)", () => {
  it("interim variant (i): 21 + 21 + 10 = 52 days; variant (ii): 21 + 5 + 15 = 41 days", () => {
    const i = sheet({ type: type({ checks: [def(1, { targetDays: 21 }), def(2, { targetDays: 21 }), def(3, { targetDays: 10 })], targets: [target(52)] }) });
    expect(i.parts).toEqual({ sum: 52, differs: false });
    const ii = sheet({ type: type({ checks: [def(1, { targetDays: 21 }), def(2, { targetDays: 5 }), def(3, { targetDays: 15 })], targets: [target(41)] }) });
    expect(ii.parts).toEqual({ sum: 41, differs: false });
  });
  it("a type whose printed total differs from the sum of its parts shows both", () => {
    const s = sheet({ type: type({ checks: [def(1, { targetDays: 14 }), def(2, { targetDays: 14 })], targets: [target(21)] }) });
    expect(s.parts).toEqual({ sum: 28, differs: true });
    expect(s.target).toMatchObject({ days: 21 });
  });
  it("no parts where a stage prints no days", () => {
    expect(sheet({ type: type({ checks: [def(1, { targetDays: 21 }), def(2)] }) }).parts).toBeNull();
  });
});

describe("iterations: each resubmission side by side (FR-CRT-009, ADR 0009)", () => {
  it("a refused route and its resubmission are two iterations, each with its own checks and days", () => {
    const s = sheet({
      routes: [route("r2", "2026-09-15", "APPROVED", "2026-09-25", 1), route("r1", "2026-09-05", "REJECTED", "2026-09-10", 0)],
      checks: [
        { iteration: 1, defOrder: 1, personName: "Checker", on: "2026-09-02", note: "" },
        { iteration: 1, defOrder: 2, personName: "Verifier", on: "2026-09-03", note: "" },
        { iteration: 2, defOrder: 1, personName: "Checker", on: "2026-09-16", note: "resubmitted" },
      ],
    });
    expect(s.iterations.map((i) => [i.n, i.receivedOn, i.route?.id, i.endedOn, i.elapsed])).toEqual([
      [1, "2026-09-01", "r1", "2026-09-10", 9],
      [2, "2026-09-15", "r2", "2026-09-25", 10],
    ]);
    expect(s.iterations[1].checks.map((c) => c.recorded?.personName ?? null)).toEqual(["Checker", null]);
    expect(s.current.n).toBe(2);
    expect(s.checksDone).toBe(false);
    expect(s.routeState).toBe("APPROVED");
    expect(s.date2).toBe("2026-09-25");
  });
  it("no route yet: one iteration", () => {
    const s = sheet();
    expect(s.iterations).toHaveLength(1);
    expect(s.routeState).toBe("NONE");
    expect(s.date2).toBeNull();
  });
});

describe("recording a check", () => {
  const base = (over: Partial<Parameters<typeof checkFaults>[0]> = {}) => ({ open: true, sheet: sheet(), defOrder: 1, person: { id: "p", name: "P", isActive: true }, holders: null, on: "2026-09-02", today: "2026-10-02", ...over });
  const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
  it("in order, on or after DATE (1), not in the future", () => {
    expect(codes(checkFaults(base()))).toEqual([]);
    expect(codes(checkFaults(base({ defOrder: 2 })))).toEqual(["CHECK_OUT_OF_ORDER"]);
    expect(codes(checkFaults(base({ on: "2026-08-31" })))).toEqual(["BEFORE_RECEIVED"]);
    expect(codes(checkFaults(base({ on: "2026-10-03" })))).toEqual(["FUTURE_DATE"]);
  });
  it("needs DATE (1) first, an open sheet, and a check not already recorded", () => {
    expect(codes(checkFaults(base({ sheet: sheet({ receivedOn: null }), on: "2026-09-02" })))).toEqual(["RECEIVED_NOT_RECORDED"]);
    expect(codes(checkFaults(base({ open: false })))).toEqual(["SHEET_CLOSED"]);
    const done = sheet({ checks: [{ iteration: 1, defOrder: 1, personName: "x", on: "2026-09-02", note: "" }] });
    expect(codes(checkFaults(base({ sheet: done })))).toEqual(["ALREADY_CHECKED"]);
    expect(codes(checkFaults(base({ sheet: done, defOrder: 2, on: "2026-09-01" })))).toEqual(["BEFORE_EARLIER_CHECK"]);
  });
  it("where the check names an office, a holder or a delegate of it", () => {
    const office = sheet({ type: type({ checks: [def(1, { officeCode: "HOS", officeLabel: "Head of Section" })] }) });
    expect(codes(checkFaults(base({ sheet: office, holders: { holderIds: ["q"], delegateIds: [] } })))).toEqual(["NOT_HOLDER"]);
    expect(codes(checkFaults(base({ sheet: office, holders: { holderIds: ["q"], delegateIds: ["p"] } })))).toEqual([]);
  });
  it("DATE (1): not in the future, not after the first check", () => {
    expect(receivedFaults(true, "2026-10-03", "2026-10-02", null, NO_ROUTE).map((f) => f.code)).toEqual(["FUTURE_DATE"]);
    expect(receivedFaults(true, "2026-09-05", "2026-10-02", "2026-09-02", NO_ROUTE).map((f) => f.code)).toEqual(["AFTER_CHECKS"]);
    expect(receivedFaults(false, "2026-09-01", "2026-10-02", null, NO_ROUTE).map((f) => f.code)).toEqual(["SHEET_CLOSED"]);
  });
});

describe("types", () => {
  const now: TypeNow = { id: "t", code: "t", labelEn: "Variation (quotation)", labelMs: null, subject: "CERTIFICATE", certificateKind: "VARIATION", upperEdgeInclusive: true, provenance: "ASSUMED", retiredOn: null, checks: [def(2), def(1)], targets: [target(14, null, "20")] };
  it("frozen with its checks in order; a later edit to the type does not move it", () => {
    const frozen = freezeRoutingType(now, "2026-09-01");
    expect(frozen.checks.map((c) => c.order)).toEqual([1, 2]);
    (now.targets as unknown as { targetDays: number }[])[0].targetDays = 99;
    expect(frozen.targets[0].targetDays).toBe(14);
  });
  it("refused for another kind, another subject, or once retired", () => {
    expect(typeFaults(now, "CERTIFICATE", "VARIATION", "2026-10-02")).toEqual([]);
    expect(typeFaults(now, "CERTIFICATE", "INTERIM_PAYMENT", "2026-10-02").map((f) => f.code)).toEqual(["TYPE_OTHER_KIND"]);
    expect(typeFaults(now, "AWARD", null, "2026-10-02").map((f) => f.code)).toEqual(["TYPE_OTHER_SUBJECT"]);
    expect(typeFaults({ ...now, retiredOn: "2026-10-02" }, "CERTIFICATE", "VARIATION", "2026-10-02").map((f) => f.code)).toEqual(["TYPE_RETIRED"]);
    expect(typeFaults({ ...now, retiredOn: "2026-10-03" }, "CERTIFICATE", "VARIATION", "2026-10-02")).toEqual([]);
    expect(typeFaults(null, "CERTIFICATE", null, "2026-10-02").map((f) => f.code)).toEqual(["TYPE_NOT_FOUND"]);
  });
});
