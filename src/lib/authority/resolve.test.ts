import { describe, expect, it } from "vitest";

import { DAL_CORE_ROUTING, DAL_FIXTURE } from "./dal-fixture";
import { TEST_MATRIX } from "./fixture";
import {
  approverAct,
  boundaryFaultsAcross,
  boundaryRuleFault,
  committeeActOn,
  inBand,
  regimeFor,
  resolveApproval,
  ruleIsDelegable,
  rulesTiedWith,
} from "./resolve";
import type { Matrix } from "./types";

// Founder, 2026-10-19: English only. The Malay half of this file's word pairs and assertions was removed; the rule assertions are unchanged.

const matrix: Matrix = TEST_MATRIX;

/// The chain as "ROLE:ACT" pairs, which is how a routing sheet reads.
const trace = (steps: { roleCode: string; act: string }[]) =>
  steps.map((s) => `${s.roleCode}:${s.act}`);

describe("value bands", () => {
  it.each([
    [50_000, "PAY_LOW", "MANAGER"],
    [100_000, "PAY_LOW", "MANAGER"],
    [100_000.01, "PAY_MID", "DIRECTOR"],
    [500_000, "PAY_MID", "DIRECTOR"],
    [500_000.01, "PAY_HIGH", "CHIEF"],
  ])("a value of %s resolves to %s approved by %s", (value, ruleKey, approver) => {
    const result = resolveApproval(matrix, { domain: "payment", method: "tender", value });
    expect(result.rule?.ruleKey).toBe(ruleKey);
    expect(result.approverCode).toBe(approver);
  });

  it("builds the chain in order: propose, recommend, approve", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
    });
    expect(trace(result.chain)).toEqual(["CLERK:P", "MANAGER:R", "CHIEF:A"]);
  });
});

describe("a mandatory committee recommendation", () => {
  it("puts the committee in the chain and marks the step non-delegable", () => {
    const result = resolveApproval(matrix, {
      domain: "appointment",
      method: "open",
      value: 180_000,
    });

    expect(result.rule?.ruleKey).toBe("APP_UNDER_BOUNDARY");
    expect(result.committeeCode).toBe("PANEL");
    expect(result.nonDelegable).toBe(true);

    const step = result.chain.find((s) => s.roleCode === "PANEL");
    expect(step?.act).toBe("MR");
    expect(step?.nonDelegable).toBe(true);
    expect(step?.committeeCode).toBe("PANEL");

    expect(result.chain.at(-1)).toMatchObject({ roleCode: "CHIEF", act: "A" });
  });
});

// Where governing documents disagree about which side of a threshold a value falls,
// the organisation chooses. The engine ships the switch.
describe("the boundary between regimes is configurable", () => {
  const exactly = 300_000;

  it("places a value on the boundary in the lower band when inclusive", () => {
    expect(matrix.policy.boundaryInclusive).toBe(true);
    expect(regimeFor(exactly, matrix.policy)).toBe("quotation");

    const result = resolveApproval(matrix, {
      domain: "appointment",
      method: "open",
      value: exactly,
    });
    expect(result.rule?.ruleKey).toBe("APP_UNDER_BOUNDARY");
    expect(result.approverCode).toBe("CHIEF");
  });

  it("places it in the upper band when not", () => {
    const flipped: Matrix = {
      ...matrix,
      policy: { ...matrix.policy, boundaryInclusive: false },
    };
    expect(regimeFor(exactly, flipped.policy)).toBe("tender");

    const result = resolveApproval(flipped, {
      domain: "appointment",
      method: "open",
      value: exactly,
    });
    expect(result.rule?.ruleKey).toBe("APP_OVER_BOUNDARY");
    expect(result.approverCode).toBe("BOARD");
  });

  it("moves only the boundary value itself, never other band edges", () => {
    const flipped = { ...matrix.policy, boundaryInclusive: false };

    // A band edge that is not the boundary stays (min, max].
    expect(inBand(100_000, 0, 100_000, matrix.policy)).toBe(true);
    expect(inBand(100_000, 0, 100_000, flipped)).toBe(true);

    // The boundary itself flips.
    expect(inBand(300_000, 15_000, 300_000, matrix.policy)).toBe(true);
    expect(inBand(300_000, 15_000, 300_000, flipped)).toBe(false);
  });
});

