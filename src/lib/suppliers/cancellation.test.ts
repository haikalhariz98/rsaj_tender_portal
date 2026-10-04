import { describe, expect, it } from "vitest";

import { recordCancellationFaults, withdrawCancellationFaults, type CancellationContext, type CancellationInput } from "./cancellation";
import { hasFaultText, supplierFaultText } from "./labels";
import { barred, standing, type StandingEventFacts } from "./standing";

/**
 * 615-C2 as narrowed (BD-613-91): a registration body's cancellation of a supplier's registration, recorded as a fact,
 * one at a time, and withdrawn with a reason when recorded in error. Worked example: Syarikat Contoh's registration
 * with a works board is cancelled by the board's notice WB/2026/118 from 1 October 2026; recorded on 2 October, the
 * supplier is CANCELLED and barred from a sale. Recorded in error (it was another company's notice), it is withdrawn
 * with that reason: the row stays, and the supplier is ACTIVE again, as if it had never been recorded.
 */

const on = "2026-10-02";
const ev = (o: Partial<StandingEventFacts> & Pick<StandingEventFacts, "id" | "kind">): StandingEventFacts => ({ effectiveOn: "2026-10-01", endsOn: null, offenceNo: null, reasonLabel: "", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], withdrawn: false, cancelledBy: null, ...o });
const clean = [{ typeLabel: "Works board certificate", state: "VALID" as const }];
const read = (events: StandingEventFacts[]) => standing({ status: "REGISTERED" }, events, clean, { autoSuspendOnLapse: null }, on);

const ok: CancellationInput = { bodyId: "body1", reference: "WB/2026/118", effectiveOn: "2026-10-01", personActive: true };
const ctx = (o: Partial<CancellationContext> = {}): CancellationContext => ({ today: on, status: "REGISTERED", registeredOn: "2025-01-15", reading: read([]), bodyConfigured: true, ...o });
const codes = (fs: { code: string }[]) => fs.map((f) => f.code);

describe("recording a registration body's cancellation (615-C2)", () => {
  it("the worked example records, and the supplier is then cancelled and barred", () => {
    expect(recordCancellationFaults(ok, ctx())).toEqual([]);
    const after = read([ev({ id: "c", kind: "REGISTRATION_CANCELLED" })]);
    expect(after.standing).toBe("CANCELLED");
    expect(barred(after.standing)).toBe(true);
  });
  it("the time zone unset refuses first, alone", () => {
    expect(codes(recordCancellationFaults({ bodyId: null, reference: "", effectiveOn: null, personActive: false }, ctx({ today: null })))).toEqual(["TIME_ZONE_UNSET"]);
  });
  it("only a registered supplier's registration is cancelled", () => {
    for (const status of ["APPLICANT", "REJECTED"]) expect(codes(recordCancellationFaults(ok, ctx({ status })))).toEqual(["CANCELLATION_NEEDS_REGISTRATION"]);
  });
  it("one at a time: a cancellation in effect refuses another, naming since when", () => {
    const f = recordCancellationFaults(ok, ctx({ reading: read([ev({ id: "c", kind: "REGISTRATION_CANCELLED", effectiveOn: "2026-09-20" })]) }));
    expect(f).toEqual([{ code: "ALREADY_CANCELLED", level: "block", data: { since: "2026-09-20" } }]);
  });
  it("a suspension or blacklisting in effect does not refuse it: the body's fact is recorded beside them", () => {
    expect(recordCancellationFaults(ok, ctx({ reading: read([ev({ id: "s", kind: "SUSPEND" })]) }))).toEqual([]);
    expect(recordCancellationFaults(ok, ctx({ reading: read([ev({ id: "b", kind: "BLACKLIST", offenceNo: 1 })]) }))).toEqual([]);
  });
  it("the body is chosen from those configured, and its reference given", () => {
    expect(codes(recordCancellationFaults({ ...ok, bodyId: null }, ctx({ bodyConfigured: null })))).toEqual(["CANCELLING_BODY_REQUIRED"]);
    expect(codes(recordCancellationFaults(ok, ctx({ bodyConfigured: false })))).toEqual(["CANCELLING_BODY_NOT_CONFIGURED"]);
    expect(codes(recordCancellationFaults({ ...ok, reference: "  " }, ctx()))).toEqual(["CANCELLATION_REFERENCE_REQUIRED"]);
  });
  it("the day it takes effect: given, not after today, not before registration (each edge)", () => {
    expect(codes(recordCancellationFaults({ ...ok, effectiveOn: null }, ctx()))).toEqual(["EFFECTIVE_REQUIRED"]);
    expect(recordCancellationFaults({ ...ok, effectiveOn: on }, ctx())).toEqual([]);
    expect(codes(recordCancellationFaults({ ...ok, effectiveOn: "2026-10-03" }, ctx()))).toEqual(["EFFECTIVE_IN_FUTURE"]);
    expect(recordCancellationFaults({ ...ok, effectiveOn: "2025-01-15" }, ctx())).toEqual([]);
    expect(recordCancellationFaults({ ...ok, effectiveOn: "2025-01-14" }, ctx())).toEqual([{ code: "EFFECTIVE_BEFORE_REGISTRATION", level: "block", data: { registeredOn: "2025-01-15" } }]);
  });
  it("an officer is named", () => {
    expect(codes(recordCancellationFaults({ ...ok, personActive: false }, ctx()))).toEqual(["PERSON_REQUIRED"]);
  });
});

