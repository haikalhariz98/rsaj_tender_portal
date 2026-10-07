import { describe, expect, it } from "vitest";

import { absentOffices, someoneCanAct } from "./absence";
import { escalationFaultText, escalationText } from "./escalation-labels";
import { MAX_STEP_ESCALATIONS, stepEscalation, type EscalationStep } from "./escalation";

// Invented offices on the requisition chain's shape: Head of Department → Head of
// Division → Functional Director → CEO. The escalation map is configuration.
const roles = {
  HOD: { escalatesToCode: "HODIV" },
  HODIV: { escalatesToCode: "FD" },
  FD: { escalatesToCode: "CEO" },
  CEO: { escalatesToCode: null },
  QC: { escalatesToCode: "CEO" },
};
const step = (s: Partial<EscalationStep> & Pick<EscalationStep, "id" | "sequence" | "roleCode">): EscalationStep => ({ actingRoleCode: null, committeeCode: null, act: "R", decision: "PENDING", escalationCount: 0, ...s });
/// RM49,999.00: Head of Department R → Head of Division A.
const short = [step({ id: "s1", sequence: 1, roleCode: "HOD" }), step({ id: "s2", sequence: 2, roleCode: "HODIV", act: "A" })];
/// RM300,001.00: HoD P → HoDiv R → FD MR → CEO A.
const long = [
  step({ id: "s1", sequence: 1, roleCode: "HOD", act: "P", decision: "DONE" }),
  step({ id: "s2", sequence: 2, roleCode: "HODIV", act: "R" }),
  step({ id: "s3", sequence: 3, roleCode: "FD", act: "MR" }),
  step({ id: "s4", sequence: 4, roleCode: "CEO", act: "A" }),
];
const ctx = (over: Partial<Parameters<typeof stepEscalation>[1]> = {}) => ({
  kind: "NO_AVAILABLE_HOLDER" as const,
  reason: "Away on leave",
  today: "2026-10-01",
  routeOpen: true,
  roles,
  routeSteps: short,
  holderAvailable: false,
  declarerEntitled: null,
  ...over,
});

describe("escalating a pending step (FR-APR-010, FR-APR-012)", () => {
  it("FR-APR-010 test: the Head of Division's office is vacant, so the step goes to the Functional Director, with the reason kept", () => {
    const r = stepEscalation(short[1], ctx({ reason: "Head of Division vacant" }));
    expect(r).toEqual({ ok: true, fromRoleCode: "HODIV", toRoleCode: "FD", kind: "NO_AVAILABLE_HOLDER" });
    expect(escalationText({ roleLabel: "Head of Division", actingRoleLabel: "Functional Director", escalation: "NO_AVAILABLE_HOLDER", escalationReason: "Head of Division vacant", declaredByName: null })).toBe(
      "Functional Director · escalated from Head of Division: nobody able to act held the office — Head of Division vacant",
    );
  });

  it("moves only upward, from the acting office, never down", () => {
    const escalated = { ...short[1], actingRoleCode: "FD", escalationCount: 1 };
    expect(stepEscalation(escalated, ctx())).toMatchObject({ ok: true, fromRoleCode: "FD", toRoleCode: "CEO" });
  });

  it("is refused while someone able to act holds the office", () => {
    expect(stepEscalation(short[1], ctx({ holderAvailable: true }))).toMatchObject({ ok: false, fault: "HOLDER_AVAILABLE" });
  });

  it("is refused for a vacancy on a mandatory step until RSAJ rules (CO-6)", () => {
    expect(stepEscalation(long[2], ctx({ routeSteps: long }))).toMatchObject({ ok: false, fault: "MANDATORY_VACANCY" });
  });

  it("names the setting where the office has nowhere to escalate to", () => {
    const top = step({ id: "x", sequence: 1, roleCode: "CEO", act: "A" });
    const r = stepEscalation(top, ctx({ routeSteps: [top] }));
    expect(r).toEqual({ ok: false, fault: "NO_SUPERIOR_SET", office: "CEO" });
    expect(escalationFaultText(r.ok ? "NOT_PENDING" : r.fault, "CEO")).toMatch(/Users & roles/);
  });

  it("C4: is refused where the superior already has a step on the route — one office would decide two steps", () => {
    const r = stepEscalation(long[1], ctx({ routeSteps: long }));
    expect(r).toEqual({ ok: false, fault: "SUPERIOR_ALREADY_ON_ROUTE", office: "FD" });
    expect(escalationFaultText("SUPERIOR_ALREADY_ON_ROUTE", "Functional Director")).toMatch(/Functional Director already has a step on this route/);
  });

  it("never escalates a committee step, a decided step, a closed route, or without a reason", () => {
    expect(stepEscalation(step({ id: "c", sequence: 1, roleCode: "QC", committeeCode: "QC", act: "MR" }), ctx())).toMatchObject({ fault: "COMMITTEE_STEP" });
    expect(stepEscalation({ ...short[1], decision: "DONE" }, ctx())).toMatchObject({ fault: "NOT_PENDING" });
    expect(stepEscalation(short[1], ctx({ routeOpen: false }))).toMatchObject({ fault: "ROUTE_CLOSED" });
    expect(stepEscalation(short[1], ctx({ reason: " " }))).toMatchObject({ fault: "REASON_REQUIRED" });
    expect(stepEscalation(short[1], ctx({ today: null }))).toMatchObject({ fault: "TIME_ZONE_UNSET" });
  });

  it("stops at the hop limit", () => {
    expect(stepEscalation({ ...short[1], escalationCount: MAX_STEP_ESCALATIONS }, ctx())).toMatchObject({ fault: "TOO_MANY_HOPS" });
  });
});