// ADR 0024 Amendment 1 (6.13 Part A step 1): the percentage is the exact ratio of two amounts (5% as RM5,000.00 of
// RM100,000.00, 20% as RM20,000.00 of RM100,000.00). Input shape only; every expectation is unchanged.
describe("percentage bands", () => {
  it("routes a small variation on its percentage alone", () => {
    const result = resolveApproval(matrix, { domain: "variation", pctRatio: { num: 5_000_00n, den: 100_000_00n } });
    expect(result.rule?.ruleKey).toBe("VAR_SMALL");
    expect(result.approverCode).toBe("DIRECTOR");
  });

  it("prefers the rule that also bands on the parent contract value", () => {
    const result = resolveApproval(matrix, {
      domain: "variation",
      pctRatio: { num: 20_000_00n, den: 100_000_00n },
      contractValue: 5_000_000,
    });
    expect(result.rule?.ruleKey).toBe("VAR_LARGE_ON_BIG_CONTRACT");
    expect(result.committeeCode).toBe("PANEL");
  });

  it("falls through when the contract is too small for the specific rule", () => {
    const result = resolveApproval(matrix, {
      domain: "variation",
      pctRatio: { num: 20_000_00n, den: 100_000_00n },
      contractValue: 200_000,
    });
    expect(result.rule).toBeNull();
    expect(result.warnings[0]?.code).toBe("NO_RULE");
  });
});

describe("absence reverts authority upward", () => {
  it("escalates past an absent approver and says so", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      absentRoleCodes: ["CHIEF"],
    });

    expect(result.approverCode).toBe("CHAIR");
    const warning = result.warnings.find((w) => w.code === "ABSENCE");
    expect(warning?.from).toBe("CHIEF");
    expect(warning?.to).toBe("CHAIR");
    expect(warning?.messageEn).toContain("never passes down automatically");
  });

  it("keeps climbing while each successive holder is also absent", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      absentRoleCodes: ["CHIEF", "CHAIR"],
    });
    expect(result.approverCode).toBe("BOARD");
    expect(result.warnings.filter((w) => w.code === "ABSENCE")).toHaveLength(2);
  });

  it("does not escalate when the absent office is not the approver", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      absentRoleCodes: ["DIRECTOR"],
    });
    expect(result.approverCode).toBe("CHIEF");
    expect(result.warnings.some((w) => w.code === "ABSENCE")).toBe(false);
  });
});

describe("nobody approves their own matter", () => {
  it("downgrades the actor to recommender and escalates the approval", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      actorRoleCode: "CHIEF",
    });

    expect(result.approverCode).toBe("CHAIR");
    expect(trace(result.chain)).toEqual(["CLERK:P", "MANAGER:R", "CHIEF:R", "CHAIR:A"]);
    expect(result.warnings.find((w) => w.code === "SELF_APPROVAL")?.to).toBe("CHAIR");
  });
});

describe("an office resolved from the contract value", () => {
  it.each([
    [500_000, "MANAGER"],
    [1_000_000, "MANAGER"],
    [1_000_000.01, "DIRECTOR"],
    [3_000_000, "DIRECTOR"],
    [3_000_000.01, "CHIEF"],
  ])("a contract of %s routes to %s through ordinary banded rows", (contractValue, expected) => {
    expect(resolveApproval(matrix, { domain: "instruction", contractValue }).approverCode).toBe(expected);
  });

  it("will not guess an office when the contract value is unknown", () => {
    // It used to fall back to a hard-coded office. With no value there is no band.
    const result = resolveApproval(matrix, { domain: "instruction" });
    expect(result.chain).toEqual([]);
    expect(result.warnings[0]).toMatchObject({ code: "NO_RULE", level: "err" });
  });
});