describe("withdrawing a cancellation recorded in error (615-C2, BD-613-91)", () => {
  const live = { kind: "REGISTRATION_CANCELLED", withdrawn: false };
  it("with a reason and an officer, a live cancellation is withdrawn", () => {
    expect(withdrawCancellationFaults({ reason: "Another company's notice", personActive: true }, { today: on, event: live })).toEqual([]);
  });
  it("refused without a reason, without an officer, twice, or on another kind of record", () => {
    expect(codes(withdrawCancellationFaults({ reason: " ", personActive: true }, { today: on, event: live }))).toEqual(["CANCELLATION_WITHDRAW_REASON_REQUIRED"]);
    expect(codes(withdrawCancellationFaults({ reason: "x", personActive: false }, { today: on, event: live }))).toEqual(["PERSON_REQUIRED"]);
    expect(codes(withdrawCancellationFaults({ reason: "x", personActive: true }, { today: on, event: { ...live, withdrawn: true } }))).toEqual(["CANCELLATION_ALREADY_WITHDRAWN"]);
    for (const kind of ["SUSPEND", "BLACKLIST", "REINSTATE", "BLACKLIST_LIFT"]) expect(codes(withdrawCancellationFaults({ reason: "x", personActive: true }, { today: on, event: { kind, withdrawn: false } })), kind).toEqual(["NOT_A_CANCELLATION"]);
    expect(codes(withdrawCancellationFaults({ reason: "x", personActive: true }, { today: on, event: null }))).toEqual(["NOT_A_CANCELLATION"]);
    expect(codes(withdrawCancellationFaults({ reason: "", personActive: false }, { today: null, event: null }))).toEqual(["TIME_ZONE_UNSET"]);
  });
  it("the worked example: withdrawn, the record is read as never in effect; the supplier is active again and not barred", () => {
    const withdrawn = ev({ id: "c", kind: "REGISTRATION_CANCELLED", withdrawn: true });
    const r = read([withdrawn]);
    expect(r.standing).toBe("ACTIVE");
    expect(r.cancellation).toBeNull();
    expect(barred(r.standing)).toBe(false);
    // Not even scheduled: a withdrawn cancellation dated later says nothing.
    expect(read([{ ...withdrawn, effectiveOn: "2026-12-01" }]).notes).toEqual([]);
    // Another may then be recorded.
    expect(recordCancellationFaults(ok, ctx({ reading: r }))).toEqual([]);
  });
  it("a withdrawn cancellation beside a live one: the live one stands", () => {
    const r = read([ev({ id: "c1", kind: "REGISTRATION_CANCELLED", withdrawn: true, effectiveOn: "2026-09-30" }), ev({ id: "c2", kind: "REGISTRATION_CANCELLED", effectiveOn: "2026-09-15" })]);
    expect(r.standing).toBe("CANCELLED");
    expect(r.cancellation?.id).toBe("c2");
  });
});

describe("every refusal has words, in English and Malay", () => {
  it("each code", () => {
    const all = ["TIME_ZONE_UNSET", "CANCELLATION_NEEDS_REGISTRATION", "ALREADY_CANCELLED", "CANCELLING_BODY_REQUIRED", "CANCELLING_BODY_NOT_CONFIGURED", "CANCELLATION_REFERENCE_REQUIRED", "EFFECTIVE_REQUIRED", "EFFECTIVE_IN_FUTURE", "EFFECTIVE_BEFORE_REGISTRATION", "PERSON_REQUIRED", "NOT_A_CANCELLATION", "CANCELLATION_ALREADY_WITHDRAWN", "CANCELLATION_WITHDRAW_REASON_REQUIRED"];
    for (const c of all) {
      expect(hasFaultText(c), c).toBe(true);
      const f = { code: c, level: "block" as const, data: { since: "2026-09-20", registeredOn: "2025-01-15" } };
      expect(supplierFaultText(f), c).not.toMatch(/[A-Z]{3,}_[A-Z_]+/);
      expect(supplierFaultText(f, "ms"), c).toBeTruthy();
    }
    expect(supplierFaultText({ code: "ALREADY_CANCELLED", level: "block", data: { since: "2026-09-20" } })).toMatch(/20 Sep 2026/);
  });
});
