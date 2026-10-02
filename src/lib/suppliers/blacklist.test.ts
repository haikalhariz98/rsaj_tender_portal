import { describe, expect, it } from "vitest";

import { blacklistPeriod, nextOffenceNo, recordFaults, requestBlacklistFaults, requestLiftFaults, requestOpen, routeState, type RequestFacts } from "./blacklist";
import { FIRST_OFFENCE_MONTHS } from "./fixture";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("a blacklisting's period (FR-TRM-017, condition 4)", () => {
  it("worked example: 60 months effective 1 October 2026: endsOn 1 October 2031 (exclusive, the free-from day), last blacklisted day 30 September 2031", () => {
    expect(blacklistPeriod("2026-10-01", 1, FIRST_OFFENCE_MONTHS)).toEqual({ period: { kind: "ENDS", endsOn: "2031-10-01", lastDay: "2031-09-30", months: 60 }, faults: [] });
  });

  it("month-end clamped, as retention elapses (BD-DS-10): 31 August 2026 plus 6 months is free from 28 February 2027", () => {
    expect(blacklistPeriod("2026-08-31", 1, 6).period).toEqual({ kind: "ENDS", endsOn: "2027-02-28", lastDay: "2027-02-27", months: 6 });
  });

  it("a second offence has no end, whatever the months", () => {
    expect(blacklistPeriod("2026-10-01", 2, 60).period).toEqual({ kind: "UNTIL_FURTHER_NOTICE" });
    expect(blacklistPeriod("2026-10-01", 3, null).period).toEqual({ kind: "UNTIL_FURTHER_NOTICE" });
  });

  it("months not set: a first offence cannot be recorded, and says so", () => {
    expect(blacklistPeriod("2026-10-01", 1, null)).toEqual({ period: null, faults: [{ code: "BLACKLIST_PERIOD_NOT_SET", level: "block" }] });
    expect(codes(blacklistPeriod("2026-10-01", 1, 0).faults)).toEqual(["BLACKLIST_PERIOD_NOT_SET"]);
    expect(codes(blacklistPeriod("2026-10-01", 0, 60).faults)).toEqual(["OFFENCE_INVALID"]);
  });

  it("the next offence counts every blacklisting recorded, lifted or not", () => {
    expect(nextOffenceNo([])).toBe(1);
    expect(nextOffenceNo([{ kind: "BLACKLIST" }, { kind: "BLACKLIST_LIFT" }, { kind: "SUSPEND" }])).toBe(2);
  });
});