describe("standing rules cite configured clauses", () => {
  const withClauses = {
    ...matrix,
    policy: { ...matrix.policy, clauses: { noRule: "Manual 1.6", absence: "Manual 2.3" } },
  };

  it("cites the configured clause", () => {
    const result = resolveApproval(withClauses, { domain: "not_a_real_domain" });
    expect(result.warnings[0].clause).toBe("Manual 1.6");
  });

  it("says the source is not recorded rather than inventing one", () => {
    const result = resolveApproval(matrix, { domain: "not_a_real_domain" });
    expect(result.warnings[0].clause).toBeUndefined();
    expect(result.warnings[0].messageEn).toContain("not recorded");
  });
});

describe("routes that cannot be completed say so", () => {
  it("leaves the approver empty when self-approval has nowhere to go", () => {
    const noEscalation = {
      ...matrix,
      roles: {
        ...matrix.roles,
        MANAGER: { ...matrix.roles.MANAGER, selfApprovalEscalatesToCode: null },
      },
    };
    const result = resolveApproval(noEscalation, {
      domain: "payment",
      method: "tender",
      value: 50_000,
      actorRoleCode: "MANAGER",
    });
    expect(result.approverCode).toBeNull();
    expect(result.warnings.find((w) => w.code === "SELF_APPROVAL")?.level).toBe("err");
  });

  it("flags an absent approver with nobody above them", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 50_000,
      absentRoleCodes: ["MANAGER", "DIRECTOR", "CHIEF", "CHAIR", "BOARD"],
    });
    expect(result.warnings.some((w) => w.code === "ABSENCE" && w.level === "err")).toBe(true);
  });

  it("warns when two rules match equally, instead of picking one silently", () => {
    const twin = { ...matrix.rules.find((r) => r.ruleKey === "INSTR_SMALL")!, ruleKey: "INSTR_TWIN", labelEn: "Twin" };
    const result = resolveApproval({ ...matrix, rules: [...matrix.rules, twin] }, {
      domain: "instruction",
      contractValue: 500_000,
    });
    expect(result.warnings.some((w) => w.code === "AMBIGUOUS" && w.level === "err")).toBe(true);
  });
});

describe("the approver's act", () => {
  it("is mandatory approval exactly when the approver is mandatory", () => {
    expect(approverAct({ approverMandatory: true })).toBe("MA");
    expect(approverAct({ approverMandatory: false })).toBe("A");
  });
});

describe("matters with no rule behind them", () => {
  it("resolves but warns that the route is an assumption", () => {
    const result = resolveApproval(matrix, { domain: "retention_release", value: 50_000 });
    expect(result.rule?.ruleKey).toBe("RETENTION_GAP");

    const warning = result.warnings.find((w) => w.code === "GAP_RULE");
    expect(warning?.level).toBe("gap");
    // 0005 R3, founder 2026-10-19: the warning is shortened and still says the route is assumed.
    expect(warning?.messageEn).toContain("Route assumed");
  });

  it("never outranks a documented rule", () => {
    const result = resolveApproval(matrix, { domain: "payment", method: "tender", value: 620_000 });
    expect(result.rule?.isGap).toBe(false);
  });
});

describe("when nothing matches", () => {
  it("returns no chain and escalates rather than guessing", () => {
    const result = resolveApproval(matrix, { domain: "not_a_real_domain", value: 1_000 });
    expect(result.rule).toBeNull();
    expect(result.chain).toEqual([]);
    expect(result.warnings[0]).toMatchObject({ code: "NO_RULE", level: "err" });
  });
});

