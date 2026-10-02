import { describe, expect, it } from "vitest";

import { barred, standing, type StandingEventFacts } from "./standing";

const on = "2026-10-01";
const ev = (o: Partial<StandingEventFacts> & Pick<StandingEventFacts, "id" | "kind">): StandingEventFacts => ({ effectiveOn: "2026-09-01", endsOn: null, offenceNo: null, reasonLabel: "A reason", reinstatesEventId: null, liftsEventId: null, flaggedDocumentIds: [], ...o });
const registered = { status: "REGISTERED" as const };
const clean = [{ typeLabel: "Works board certificate", state: "VALID" as const }];
const expired = [{ typeLabel: "Works board certificate", state: "EXPIRED" as const }, { typeLabel: "Tax clearance", state: "VALID" as const }];

describe("standing is derived, never stored (FR-VND-010, OD-7 A)", () => {
  it("an applicant or a rejected supplier is not registered, whatever else is recorded", () => {
    expect(standing({ status: "APPLICANT" }, [ev({ id: "b", kind: "BLACKLIST", offenceNo: 1 })], expired, { autoSuspendOnLapse: true }, on).standing).toBe("NOT_REGISTERED");
    expect(standing({ status: "REJECTED" }, [], clean, { autoSuspendOnLapse: true }, on).standing).toBe("NOT_REGISTERED");
  });

  it("precedence: blacklisted over cancelled over suspended over suspended on lapse over active", () => {
    const b = ev({ id: "b", kind: "BLACKLIST", offenceNo: 1, endsOn: "2031-09-30" });
    const c = ev({ id: "c", kind: "REGISTRATION_CANCELLED" });
    const s = ev({ id: "s", kind: "SUSPEND" });
    const p = { autoSuspendOnLapse: true };
    expect(standing(registered, [b, c, s], expired, p, on).standing).toBe("BLACKLISTED");
    expect(standing(registered, [c, s], expired, p, on).standing).toBe("CANCELLED");
    expect(standing(registered, [s], expired, p, on).standing).toBe("SUSPENDED");
    expect(standing(registered, [], expired, p, on).standing).toBe("SUSPENDED_ON_LAPSE");
    expect(standing(registered, [], clean, p, on).standing).toBe("ACTIVE");
  });

  it("a suspension under a blacklisting is still reported, so it is not forgotten", () => {
    const r = standing(registered, [ev({ id: "b", kind: "BLACKLIST", offenceNo: 2 }), ev({ id: "s", kind: "SUSPEND" })], clean, { autoSuspendOnLapse: null }, on);
    expect(r.standing).toBe("BLACKLISTED");
    expect(r.suspension?.id).toBe("s");
  });

  describe("an expired mandatory document (OD-7)", () => {
    it("autoSuspendOnLapse not set: active, and says the lapse rule is not set (never quietly suspended or clean)", () => {
      const r = standing(registered, [], expired, { autoSuspendOnLapse: null }, on);
      expect(r.standing).toBe("ACTIVE");
      expect(r.notes[0]).toEqual({ code: "LAPSE_RULE_NOT_SET", level: "warn", data: { types: "Works board certificate" } });
    });
    it("false: active, with the expiry noted", () => {
      const r = standing(registered, [], expired, { autoSuspendOnLapse: false }, on);
      expect(r.standing).toBe("ACTIVE");
      expect(r.notes[0].code).toBe("MANDATORY_EXPIRED");
    });
    it("true: suspended on lapse, naming what lapsed", () => {
      const r = standing(registered, [], expired, { autoSuspendOnLapse: true }, on);
      expect(r).toMatchObject({ standing: "SUSPENDED_ON_LAPSE", lapsed: ["Works board certificate"] });
    });
    it("nothing expired: active with no note, whatever the switch", () => {
      for (const v of [null, false, true]) expect(standing(registered, [], clean, { autoSuspendOnLapse: v }, on)).toMatchObject({ standing: "ACTIVE", notes: [] });
    });
  });

  it("a reinstatement ends its suspension; a lift ends its blacklisting", () => {
    const s = ev({ id: "s", kind: "SUSPEND" });
    expect(standing(registered, [s, ev({ id: "r", kind: "REINSTATE", reinstatesEventId: "s", effectiveOn: "2026-09-20" })], clean, { autoSuspendOnLapse: null }, on).standing).toBe("ACTIVE");
    const b = ev({ id: "b", kind: "BLACKLIST", offenceNo: 2 });
    expect(standing(registered, [b, ev({ id: "l", kind: "BLACKLIST_LIFT", liftsEventId: "b", effectiveOn: "2026-09-20" })], clean, { autoSuspendOnLapse: null }, on).standing).toBe("ACTIVE");
  });

  it("a first offence ends after its last day; a second has no end", () => {
    const first = ev({ id: "b", kind: "BLACKLIST", offenceNo: 1, effectiveOn: "2021-10-01", endsOn: "2026-09-30" });
    expect(standing(registered, [first], clean, { autoSuspendOnLapse: null }, "2026-09-30").standing).toBe("BLACKLISTED");
    const after = standing(registered, [first], clean, { autoSuspendOnLapse: null }, "2026-10-01");
    expect(after.standing).toBe("ACTIVE");
    expect(after.notes).toContainEqual({ code: "BLACKLIST_ENDED", level: "info", data: { endsOn: "2026-09-30" } });
    const second = ev({ id: "b2", kind: "BLACKLIST", offenceNo: 2, effectiveOn: "2021-10-01" });
    expect(standing(registered, [second], clean, { autoSuspendOnLapse: null }, "2040-01-01").standing).toBe("BLACKLISTED");
  });

  it("an event dated after the day is not in effect yet, and is noted", () => {
    const r = standing(registered, [ev({ id: "s", kind: "SUSPEND", effectiveOn: "2026-10-02" })], clean, { autoSuspendOnLapse: null }, on);
    expect(r.standing).toBe("ACTIVE");
    expect(r.notes).toContainEqual({ code: "SCHEDULED", level: "info", data: { kind: "SUSPEND", effectiveOn: "2026-10-02" } });
  });

  it("what bars a supplier", () => {
    expect(["BLACKLISTED", "CANCELLED", "SUSPENDED", "SUSPENDED_ON_LAPSE"].every((s) => barred(s as never))).toBe(true);
    expect(barred("ACTIVE")).toBe(false);
    expect(barred("NOT_REGISTERED")).toBe(false);
  });
});