describe("asking for a blacklisting, or its lifting (OD-8 A)", () => {
  const reason = { appliesTo: "BLACKLIST" as const, retiredOn: null };
  const ctx = { today: "2026-10-01", supplierId: "s1", status: "REGISTERED", standing: "ACTIVE", reason, requests: [] as RequestFacts[] };
  const ask = { reasonId: "r1", personActive: true, sourceAward: null };

  it("a registered supplier, a blacklisting reason and a person: asked", () => {
    expect(requestBlacklistFaults(ask, ctx)).toEqual([]);
  });

  it("refused: not registered, already blacklisted, one already open, a suspension reason, a retired reason, nobody", () => {
    expect(codes(requestBlacklistFaults(ask, { ...ctx, status: "APPLICANT" }))).toEqual(["STANDING_NEEDS_REGISTRATION"]);
    expect(codes(requestBlacklistFaults(ask, { ...ctx, standing: "BLACKLISTED" }))).toEqual(["ALREADY_BLACKLISTED"]);
    expect(codes(requestBlacklistFaults(ask, { ...ctx, requests: [{ kind: "BLACKLIST", route: "PENDING", approvedOn: null, recorded: false }] }))).toEqual(["REQUEST_OPEN"]);
    expect(codes(requestBlacklistFaults(ask, { ...ctx, reason: { appliesTo: "SUSPEND", retiredOn: null } }))).toEqual(["REASON_NOT_FOR_BLACKLISTING"]);
    expect(codes(requestBlacklistFaults(ask, { ...ctx, reason: { appliesTo: "BLACKLIST", retiredOn: "2026-10-01" } }))).toEqual(["REASON_RETIRED"]);
    expect(codes(requestBlacklistFaults({ ...ask, reasonId: null, personActive: false }, ctx))).toEqual(["REASON_REQUIRED", "PERSON_REQUIRED"]);
    expect(codes(requestBlacklistFaults(ask, { ...ctx, today: null }))).toEqual(["TIME_ZONE_UNSET"]);
  });

  it("a refused or recorded request no longer holds the supplier open", () => {
    expect(requestOpen([{ kind: "BLACKLIST", route: "REJECTED", approvedOn: null, recorded: false }])).toBe(false);
    expect(requestOpen([{ kind: "BLACKLIST", route: "APPROVED", approvedOn: "2026-09-01", recorded: true }])).toBe(false);
    expect(requestOpen([{ kind: "BLACKLIST", route: "APPROVED", approvedOn: "2026-09-01", recorded: false }])).toBe(true);
    expect(requestOpen([{ kind: "BLACKLIST", route: "NONE", approvedOn: null, recorded: false }])).toBe(true);
  });

  it("from a cancelled award: only one cancelled for blacklisting, and only its own supplier's", () => {
    expect(requestBlacklistFaults({ ...ask, sourceAward: { cancelledForBlacklisting: true, vendorId: "s1" } }, ctx)).toEqual([]);
    expect(codes(requestBlacklistFaults({ ...ask, sourceAward: { cancelledForBlacklisting: false, vendorId: "s2" } }, ctx))).toEqual(["AWARD_NOT_CANCELLED_FOR_BLACKLISTING", "AWARD_NOT_THIS_SUPPLIER"]);
  });

  it("a lift: only of a blacklisting in effect, and the officer says why", () => {
    expect(requestLiftFaults({ note: "Court order set it aside.", personActive: true }, { today: "2026-10-01", standing: "BLACKLISTED", requests: [] })).toEqual([]);
    expect(codes(requestLiftFaults({ note: " ", personActive: true }, { today: "2026-10-01", standing: "ACTIVE", requests: [] }))).toEqual(["NOT_BLACKLISTED", "STANDING_NOTE_REQUIRED"]);
  });

  it("a request's routing is its newest route's", () => {
    expect(routeState([])).toBe("NONE");
    expect(routeState([{ status: "REJECTED", openedAt: "2026-09-01" }, { status: "PENDING", openedAt: "2026-09-10" }])).toBe("PENDING");
    expect(routeState([{ status: "APPROVED", openedAt: "2026-09-10" }])).toBe("APPROVED");
    expect(routeState([{ status: "RETURNED", openedAt: "2026-09-10" }])).toBe("REJECTED");
  });
});

describe("recording an approved request", () => {
  const approved: RequestFacts = { kind: "BLACKLIST", route: "APPROVED", approvedOn: "2026-09-25", recorded: false };
  const ctx = { today: "2026-10-01", request: approved, standing: "ACTIVE", offenceNo: 1, months: 60 };

  it("a first offence on an approved route: recorded with its period", () => {
    expect(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, ctx)).toEqual({ faults: [], period: { kind: "ENDS", endsOn: "2031-10-01", lastDay: "2031-09-30", months: 60 } });
  });

  it("on the day of the approval itself: recorded; the day before, or after today: refused", () => {
    expect(recordFaults({ effectiveOn: "2026-09-25", personActive: true }, ctx).faults).toEqual([]);
    expect(codes(recordFaults({ effectiveOn: "2026-09-24", personActive: true }, ctx).faults)).toEqual(["EFFECTIVE_BEFORE_DECISION"]);
    expect(codes(recordFaults({ effectiveOn: "2026-10-02", personActive: true }, ctx).faults)).toEqual(["EFFECTIVE_IN_FUTURE"]);
  });

  it("refused: route not approved, already recorded, months not set for a first offence", () => {
    expect(codes(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, { ...ctx, request: { ...approved, route: "PENDING" } }).faults)).toEqual(["ROUTE_NOT_APPROVED"]);
    expect(codes(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, { ...ctx, request: { ...approved, recorded: true } }).faults)).toEqual(["ALREADY_RECORDED"]);
    expect(codes(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, { ...ctx, months: null }).faults)).toEqual(["BLACKLIST_PERIOD_NOT_SET"]);
    expect(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, { ...ctx, months: null, offenceNo: 2 })).toEqual({ faults: [], period: { kind: "UNTIL_FURTHER_NOTICE" } });
  });

  it("a lift needs the blacklisting still in effect, and computes no period", () => {
    const lift: RequestFacts = { kind: "BLACKLIST_LIFT", route: "APPROVED", approvedOn: "2026-09-25", recorded: false };
    expect(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, { ...ctx, request: lift, standing: "BLACKLISTED" })).toEqual({ faults: [], period: null });
    expect(codes(recordFaults({ effectiveOn: "2026-10-01", personActive: true }, { ...ctx, request: lift, standing: "ACTIVE" }).faults)).toEqual(["NOT_BLACKLISTED"]);
  });
});