describe("externally funded matters", () => {
  const onFunding = (q: { funding?: string; fundingSupersedesAuthority?: boolean }) =>
    resolveApproval(matrix, { domain: "payment", method: "tender", value: 620_000, ...q }).warnings;

  it("warns that the funder's directives supersede these limits", () => {
    const warnings = onFunding({ funding: "anything", fundingSupersedesAuthority: true });
    expect(warnings.some((w) => w.code === "GOV_OVERRIDE")).toBe(true);
  });

  it("stays quiet where the route does not supersede", () => {
    const warnings = onFunding({ funding: "anything", fundingSupersedesAuthority: false });
    expect(warnings.some((w) => w.code === "GOV_OVERRIDE")).toBe(false);
  });

  it("stays quiet when no funding route is given at all", () => {
    expect(onFunding({}).some((w) => w.code === "GOV_OVERRIDE")).toBe(false);
  });

  it("takes the flag from configuration and never from the route's code", () => {
    // The old engine matched the strings "government" and "developer". A customer whose
    // routes are named otherwise would have been silently unwarned; one who names an
    // internally funded route "government" would have been warned wrongly.
    expect(
      onFunding({ funding: "government" }).some((w) => w.code === "GOV_OVERRIDE"),
    ).toBe(false);
    expect(
      onFunding({ funding: "opex", fundingSupersedesAuthority: true }).some(
        (w) => w.code === "GOV_OVERRIDE",
      ),
    ).toBe(true);
  });
});

describe("rules that would tie", () => {
  const find = (key: string) => matrix.rules.find((r) => r.ruleKey === key)!;

  it("finds none among bands that only touch", () => {
    for (const r of matrix.rules) expect(rulesTiedWith(r, matrix.rules)).toEqual([]);
  });

  it("finds a band that overlaps its neighbour", () => {
    const wide = { ...find("INSTR_SMALL"), ruleKey: "INSTR_WIDE", contractValueMax: 2_000_000 };
    expect(rulesTiedWith(wide, matrix.rules).map((r) => r.ruleKey)).toEqual(["INSTR_SMALL", "INSTR_MID"]);
  });

  it("leaves gap rows alone — overlapping is what they are for", () => {
    const gap = { ...find("INSTR_SMALL"), ruleKey: "INSTR_GAP", isGap: true };
    expect(rulesTiedWith(gap, matrix.rules)).toEqual([]);
  });

  it("does not count a more specific row as a tie", () => {
    const narrower = { ...find("INSTR_SMALL"), ruleKey: "INSTR_COND", cond: "urgent" };
    expect(rulesTiedWith(narrower, matrix.rules)).toEqual([]);
  });
});

describe("what a screen may say about a rule", () => {
  const base = { nonDelegable: false, approverMandatory: false, recommenders: [] };

  it("counts a mandatory recommendation as not delegable", () => {
    expect(ruleIsDelegable(base)).toBe(true);
    expect(ruleIsDelegable({ ...base, recommenders: [{ roleCode: "PANEL", act: "MR" as const }] })).toBe(false);
    expect(ruleIsDelegable({ ...base, approverMandatory: true })).toBe(false);
  });

  it("does not guess a committee's act", () => {
    expect(committeeActOn({ committeeAct: "MR", approverCode: "X" }, "PANEL")).toBe("MR");
    expect(committeeActOn({ committeeAct: null, approverCode: "PANEL" }, "PANEL")).toBe("A");
    expect(committeeActOn({ committeeAct: null, approverCode: "CHIEF" }, "PANEL")).toBeNull();
  });
});

