import { describe, expect, it } from "vitest";

import { TEST_MATRIX } from "./fixture";
import { inBand, regimeFor, resolveApproval, resolveSuperintendingOfficer } from "./resolve";
import type { Matrix } from "./types";

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

describe("percentage bands", () => {
  it("routes a small variation on its percentage alone", () => {
    const result = resolveApproval(matrix, { domain: "variation", pct: 5 });
    expect(result.rule?.ruleKey).toBe("VAR_SMALL");
    expect(result.approverCode).toBe("DIRECTOR");
  });

  it("prefers the rule that also bands on the parent contract value", () => {
    const result = resolveApproval(matrix, {
      domain: "variation",
      pct: 20,
      contractValue: 5_000_000,
    });
    expect(result.rule?.ruleKey).toBe("VAR_LARGE_ON_BIG_CONTRACT");
    expect(result.committeeCode).toBe("PANEL");
  });

  it("falls through when the contract is too small for the specific rule", () => {
    const result = resolveApproval(matrix, {
      domain: "variation",
      pct: 20,
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

describe("the superintending officer is resolved from contract value", () => {
  it.each([
    [null, "HOD"],
    [500_000, "HOD"],
    [1_000_000, "HOD"],
    [1_000_000.01, "FD"],
    [3_000_000, "FD"],
    [3_000_000.01, "CEO"],
  ])("a contract of %s gives %s", (contractValue, expected) => {
    expect(resolveSuperintendingOfficer(contractValue)).toBe(expected);
  });
});

describe("matters with no rule behind them", () => {
  it("resolves but warns that the route is an assumption", () => {
    const result = resolveApproval(matrix, { domain: "retention_release", value: 50_000 });
    expect(result.rule?.ruleKey).toBe("RETENTION_GAP");

    const warning = result.warnings.find((w) => w.code === "GAP_RULE");
    expect(warning?.level).toBe("gap");
    expect(warning?.messageEn).toContain("assumption");
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
  it("warns that the funder's directives supersede these limits", () => {
    for (const funding of ["government", "developer"]) {
      const result = resolveApproval(matrix, {
        domain: "payment",
        method: "tender",
        value: 620_000,
        funding,
      });
      expect(result.warnings.some((w) => w.code === "GOV_OVERRIDE")).toBe(true);
    }
  });

  it("stays quiet for internally funded matters", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      funding: "opex",
    });
    expect(result.warnings.some((w) => w.code === "GOV_OVERRIDE")).toBe(false);
  });
});
