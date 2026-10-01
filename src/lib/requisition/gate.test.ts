import { describe, expect, it } from "vitest";

import type { DecisionRecord } from "@/lib/committee/record";
import { parseSen } from "@/lib/money";

import { anyGateEnded, gateCitationFault, gateFinding, gateRuleFaults, gatesFor, gateState, GATE_DOMAIN, type GateMatter, type GateRuleRow } from "./gate";

// Invented committees and route: the gate is the customer's policy, never a default.
const on = new Date("2026-10-01T00:00:00Z");
const rule = (r: Partial<GateRuleRow> & Pick<GateRuleRow, "id" | "committeeCode">): GateRuleRow => ({
  fundingRouteCode: "CAPITAL",
  subjectEn: "Project proposal",
  act: "R",
  aboveValue: null,
  provenance: "ASSUMED",
  effectiveFrom: new Date("2026-01-01T00:00:00Z"),
  effectiveTo: null,
  sortOrder: 0,
  ...r,
});
const capital = { code: "CAPITAL", committeeGateRequired: true };

describe("which gates an approved requisition must pass (gatesFor)", () => {
  it("blocks while the route has not said whether it has a gate — unset is never a pass (C2)", () => {
    expect(gatesFor({ code: "CAPITAL", committeeGateRequired: null }, [rule({ id: "g1", committeeCode: "TECH" })], parseSen("10000.00"), on)).toEqual({ state: "NOT_SET" });
    expect(gatesFor(null, [], parseSen("10000.00"), on)).toEqual({ state: "NOT_SET" });
  });

  it("has no gate where the route says so", () => {
    expect(gatesFor({ code: "OPEX", committeeGateRequired: false }, [], parseSen("10000.00"), on)).toEqual({ state: "NONE", why: "ROUTE_HAS_NO_GATE" });
  });

  it("blocks where the route needs a gate and no rule is in force for it", () => {
    expect(gatesFor(capital, [], parseSen("10000.00"), on)).toEqual({ state: "RULE_MISSING" });
    expect(gatesFor(capital, [rule({ id: "g1", committeeCode: "TECH", effectiveTo: new Date("2026-06-01T00:00:00Z") })], parseSen("10000.00"), on)).toEqual({ state: "RULE_MISSING" });
    expect(gatesFor(capital, [rule({ id: "g1", committeeCode: "TECH", fundingRouteCode: "OTHER" })], parseSen("10000.00"), on)).toEqual({ state: "RULE_MISSING" });
  });

  it("compares the value in sen and strictly: RM50,000.00 is not above RM50,000.00, RM50,000.01 is", () => {
    const rules = [rule({ id: "g1", committeeCode: "TECH", aboveValue: "50000.00" })];
    expect(gatesFor(capital, rules, parseSen("50000.00"), on)).toEqual({ state: "NONE", why: "NO_RULE_AT_VALUE" });
    expect(gatesFor(capital, rules, parseSen("50000.01"), on)).toMatchObject({ state: "RULES", rules: [{ id: "g1" }] });
  });

  it("gives two gates for two rules on one route (a capital committee alongside a technical one)", () => {
    const rules = [rule({ id: "g2", committeeCode: "CAPEX", sortOrder: 2 }), rule({ id: "g1", committeeCode: "TECH", sortOrder: 1 })];
    const found = gatesFor(capital, rules, parseSen("120000.00"), on);
    expect(found.state).toBe("RULES");
    expect(found.state === "RULES" && found.rules.map((r) => r.id)).toEqual(["g1", "g2"]);
  });
});