// 6.1 ruling OD-4: the boundary switch is scoped per rule.
describe("a rule that does not follow the boundary switch", () => {
  const flipped = { ...matrix.policy, boundaryInclusive: false };

  it("keeps (min, max] at the boundary whichever way the switch is set", () => {
    expect(inBand(300_000, 15_000, 300_000, matrix.policy, false)).toBe(true);
    expect(inBand(300_000, 15_000, 300_000, flipped, false)).toBe(true);
    expect(inBand(300_000, 300_000, null, flipped, false)).toBe(false);
  });

  it("flips only when it follows, never when undecided", () => {
    expect(inBand(300_000, 15_000, 300_000, flipped, true)).toBe(false);
    expect(inBand(300_000, 15_000, 300_000, flipped, null)).toBe(true);
  });

  it("leaves the regime thresholds following the switch", () => {
    expect(regimeFor(300_000, flipped)).toBe("tender");
  });

  it("routes a boundary value the same way under both settings", () => {
    const pinned: Matrix = {
      ...matrix,
      rules: matrix.rules.map((r) => (r.domain === "appointment" ? { ...r, followsBoundarySwitch: false } : r)),
    };
    for (const boundaryInclusive of [true, false]) {
      const m = { ...pinned, policy: { ...pinned.policy, boundaryInclusive } };
      const result = resolveApproval(m, { domain: "appointment", method: "open", value: 300_000 });
      expect(result.rule?.ruleKey).toBe("APP_UNDER_BOUNDARY");
      expect(result.boundaryOperator).toBe("GT");
    }
  });

  it("records the operator a following rule was matched under", () => {
    const up = resolveApproval({ ...matrix, policy: flipped }, { domain: "appointment", method: "open", value: 300_000 });
    expect(up.rule?.ruleKey).toBe("APP_OVER_BOUNDARY");
    expect(up.boundaryOperator).toBe("GTE");
    const down = resolveApproval(matrix, { domain: "appointment", method: "open", value: 300_000 });
    expect(down.boundaryOperator).toBe("GT");
  });

  it("has no operator where no edge of the rule sits on the boundary", () => {
    expect(resolveApproval(matrix, { domain: "payment", method: "tender", value: 50_000 }).boundaryOperator).toBeNull();
  });

  it("warns, as an error, where a rule at the boundary has not decided", () => {
    const undecided: Matrix = {
      ...matrix,
      rules: matrix.rules.map((r) => (r.ruleKey === "APP_UNDER_BOUNDARY" ? { ...r, followsBoundarySwitch: null } : r)),
    };
    const result = resolveApproval(undecided, { domain: "appointment", method: "open", value: 200_000 });
    expect(result.warnings.find((w) => w.code === "BOUNDARY_SWITCH_UNDECIDED")?.level).toBe("err");
  });
});

describe("saving a rule at the boundary", () => {
  const under = matrix.rules.find((r) => r.ruleKey === "APP_UNDER_BOUNDARY")!;
  const over = matrix.rules.find((r) => r.ruleKey === "APP_OVER_BOUNDARY")!;

  it("requires the rule to decide whether it follows the switch", () => {
    expect(boundaryRuleFault({ ...under, followsBoundarySwitch: null }, matrix.policy)).toBe("BOUNDARY_SWITCH_UNDECIDED");
    expect(boundaryRuleFault(under, matrix.policy)).toBeNull();
  });

  it("does not ask a rule with no edge on the boundary", () => {
    const low = matrix.rules.find((r) => r.ruleKey === "PAY_LOW")!;
    expect(boundaryRuleFault({ ...low, followsBoundarySwitch: null }, matrix.policy)).toBeNull();
  });

  it("refuses two neighbours meeting at the boundary that disagree", () => {
    expect(boundaryRuleFault({ ...under, followsBoundarySwitch: false }, matrix.policy, [over])).toBe(
      "BOUNDARY_SWITCH_DISAGREES",
    );
    expect(boundaryRuleFault(under, matrix.policy, [over])).toBeNull();
  });
});

