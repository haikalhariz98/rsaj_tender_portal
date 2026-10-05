import { describe, expect, it } from "vitest";

import { waitingToBeTabled, type WaitingMatter, type WaitingRoute } from "./waiting";

/**
 * Waiting to be tabled (founder, 2026-10-05): every open route whose current step is a committee's, with no matter
 * tabled for it yet. Derived, never stored.
 */

const step = (sequence: number, over: Partial<WaitingRoute["steps"][number]> = {}): WaitingRoute["steps"][number] => ({
  id: `s${sequence}`,
  sequence,
  roleCode: over.committeeCode ? null : "CEO",
  roleLabel: over.committeeCode ? "Board of Directors" : "Chief Executive",
  actingRoleCode: null,
  actingRoleLabel: null,
  act: "A",
  committeeCode: null,
  decision: "PENDING",
  decidedOn: null,
  escalation: null,
  escalationReason: null,
  committeeDecisionId: null,
  ...over,
});

const route = (over: Partial<WaitingRoute> = {}): WaitingRoute => ({
  routeId: "r1",
  recordKey: "REQUISITION:q1",
  domain: "requisition",
  openedAt: new Date("2026-10-01T00:00:00Z"),
  steps: [step(1, { decision: "DONE", decidedOn: new Date("2026-10-02T00:00:00Z") }), step(2, { committeeCode: "BOARD" })],
  ...over,
});

const matter = (over: Partial<WaitingMatter> = {}): WaitingMatter => ({
  id: "d1",
  recordKey: "REQUISITION:q1",
  domain: "requisition",
  committeeCode: "BOARD",
  act: "A",
  outcome: "PENDING",
  decisionDay: null,
  withdrawn: false,
  sittingCancelled: false,
  citedByStep: false,
  ...over,
});

describe("a route is waiting where its current step is a committee's and nothing is tabled for it", () => {
  it("the Board's step, the Chief Executive's done: waiting for the Board, since the day the step before was decided", () => {
    const out = waitingToBeTabled([route()], [], "2026-10-05");
    expect(out).toEqual([{ routeId: "r1", stepId: "s2", committeeCode: "BOARD", act: "A", waitingSince: "2026-10-02", waitingDays: 3 }]);
  });

  it("the first step a committee's: waiting since the route opened", () => {
    const out = waitingToBeTabled([route({ steps: [step(1, { committeeCode: "BOARD" })] })], [], "2026-10-05");
    expect(out[0]).toMatchObject({ stepId: "s1", waitingSince: "2026-10-01", waitingDays: 4 });
  });

  it("no time zone: still waiting, its days not counted (never UTC's day)", () => {
    expect(waitingToBeTabled([route()], [], null)[0]).toMatchObject({ waitingDays: null, waitingSince: "2026-10-02" });
  });

  it("a person's step is current: not waiting for any committee, even with a committee's step after it", () => {
    const r = route({ steps: [step(1), step(2, { committeeCode: "BOARD" })] });
    expect(waitingToBeTabled([r], [], "2026-10-05")).toEqual([]);
  });

  it("every step decided: nothing waits", () => {
    const r = route({ steps: [step(1, { decision: "DONE" }), step(2, { committeeCode: "BOARD", decision: "DONE", committeeDecisionId: "d0" })] });
    expect(waitingToBeTabled([r], [], "2026-10-05")).toEqual([]);
  });
});

describe("what counts as a matter tabled for the step", () => {
  it("a pending matter for this record, before this committee, for this act: tabled, so not waiting", () => {
    expect(waitingToBeTabled([route()], [matter()], "2026-10-05")).toEqual([]);
  });

  it("decided and not yet cited (the link refused, or a matter from before this change): tabled, citable by hand", () => {
    expect(waitingToBeTabled([route()], [matter({ outcome: "CARRIED", decisionDay: "2026-10-03" })], "2026-10-05")).toEqual([]);
    expect(waitingToBeTabled([route()], [matter({ outcome: "NOT_CARRIED", decisionDay: "2026-10-03" })], "2026-10-05")).toEqual([]);
  });

  it("decided on the route's opening day still counts; decided before it does not (it cannot discharge this route)", () => {
    expect(waitingToBeTabled([route()], [matter({ outcome: "CARRIED", decisionDay: "2026-10-01" })], "2026-10-05")).toEqual([]);
    expect(waitingToBeTabled([route()], [matter({ outcome: "CARRIED", decisionDay: "2026-09-30" })], "2026-10-05")).toHaveLength(1);
  });

  it("deferred: the committee decided nothing, so the step waits to be tabled again", () => {
    expect(waitingToBeTabled([route()], [matter({ outcome: "DEFERRED", decisionDay: "2026-10-03" })], "2026-10-05")).toHaveLength(1);
  });

  it("withdrawn from the agenda, or on a cancelled sitting: not tabled", () => {
    expect(waitingToBeTabled([route()], [matter({ withdrawn: true })], "2026-10-05")).toHaveLength(1);
    expect(waitingToBeTabled([route()], [matter({ sittingCancelled: true })], "2026-10-05")).toHaveLength(1);
  });

  it("already discharging a step (one decision discharges one step): not tabled for this one", () => {
    expect(waitingToBeTabled([route()], [matter({ outcome: "CARRIED", decisionDay: "2026-10-03", citedByStep: true })], "2026-10-05")).toHaveLength(1);
  });

  it("another record, another approval of the same record, another committee or another act: not tabled for it", () => {
    for (const m of [
      matter({ recordKey: "REQUISITION:q2" }),
      matter({ domain: "committee_gate" }),
      matter({ committeeCode: "TENDER_BOARD" }),
      matter({ act: "R" }),
    ]) {
      expect(waitingToBeTabled([route()], [m], "2026-10-05"), JSON.stringify(m)).toHaveLength(1);
    }
  });

  it("one matter tabled for one of two routes of different records leaves the other waiting", () => {
    const other = route({ routeId: "r2", recordKey: "REQUISITION:q2" });
    expect(waitingToBeTabled([route(), other], [matter()], "2026-10-05").map((w) => w.routeId)).toEqual(["r2"]);
  });
});

describe("the list's order", () => {
  it("longest waiting first, then by route", () => {
    const a = route({ routeId: "a", recordKey: "REQUISITION:a", steps: [step(1, { committeeCode: "BOARD" })], openedAt: new Date("2026-10-04T00:00:00Z") });
    const b = route({ routeId: "b", recordKey: "REQUISITION:b", steps: [step(1, { committeeCode: "BOARD" })], openedAt: new Date("2026-09-20T00:00:00Z") });
    const c = route({ routeId: "c", recordKey: "REQUISITION:c", steps: [step(1, { committeeCode: "BOARD" })], openedAt: new Date("2026-09-20T00:00:00Z") });
    expect(waitingToBeTabled([a, c, b], [], "2026-10-05").map((w) => w.routeId)).toEqual(["b", "c", "a"]);
  });
});