describe("declaring a conflict of interest (FR-APR-009, CO-6)", () => {
  it("FR-APR-009 test: the declarer recuses and the immediate superior holds the step, the declaration on the trail", () => {
    // RM49,999.00: the Head of Division approves; on a conflict the Functional Director does.
    const r = stepEscalation(short[1], ctx({ kind: "CONFLICT_DECLARED", reason: "My brother-in-law's firm", declarerEntitled: true }));
    expect(r).toEqual({ ok: true, fromRoleCode: "HODIV", toRoleCode: "FD", kind: "CONFLICT_DECLARED" });
  });

  it("C4 applies to a conflict too: the Head of Department's superior already decides a step of this route", () => {
    expect(stepEscalation(short[0], ctx({ kind: "CONFLICT_DECLARED", declarerEntitled: true }))).toEqual({ ok: false, fault: "SUPERIOR_ALREADY_ON_ROUTE", office: "HODIV" });
  });

  it("is allowed on a mandatory person step (DAL §1.5 recuse-and-escalate is not delegation)", () => {
    const route = [step({ id: "m", sequence: 1, roleCode: "HODIV", act: "MR" }), step({ id: "a", sequence: 2, roleCode: "CEO", act: "A" })];
    // HODIV's superior (FD) has no step on this route.
    expect(stepEscalation(route[0], ctx({ kind: "CONFLICT_DECLARED", routeSteps: route, declarerEntitled: true }))).toMatchObject({ ok: true, toRoleCode: "FD" });
  });

  it("is declared only by someone who could decide the step", () => {
    expect(stepEscalation(short[0], ctx({ kind: "CONFLICT_DECLARED", declarerEntitled: false }))).toMatchObject({ fault: "DECLARER_NOT_ENTITLED" });
    expect(stepEscalation(short[0], ctx({ kind: "CONFLICT_DECLARED", declarerEntitled: null }))).toMatchObject({ fault: "DECLARER_REQUIRED" });
  });

  it("reads as a declaration by the declarer, in the words of the step's attribution where it is read, and the name alone where it is not", () => {
    // Phase 2b (decisions log, 2026-10-07): the trail and the screen name the person and say how the act was recorded only from its attribution (signed, or recorded from
  // paper); the fixed words "recorded on behalf of, not signed" were written under every act and were true of some.
    const step = { roleLabel: "Head of Department", actingRoleLabel: "Head of Division", escalation: "CONFLICT_DECLARED" as const, escalationReason: "Related party", declaredByName: "Aminah" };
    expect(escalationText(step)).toBe("Head of Division · escalated from Head of Department: conflict declared by Aminah — Related party");
    expect(escalationText(step, "Conflict declared by Aminah")).toBe("Head of Division · escalated from Head of Department: Conflict declared by Aminah — Related party");
    expect(escalationText(step, "Recorded by Clerk on behalf of Aminah, not signed")).toMatch(/Recorded by Clerk on behalf of Aminah, not signed/);
  });
});

describe("who can act in an office (absence)", () => {
  const holders = (c: string) => ({ A: { holderIds: ["p1"], delegates: [] }, B: { holderIds: ["p2"], delegates: [{ personId: "p3" }] }, V: { holderIds: [], delegates: [] } })[c as "A"];
  it("an office is absent only when every holder and delegate is away; a vacant one is not absent", () => {
    expect(absentOffices(["A", "B", "V"], holders, (p) => p === "p3")).toEqual(["A"]);
  });
  it("nobody can act in a vacant office", () => {
    expect(someoneCanAct(holders("V"), () => true)).toBe(false);
    expect(someoneCanAct(holders("B"), (p) => p === "p3")).toBe(true);
  });
});