describe("re-checking an issue's rules at the boundary (code review, item 7)", () => {
  it("finds a rule that a moved boundary puts an undecided edge on", () => {
    const rules = matrix.rules.map((r) => (r.ruleKey === "PAY_LOW" ? { ...r, followsBoundarySwitch: null } : r));
    expect(boundaryFaultsAcross(rules, matrix.policy)).toEqual([]);
    const moved = boundaryFaultsAcross(rules, { boundaryValue: 100_000 });
    expect(moved.map((x) => [x.rule.ruleKey, x.fault])).toEqual([["PAY_LOW", "BOUNDARY_SWITCH_UNDECIDED"]]);
  });
});

describe("core routing at resolution (FR-APR-004)", () => {
  // The payment rule CLERK P → MANAGER R → CHIEF A, under each choice of flag.
  const withPayRule = (patch: Partial<Matrix["rules"][number]>, coreRouting: Matrix["coreRouting"] = []): Matrix => ({
    ...matrix,
    coreRouting,
    rules: matrix.rules.map((r) => (r.ruleKey === "PAY_HIGH" ? { ...r, ...patch } : r)),
  });
  const pay = (m: Matrix) => resolveApproval(m, { domain: "payment", method: "tender", value: 620_000 });
  const core = (m: ReturnType<typeof pay>) => m.warnings.filter((w) => w.code.startsWith("CORE_"));

  it("(14) unset: the chain as entered, with one warning that it was not checked, naming the rule", () => {
    const r = pay(withPayRule({ generateCoreChain: null }));
    expect(trace(r.chain)).toEqual(["CLERK:P", "MANAGER:R", "CHIEF:A"]);
    expect(core(r).map((w) => [w.code, w.level])).toEqual([["CORE_NOT_CHECKED", "warn"]]);
    expect(core(r)[0].messageEn).toContain("“PAY_HIGH”");
    expect(r.core).toEqual({ flag: null, reason: null, level: null });
  });

  it("(15) false: the chain as entered, recorded as a decision, with its reason carried", () => {
    const r = pay(withPayRule({ generateCoreChain: false, coreChainReason: "The manual states this chain" }));
    expect(core(r).map((w) => [w.code, w.level])).toEqual([["CORE_AS_ENTERED", "info"]]);
    expect(r.core).toEqual({ flag: false, reason: "The manual states this chain", level: null });
  });

  it("(16) true with an empty core table: the chain as entered, warning that this issue records no core routing for the approver", () => {
    const r = pay(withPayRule({ generateCoreChain: true }, []));
    expect(trace(r.chain)).toEqual(["CLERK:P", "MANAGER:R", "CHIEF:A"]);
    expect(core(r).map((w) => [w.code, w.level])).toEqual([["CORE_NOT_CHECKED", "warn"]]);
    expect(core(r)[0].messageEn).toContain("no core routing for Chief");
    expect(r.warnings.filter((w) => w.level === "err")).toEqual([]);
  });

  it("true with a core row: the row is generated beneath the approver, and every step says where it came from", () => {
    const row = { approverCode: "CHIEF", clause: "C-1", provenance: "STATED" as const, steps: [{ roleCode: "MANAGER", act: "P" as const, provenance: "STATED" as const }, { roleCode: "DIRECTOR", act: "R" as const, provenance: "STATED" as const }] };
    const r = pay(withPayRule({ generateCoreChain: true, proposerCode: null, recommenders: [{ roleCode: "MANAGER", act: "R" }] }, [row]));
    expect(trace(r.chain)).toEqual(["MANAGER:R", "DIRECTOR:R", "CHIEF:A"]);
    expect(r.chain.map((s) => s.origin ?? null)).toEqual(["CORE_STRENGTHENED", "CORE", null]);
    expect(core(r)).toEqual([]);
    expect(r.core?.level).toEqual(row);
  });

  it("(17) no rule: no core warning at all", () => {
    const r = resolveApproval({ ...matrix, coreRouting: [] }, { domain: "nothing_like_this" });
    expect(r.warnings.map((w) => w.code)).toEqual(["NO_RULE"]);
  });

  it("(18) a flagged rule that weakens a core step is an error, and the chain stays as entered", () => {
    const row = { approverCode: "CHIEF", clause: "", provenance: "ASSUMED" as const, steps: [{ roleCode: "MANAGER", act: "R" as const, provenance: "ASSUMED" as const }] };
    const r = pay(withPayRule({ generateCoreChain: true, proposerCode: "MANAGER", recommenders: [] }, [row]));
    expect(core(r).map((w) => [w.code, w.level])).toEqual([["CORE_CHAIN_FAULT", "err"]]);
    expect(core(r)[0].messageEn).toContain("gives Manager a lesser act or a different place");
    expect(trace(r.chain)).toEqual(["MANAGER:P", "CHIEF:A"]);
  });

  it("core warnings come after the engine's own, so their places are unchanged", () => {
    const r = resolveApproval(withPayRule({ generateCoreChain: null }), { domain: "payment", method: "tender", value: 620_000, fundingSupersedesAuthority: true });
    expect(r.warnings.map((w) => w.code)).toEqual(["GOV_OVERRIDE", "CORE_NOT_CHECKED"]);
  });
});