const record = (outcome: DecisionRecord["outcome"], day: string, notApproved: DecisionRecord["notApproved"] = null): DecisionRecord => ({
  committee: "Technical Committee",
  meetingReference: `S-${day}`,
  meetingDate: new Date(`${day}T00:00:00Z`),
  subject: "Project proposal",
  matterRef: "REQ/1",
  outcome,
  decisionDate: new Date(`${day}T00:00:00Z`),
  quorum: { required: 3, present: 3, recused: 0 },
  votingRule: { rule: "SIMPLE_MAJORITY", provenance: "ASSUMED" },
  notApproved,
  note: "",
  votes: [],
});
const matter = (id: string, r: DecisionRecord | null, withdrawn = false): GateMatter => ({ id, tabledAt: null, withdrawn, record: r });
const LOOP = { nameEn: "Tidak lulus", kind: "LOOP" as const };
const TERMINAL = { nameEn: "Tidak perlu", kind: "TERMINAL" as const };

describe("where a gate stands (gateState, from decisionRecord only)", () => {
  it("spec acceptance: Tidak lulus returns it; re-tabled and carried (Perlu) passes it", () => {
    const returned = matter("m1", record("NOT_CARRIED", "2026-10-05", LOOP));
    expect(gateState([returned]).state).toBe("RETURNED");
    expect(gateState([returned, matter("m2", record("CARRIED", "2026-10-20"))]).state).toBe("PASSED");
  });

  it("spec acceptance: Tidak Perlu, configured as a terminal not-carried outcome, ends it", () => {
    expect(gateState([matter("m1", record("NOT_CARRIED", "2026-10-05", TERMINAL))]).state).toBe("ENDED");
  });

  it("is awaiting while nothing is decided, deferred, or only withdrawn", () => {
    expect(gateState([]).state).toBe("AWAITING");
    expect(gateState([matter("m1", null)]).state).toBe("AWAITING");
    expect(gateState([matter("m1", record("DEFERRED", "2026-10-05"))]).state).toBe("AWAITING");
    expect(gateState([matter("m1", record("CARRIED", "2026-10-05"), true)]).state).toBe("AWAITING");
  });

  it("blocks on a not-carried decision with no outcome snapshot rather than guessing loop or end", () => {
    expect(gateState([matter("m1", record("NOT_CARRIED", "2026-10-05"))]).state).toBe("OUTCOME_NOT_RECORDED");
  });

  it("reads the latest decided matter, by decision date, whatever order they were cited in", () => {
    const later = matter("m2", record("NOT_CARRIED", "2026-10-20", LOOP));
    const earlier = matter("m1", record("CARRIED", "2026-10-05"));
    expect(gateState([later, earlier]).state).toBe("RETURNED");
  });
});

describe("citing a matter against a gate (gateCitationFault)", () => {
  const gate = { id: "gate1", requisitionId: "r1", committeeCode: "TECH", act: "R", determinedOn: new Date("2026-10-01T00:00:00Z") };
  const m = {
    id: "m1",
    requisitionId: "r1",
    matterKind: "REQUISITION",
    domain: GATE_DOMAIN,
    committeeCode: "TECH",
    act: "R",
    requisitionGateId: null,
    citedOnStep: false,
    withdrawn: false,
    decidedOn: new Date("2026-10-05T00:00:00Z"),
  };
  const awaiting = { state: "AWAITING" as const, decisive: null };

  it("accepts the right matter", () => {
    expect(gateCitationFault(m, gate, awaiting)).toBeNull();
    expect(gateCitationFault({ ...m, decidedOn: null }, gate, awaiting)).toBeNull();
  });

  it.each([
    [{ requisitionId: "r2" }, "NOT_THIS_REQUISITION"],
    [{ domain: "requisition" }, "NOT_GATE_DOMAIN"],
    [{ matterKind: null }, "NOT_GATE_DOMAIN"],
    [{ committeeCode: "CAPEX" }, "OTHER_COMMITTEE"],
    [{ act: "MR" }, "OTHER_ACT"],
    [{ citedOnStep: true }, "CITED_ON_ROUTE_STEP"],
    [{ requisitionGateId: "gate0" }, "ALREADY_CITED"],
    [{ withdrawn: true }, "WITHDRAWN"],
    [{ decidedOn: new Date("2026-09-30T00:00:00Z") }, "DECIDED_BEFORE_GATE"],
  ] as const)("refuses %o as %s", (change, fault) => {
    expect(gateCitationFault({ ...m, ...change }, gate, awaiting)).toBe(fault);
  });

  it("refuses anything once the gate has passed or ended", () => {
    expect(gateCitationFault(m, gate, { state: "PASSED", decisive: null })).toBe("GATE_PASSED");
    expect(gateCitationFault(m, gate, { state: "ENDED", decisive: null })).toBe("GATE_ENDED");
  });

  it("enforces the loop-back: once returned, only a matter decided after the return can move it", () => {
    const returning = matter("m0", record("NOT_CARRIED", "2026-10-05", LOOP));
    const returned = { state: "RETURNED" as const, decisive: returning };
    expect(gateCitationFault({ ...m, decidedOn: new Date("2026-10-05T00:00:00Z") }, gate, returned)).toBe("NOT_AFTER_RETURN");
    expect(gateCitationFault({ ...m, decidedOn: new Date("2026-10-06T00:00:00Z") }, gate, returned)).toBeNull();
    // The returning decision itself is already cited against the gate.
    expect(gateCitationFault({ ...m, id: "m0", requisitionGateId: "gate1" }, gate, returned)).toBe("ALREADY_CITED");
  });
});

