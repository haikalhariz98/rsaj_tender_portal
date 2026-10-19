import { describe, expect, it } from "vitest";

import { awardSheetFaults, freezeRoutingType, latestRouteState, receivedFaults, routeBounds, routingSheet, type RouteRow, type TypeNow } from "./routing-sheet";

/**
 * 6.14 inc 1 fix round: the received day and the award's sheet.
 * - R-5: the day received (the printed sheet's DATE (1)) is bounded by the route: never after the first route
 *   opened, never after any decision on a route. Unbounded, a received day after the approved day gave a
 *   negative elapsed time, which read "met".
 * - R-6: the award's pre-award sheet takes no check or received day once the appointment route is decided
 *   (and none on a cancelled award); a resubmitted route opens a new round.
 */

const codes = (fs: readonly { code: string }[]) => fs.map((f) => f.code);
const route = (id: string, openedOn: string, status: string, decidedOn: (string | null)[]): RouteRow => ({
  id,
  status,
  openedOn,
  createdAt: new Date(`${openedOn}T06:00:00Z`),
  steps: decidedOn.map((d, i) => ({ sequence: i + 1, roleLabel: `Step ${i + 1}`, actingRoleLabel: null, act: i === decidedOn.length - 1 ? "A" : "R", committeeCode: null, decision: d ? (status === "REJECTED" && i === decidedOn.length - 1 ? "REJECTED" : "DONE") : "PENDING", decidedByName: d ? "Officer" : null, decidedOn: d, receivedOn: null })),
});
const TYPE: TypeNow = { id: "t", code: "t", labelEn: "Sheet", labelMs: null, subject: "CERTIFICATE", certificateKind: null, upperEdgeInclusive: true, provenance: "ASSUMED", retiredOn: null, checks: [], targets: [{ pctMin: null, pctMax: null, targetDays: 14, provenance: "ASSUMED" }] };

describe("R-5: the received day is bounded by the route", () => {
  const routes = [route("r1", "2026-09-10", "REJECTED", ["2026-09-12", "2026-09-15"]), route("r2", "2026-09-20", "APPROVED", ["2026-09-21", "2026-09-25"])];
  it("the bounds are the first route's opening day and the earliest decision on any route", () => {
    expect(routeBounds(routes)).toEqual({ firstOpenedOn: "2026-09-10", firstDecidedOn: "2026-09-12" });
    expect(routeBounds([])).toEqual({ firstOpenedOn: null, firstDecidedOn: null });
    expect(routeBounds([route("r", "2026-09-10", "PENDING", [null])])).toEqual({ firstOpenedOn: "2026-09-10", firstDecidedOn: null });
  });
  it("the day the route opened is allowed; the day after is refused", () => {
    expect(codes(receivedFaults(true, "2026-09-10", "2026-10-01", null, routeBounds(routes)))).toEqual([]);
    expect(codes(receivedFaults(true, "2026-09-11", "2026-10-01", null, routeBounds(routes)))).toEqual(["AFTER_ROUTE_OPENED"]);
  });
  it("a day after a decision is refused for that too", () => {
    expect(codes(receivedFaults(true, "2026-09-26", "2026-10-01", null, routeBounds(routes)))).toEqual(["AFTER_ROUTE_OPENED", "AFTER_DECISION"]);
    // A route whose opening day is recorded later than a decision on it (a bad trail) is still held by the decision.
    expect(codes(receivedFaults(true, "2026-09-13", "2026-10-01", null, { firstOpenedOn: null, firstDecidedOn: "2026-09-12" }))).toEqual(["AFTER_DECISION"]);
  });
  it("the reason: unbounded, a received day after the approved day reads a negative elapsed time as met", () => {
    const sheet = routingSheet({ type: freezeRoutingType(TYPE, "2026-09-01"), receivedOn: "2026-09-30", routes: [routes[1]], checks: [], ratio: null, today: "2026-10-01" });
    expect(sheet.verdict).toEqual({ state: "MET", elapsed: -5, target: 14 });
    expect(codes(receivedFaults(true, "2026-09-30", "2026-10-01", null, routeBounds([routes[1]])))).toEqual(["AFTER_ROUTE_OPENED", "AFTER_DECISION"]);
  });
});

describe("R-6: the award's sheet closes once the appointment route is decided", () => {
  it("a cancelled award, or an approved or refused route: closed; no route or a pending one: open", () => {
    expect(codes(awardSheetFaults(true, "PENDING"))).toEqual(["SHEET_CLOSED"]);
    expect(codes(awardSheetFaults(false, "APPROVED"))).toEqual(["AWARD_ROUTE_DECIDED"]);
    expect(codes(awardSheetFaults(false, "REJECTED"))).toEqual(["AWARD_ROUTE_DECIDED"]);
    expect(codes(awardSheetFaults(false, "PENDING"))).toEqual([]);
    expect(codes(awardSheetFaults(false, "NONE"))).toEqual([]);
  });
  it("the latest route decides it: a refused route followed by a resubmission pending opens a new round", () => {
    const refused = route("r1", "2026-09-10", "REJECTED", ["2026-09-12"]);
    expect(latestRouteState([refused])).toBe("REJECTED");
    expect(latestRouteState([refused, route("r2", "2026-09-20", "PENDING", [null])])).toBe("PENDING");
    expect(latestRouteState([route("r2", "2026-09-20", "APPROVED", ["2026-09-21"]), refused])).toBe("APPROVED");
    expect(latestRouteState([])).toBe("NONE");
  });
});

describe("a recalled route is its own state (6.14 residual)", () => {
  it("never read as waiting for a decision, nor as decided", () => {
    const recalled = route("r1", "2026-09-10", "RECALLED", [null]);
    expect(latestRouteState([recalled])).toBe("RECALLED");
    expect(codes(awardSheetFaults(false, "RECALLED"))).toEqual([]);
    expect(latestRouteState([recalled, route("r2", "2026-09-20", "PENDING", [null])])).toBe("PENDING");
  });
  it("the signing refusal and the page's blocker say recalled, never waiting", async () => {
    const { readFileSync } = await import("node:fs");
    const w = readFileSync(`${process.cwd()}/src/lib/certificate/write.ts`, "utf8");
    expect(w).toMatch(/if \(sheet\.routeState === "RECALLED"\) fs\.push\(\.\.\.one\("ROUTE_RECALLED"\)\);/);
    const page = readFileSync(`${process.cwd()}/src/app/projects/[id]/certificates/[certId]/page.tsx`, "utf8");
    expect(page).toMatch(/sheet\.routeState === "RECALLED"\) reasons\.push\("Route recalled/);
    const { certificateFaultWords } = await import("./fault-text");
    expect(certificateFaultWords({ code: "ROUTE_RECALLED", level: "block" }).en).toMatch(/recalled/); // shortened by note 0005, founder 2026-10-19
    expect(certificateFaultWords({ code: "ROUTE_RECALLED", level: "block" }).en).not.toMatch(/waiting/);
  });
});