describe("(19) self-approval on a generated chain puts no office in it twice (note D-6)", () => {
  // The fixture's offices with the self-approval escalations this test needs: FD to the
  // CEO, HoDiv to FD. Invented for the test; the appendix states none.
  const roles = {
    ...DAL_FIXTURE.roles,
    FD: { ...DAL_FIXTURE.roles.FD, selfApprovalEscalatesToCode: "CEO" },
    HODIV: { ...DAL_FIXTURE.roles.HODIV, selfApprovalEscalatesToCode: "FD" },
  };
  const base = DAL_FIXTURE.rules[0];
  const m = (r: Partial<Matrix["rules"][number]>): Matrix => ({
    ...DAL_FIXTURE,
    roles,
    coreRouting: DAL_CORE_ROUTING,
    rules: [{ ...base, ruleKey: "T", domain: "t", minValue: null, maxValue: null, proposerCode: null, recommenders: [], generateCoreChain: true, ...r }],
  });

  it("FD approves, FD acts: FD recommends once, appended after the rule's committee; nothing from the CEO's row is spliced in", () => {
    const r = resolveApproval(m({ approverCode: "FD", recommenders: [{ roleCode: "QC", act: "MR" }] }), { domain: "t", actorRoleCode: "FD" });
    expect(trace(r.chain)).toEqual(["HOD:P", "HODIV:R", "QC:MR", "FD:R", "CEO:A"]);
    expect(r.chain.filter((s) => s.roleCode === "FD")).toHaveLength(1);
  });

  it("HoDiv approves, HoDiv acts: HOD:R, HODIV:R, FD:A", () => {
    const r = resolveApproval(m({ approverCode: "HODIV" }), { domain: "t", actorRoleCode: "HODIV" });
    expect(trace(r.chain)).toEqual(["HOD:R", "HODIV:R", "FD:A"]);
  });

  it("where the actor's office already has a step, the downgrade merges into it, keeping the stronger act", () => {
    const resolve = resolveApproval;
    // As entered (the flag decided false), FD already proposes beneath its own approval.
    const asEntered = m({ approverCode: "FD", generateCoreChain: false, coreChainReason: "test", proposerCode: "FD", recommenders: [{ roleCode: "HODIV", act: "MR" }] });
    expect(trace(resolve(asEntered, { domain: "t", actorRoleCode: "FD" }).chain)).toEqual(["FD:R", "HODIV:MR", "CEO:A"]);
    const strong = m({ approverCode: "HODIV", generateCoreChain: false, coreChainReason: "test", recommenders: [{ roleCode: "HODIV", act: "MR" }] });
    expect(trace(resolve(strong, { domain: "t", actorRoleCode: "HODIV" }).chain)).toEqual(["HODIV:MR", "FD:A"]);
  });
});