describe("what the gates say about opening an exercise (gateFinding)", () => {
  it("is never clear while undetermined", () => {
    expect(gateFinding(false, "NOT_SET", [])).toEqual({ code: "GATES_NOT_DETERMINED", why: "NOT_SET" });
  });
  it("is clear with no gates, or every gate passed", () => {
    expect(gateFinding(true, "NOT_CHECKED", [])).toEqual({ code: "CLEAR" });
    expect(gateFinding(true, "NOT_CHECKED", [{ committeeLabel: "Technical Committee", state: "PASSED" }])).toEqual({ code: "CLEAR" });
  });
  it("speaks for the worst gate", () => {
    const gates = [
      { committeeLabel: "Technical Committee", state: "PASSED" as const },
      { committeeLabel: "Capital Committee", state: "AWAITING" as const },
      { committeeLabel: "Works Committee", state: "ENDED" as const },
    ];
    expect(gateFinding(true, "NOT_CHECKED", gates)).toEqual({ code: "GATE_ENDED", committee: "Works Committee" });
    expect(anyGateEnded(gates)).toBe(true);
    expect(anyGateEnded(gates.slice(0, 2))).toBe(false);
  });
});

describe("saving a gate rule (gateRuleFaults)", () => {
  const known = { routes: ["CAPITAL"], committees: ["TECH", "CAPEX"] };
  const base = { id: "new", fundingRouteCode: "CAPITAL", committeeCode: "TECH", effectiveFrom: new Date("2026-01-01T00:00:00Z"), effectiveTo: null };
  it("names an unknown route or committee and a period that ends before it starts", () => {
    expect(gateRuleFaults({ ...base, fundingRouteCode: "X", committeeCode: "Y", effectiveTo: new Date("2025-01-01T00:00:00Z") }, [], known)).toEqual(["ROUTE_UNKNOWN", "COMMITTEE_UNKNOWN", "ENDS_BEFORE_IT_STARTS"]);
  });
  it("refuses a second rule for the same route and committee in force at the same time, not one that follows it", () => {
    const old = { ...base, id: "g1", effectiveTo: new Date("2026-06-01T00:00:00Z") };
    expect(gateRuleFaults({ ...base, effectiveFrom: new Date("2026-05-01T00:00:00Z") }, [old], known)).toEqual(["OVERLAPS"]);
    expect(gateRuleFaults({ ...base, effectiveFrom: new Date("2026-06-01T00:00:00Z") }, [old], known)).toEqual([]);
    expect(gateRuleFaults({ ...base, committeeCode: "CAPEX" }, [old], known)).toEqual([]);
  });
});
