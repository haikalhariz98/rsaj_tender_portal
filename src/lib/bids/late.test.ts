import { describe, expect, it } from "vitest";

import { envelope } from "./fixture";
import { admission, lateAdmissionFault, lateMatterFault, type LateMatter } from "./late";

const late1 = envelope({ late: true });
const late2 = envelope({ late: true });
const onTime = envelope();
const matter = (envelopeId: string, outcome: LateMatter["outcome"], over: Partial<LateMatter> = {}): LateMatter => ({ id: `m-${envelopeId}-${outcome}`, bidEnvelopeId: envelopeId, withdrawn: false, sittingCancelled: false, tabledAt: new Date("2026-11-18"), outcome, decisionDate: outcome && outcome !== "DEFERRED" ? new Date("2026-11-20") : null, sittingReference: "MT/1", ...over });

describe("the late-admission gate (OD-6)", () => {
  it("two late envelopes, one decided: LATE_UNDECIDED (1)", () => {
    const f = lateAdmissionFault([late1, late2, onTime], [matter(late1.id, "CARRIED")], true);
    expect(f).toEqual({ code: "LATE_UNDECIDED", level: "block", data: { count: 1, committeeSet: "yes" } });
  });
  it("both decided, either outcome: clear", () => {
    expect(lateAdmissionFault([late1, late2], [matter(late1.id, "CARRIED"), matter(late2.id, "NOT_CARRIED")], true)).toBeNull();
  });
  it("pending or deferred is not decided", () => {
    expect(lateAdmissionFault([late1], [matter(late1.id, null)], true)?.code).toBe("LATE_UNDECIDED");
    expect(lateAdmissionFault([late1], [matter(late1.id, "DEFERRED")], true)?.code).toBe("LATE_UNDECIDED");
  });
  it("a withdrawn envelope, the estimate and an in-time envelope never need admission", () => {
    expect(lateAdmissionFault([envelope({ late: true, status: "WITHDRAWN" }), onTime], [], true)).toBeNull();
  });
  it("a withdrawn matter, or one undecided at a cancelled sitting, counts for nothing", () => {
    expect(admission(late1.id, [matter(late1.id, "CARRIED", { withdrawn: true })]).state).toBe("NOT_TABLED");
    expect(admission(late1.id, [matter(late1.id, null, { sittingCancelled: true })]).state).toBe("NOT_TABLED");
  });
  it("names the unset committee", () => expect(lateAdmissionFault([late1], [], false)?.data?.committeeSet).toBe("no"));
  it("reads each state", () => {
    expect(admission(late1.id, []).state).toBe("NOT_TABLED");
    expect(admission(late1.id, [matter(late1.id, null)]).state).toBe("PENDING");
    expect(admission(late1.id, [matter(late1.id, "DEFERRED")]).state).toBe("DEFERRED");
    expect(admission(late1.id, [matter(late1.id, "CARRIED")]).state).toBe("ADMITTED");
    expect(admission(late1.id, [matter(late1.id, "NOT_CARRIED")]).state).toBe("NOT_ADMITTED");
    // Deferred, then tabled again and pending: pending.
    expect(admission(late1.id, [matter(late1.id, "DEFERRED"), matter(late1.id, null)]).state).toBe("PENDING");
  });
});

describe("tabling a late envelope's admission (FR-CTE-008)", () => {
  const base = { exerciseCancelled: false, committeeCode: "TB" as string | null, envelope: late1, matters: [] as LateMatter[], sitting: { committeeCode: "TB", frozen: false } };
  const codes = (i: Partial<typeof base>) => lateMatterFault({ ...base, ...i }).map((f) => f.code);
  it("at a sitting of the method's committee", () => expect(codes({})).toEqual([]));
  it("refused: not late, already tabled, decided, wrong committee, committee not set, sitting closed", () => {
    expect(codes({ envelope: onTime })).toEqual(["NOT_LATE"]);
    expect(codes({ matters: [matter(late1.id, null)] })).toEqual(["ALREADY_TABLED"]);
    expect(codes({ matters: [matter(late1.id, "NOT_CARRIED")] })).toEqual(["ALREADY_DECIDED"]);
    expect(codes({ sitting: { committeeCode: "OTHER", frozen: false } })).toEqual(["OTHER_COMMITTEE"]);
    expect(codes({ committeeCode: null })).toEqual(["COMMITTEE_NOT_SET"]);
    expect(codes({ sitting: { committeeCode: "TB", frozen: true } })).toEqual(["SITTING_CLOSED"]);
  });
  it("again after a deferral", () => expect(codes({ matters: [matter(late1.id, "DEFERRED")] })).toEqual([]));
  it("never a withdrawn envelope or the estimate", () => {
    expect(codes({ envelope: envelope({ late: true, status: "WITHDRAWN" }) })).toEqual(["WITHDRAWN"]);
    expect(codes({ envelope: envelope({ kind: "COMPANY_ESTIMATE" }) })).toEqual(["NOT_A_BID"]);
  });
});
