import { describe, expect, it } from "vitest";

import { holdFaults, releaseFaults } from "./hold";
import { documentFaultText, retentionText } from "./labels";
import { disposalFault, retentionState, type RetentionRule } from "./retention";

const codes = (fs: { code: string }[]) => fs.map((f) => f.code);
const rule = (x: Partial<RetentionRule> = {}): RetentionRule => ({ retentionMonths: 84, retentionTrigger: "CONTRACT_FINAL_ACCOUNT", disposalMethod: "DESTROY", disposalAuthorityRoleCode: "RMO", ...x });

describe("retention state (NFR-RET-001)", () => {
  it("unset retention is never ELAPSED, however far ahead today is", () => {
    for (const r of [rule({ retentionMonths: null }), rule({ retentionTrigger: null }), rule({ retentionMonths: null, retentionTrigger: null })]) {
      expect(retentionState(r, "2000-01-01", "2999-12-31").state).toBe("NOT_SET");
    }
    expect(retentionState(rule({ retentionMonths: null, retentionTrigger: null }), null, "2999-12-31")).toEqual({ state: "NOT_SET", missing: ["PERIOD", "TRIGGER"] });
    expect(retentionText(retentionState(rule({ retentionMonths: null }), null, "2026-10-01"))).toBe("Not set");
  });
  it("zero months is not a period: it reads as not set", () => {
    expect(retentionState(rule({ retentionMonths: 0 }), "2020-01-01", "2026-10-01").state).toBe("NOT_SET");
  });
  it("the clock waits for its trigger", () => {
    expect(retentionState(rule(), null, "2026-10-01")).toEqual({ state: "TRIGGER_NOT_REACHED", trigger: "CONTRACT_FINAL_ACCOUNT" });
  });
  it("N months from the trigger day: running until the day before, elapsed on it", () => {
    const r = rule({ retentionMonths: 12, retentionTrigger: "RECEIVED" });
    expect(retentionState(r, "2025-10-01", "2026-09-30")).toEqual({ state: "RUNNING", elapsesOn: "2026-10-01" });
    expect(retentionState(r, "2025-10-01", "2026-10-01")).toEqual({ state: "ELAPSED", elapsedOn: "2026-10-01" });
  });
  it("month ends clamp: 31 January plus one month elapses on 28 February", () => {
    expect(retentionState(rule({ retentionMonths: 1, retentionTrigger: "RECEIVED" }), "2026-01-31", "2026-02-27")).toEqual({ state: "RUNNING", elapsesOn: "2026-02-28" });
  });
});

describe("disposal (built, no caller: nothing is ever deleted in this build)", () => {
  /*
   * NFR-RET-001 worked example. A design-and-build contract's final account was agreed on
   * 15 March 2018. Its class keeps records seven years (84 months) from the final account,
   * to be destroyed on the Records Management Officer's authority. Retention elapsed on
   * 15 March 2025. But the contractor's Design Guarantee Bond is still outstanding on the
   * contract — design liability survives the final account — so disposal is refused,
   * naming the bond.
   */
  it("worked example: D&B contract, retention elapsed, Design Guarantee Bond outstanding → refused", () => {
    const doc = { retention: rule(), triggerDay: "2018-03-15" };
    expect(retentionState(doc.retention, doc.triggerDay, "2026-10-01")).toEqual({ state: "ELAPSED", elapsedOn: "2025-03-15" });
    const f = disposalFault(doc, [], [{ label: "The Design Guarantee Bond" }], "2026-10-01");
    expect(codes(f)).toEqual(["OBLIGATION_OUTSTANDING"]);
    expect(documentFaultText(f[0])).toBe("The Design Guarantee Bond is still outstanding on the record it belongs to.");
    // With the bond discharged, nothing else stands in the way.
    expect(disposalFault(doc, [], [], "2026-10-01")).toEqual([]);
  });
  it("a legal hold blocks disposal with retention elapsed; released, it no longer does", () => {
    const doc = { retention: rule(), triggerDay: "2018-03-15" };
    expect(codes(disposalFault(doc, [{ releasedAt: null }], [], "2026-10-01"))).toEqual(["ON_LEGAL_HOLD"]);
    expect(disposalFault(doc, [{ releasedAt: new Date("2026-01-01T00:00:00Z") }], [], "2026-10-01")).toEqual([]);
  });
  it("retention not set, not started or running refuses", () => {
    expect(codes(disposalFault({ retention: rule({ retentionMonths: null }), triggerDay: "2018-03-15" }, [], [], "2026-10-01"))).toEqual(["RETENTION_NOT_SET"]);
    expect(codes(disposalFault({ retention: rule(), triggerDay: null }, [], [], "2026-10-01"))).toEqual(["TRIGGER_NOT_REACHED"]);
    const running = disposalFault({ retention: rule(), triggerDay: "2024-01-10" }, [], [], "2026-10-01");
    expect(codes(running)).toEqual(["RETENTION_RUNNING"]);
    expect(documentFaultText(running[0])).toBe("It is retained until 10 Jan 2031.");
  });
  it("an unset disposal method or authority refuses", () => {
    expect(codes(disposalFault({ retention: rule({ disposalMethod: null, disposalAuthorityRoleCode: null }), triggerDay: "2018-03-15" }, [], [], "2026-10-01"))).toEqual(["DISPOSAL_METHOD_NOT_SET", "DISPOSAL_AUTHORITY_NOT_SET"]);
  });
});

describe("legal holds (NFR-RET-002)", () => {
  it("are placed by a named person with a reason, one standing at a time", () => {
    expect(holdFaults({ reason: "Arbitration notice received", personId: "p1", standing: [] })).toEqual([]);
    expect(codes(holdFaults({ reason: "", personId: null, standing: [] }))).toEqual(["REASON_REQUIRED", "PERSON_REQUIRED"]);
    expect(codes(holdFaults({ reason: "x", personId: "p1", standing: [{ releasedAt: null }] }))).toEqual(["ALREADY_ON_HOLD"]);
    expect(holdFaults({ reason: "x", personId: "p1", standing: [{ releasedAt: new Date() }] })).toEqual([]);
  });
  it("are released by a named person with a reason; a released hold is not released again", () => {
    expect(releaseFaults({ hold: { releasedAt: null }, reason: "Arbitration withdrawn", personId: "p1" })).toEqual([]);
    expect(codes(releaseFaults({ hold: { releasedAt: null }, reason: "", personId: null }))).toEqual(["REASON_REQUIRED", "PERSON_REQUIRED"]);
    expect(codes(releaseFaults({ hold: { releasedAt: new Date() }, reason: "x", personId: "p1" }))).toEqual(["NOT_ON_HOLD"]);
    expect(codes(releaseFaults({ hold: null, reason: "x", personId: "p1" }))).toEqual(["NOT_ON_HOLD"]);
  });
});
