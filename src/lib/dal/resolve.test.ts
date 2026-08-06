import { describe, expect, it } from "vitest";

import rawPolicy from "../../../prisma/seed-data/rsaj-dal-policy.json";
import rawRoles from "../../../prisma/seed-data/rsaj-dal-roles.json";
import rawRules from "../../../prisma/seed-data/rsaj-dal-rules.json";
import { buildMatrix, type SeedPolicy, type SeedRole, type SeedRule } from "./matrix";
import { inBand, regimeFor, resolveApproval, resolveSuperintendingOfficer } from "./resolve";
import type { Matrix } from "./types";

const matrix: Matrix = buildMatrix(
  rawRules as SeedRule[],
  rawRoles as SeedRole[],
  rawPolicy as SeedPolicy,
);

/// Convenience: the chain as "ROLE:ACT" pairs, which is how the routing sheets read.
const trace = (steps: { roleCode: string; act: string }[]) =>
  steps.map((s) => `${s.roleCode}:${s.act}`);

describe("the seeded RSAJ matrix", () => {
  it("carries every authority row with a clause citation", () => {
    expect(matrix.rules).toHaveLength(92);
    expect(matrix.rules.every((r) => r.clause)).toBe(true);
  });

  it("has no rule referencing a role that does not exist", () => {
    const known = new Set(Object.keys(matrix.roles));
    const referenced = new Set<string>();
    for (const r of matrix.rules) {
      for (const c of [r.proposerCode, r.approverCode, r.committeeCode]) if (c) referenced.add(c);
      for (const rec of r.recommenders) referenced.add(rec.roleCode);
    }
    // SO_PD is resolved from contract value at routing time, not a standing office.
    referenced.delete("SO_PD");
    expect([...referenced].filter((c) => !known.has(c))).toEqual([]);
  });

  it("has unique rule keys", () => {
    const keys = matrix.rules.map((r) => r.ruleKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

// The specification states these two outcomes in prose in §2.4 "What good looks like".
// They are the acceptance criteria for the routing engine.
describe("spec §2.4 worked examples", () => {
  it("routes a RM180,000 works quotation to the Quotation Committee then the CEO", () => {
    const result = resolveApproval(matrix, {
      domain: "appointment",
      method: "open_selective",
      value: 180_000,
    });

    expect(result.regime).toBe("quotation");
    expect(result.rule?.ruleKey).toBe("APP_OPEN_15K_300K");

    // "recommended by the Quotation Committee as a mandatory, non-delegable
    // recommendation and approved by the Chief Executive Officer"
    expect(result.approverCode).toBe("CEO");
    expect(result.committeeCode).toBe("QC");
    expect(result.nonDelegable).toBe(true);

    const committeeStep = result.chain.find((s) => s.roleCode === "QC");
    expect(committeeStep?.act).toBe("MR");
    expect(committeeStep?.nonDelegable).toBe(true);
    expect(committeeStep?.committeeCode).toBe("QC");

    expect(result.chain.at(-1)).toMatchObject({ roleCode: "CEO", act: "A" });
  });

  it("routes a RM620,000 interim payment to the CEO, not to the S.O. the form prints", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
    });

    expect(result.rule?.ruleKey).toBe("T16A_PAY_GT_500K");
    expect(result.approverCode).toBe("CEO");
    expect(trace(result.chain)).toEqual(["HODEPT:P", "HOD:R", "CEO:A"]);
  });
});

describe("interim payment bands", () => {
  it.each([
    [50_000, "T16C_PAY_UPTO_100K", "HOD"],
    [100_000, "T16C_PAY_UPTO_100K", "HOD"],
    [100_000.01, "T16B_PAY_100K_500K", "FD"],
    [500_000, "T16B_PAY_100K_500K", "FD"],
    [500_000.01, "T16A_PAY_GT_500K", "CEO"],
  ])("RM%s resolves to %s approved by %s", (value, ruleKey, approver) => {
    const result = resolveApproval(matrix, { domain: "payment", method: "tender", value });
    expect(result.rule?.ruleKey).toBe(ruleKey);
    expect(result.approverCode).toBe(approver);
  });
});

// Spec decision D3: the sources disagree on whether RM300,000 exactly is a quotation
// or a tender. The product ships the toggle rather than picking for the customer.
describe("D3 — the RM300,000 boundary is configurable", () => {
  const exactly = 300_000;

  it("puts RM300,000 in the quotation regime when boundaryInclusive is true", () => {
    expect(matrix.policy.boundaryInclusive).toBe(true);
    expect(regimeFor(exactly, matrix.policy)).toBe("quotation");

    const result = resolveApproval(matrix, {
      domain: "appointment",
      method: "open_selective",
      value: exactly,
    });
    expect(result.rule?.ruleKey).toBe("APP_OPEN_15K_300K");
    expect(result.approverCode).toBe("CEO");
  });

  it("puts RM300,000 in the tender regime when boundaryInclusive is false", () => {
    const flipped: Matrix = {
      ...matrix,
      policy: { ...matrix.policy, boundaryInclusive: false },
    };
    expect(regimeFor(exactly, flipped.policy)).toBe("tender");

    const result = resolveApproval(flipped, {
      domain: "appointment",
      method: "open_selective",
      value: exactly,
    });
    expect(result.rule?.ruleKey).toBe("APP_OPEN_GT_300K");
    expect(result.approverCode).toBe("TBC");
  });

  it("moves only the boundary value itself, never other band edges", () => {
    const flipped = { ...matrix.policy, boundaryInclusive: false };

    // RM15,000 is a band edge but not the boundary, so it stays (min, max].
    expect(inBand(15_000, 5_000, 15_000, matrix.policy)).toBe(true);
    expect(inBand(15_000, 5_000, 15_000, flipped)).toBe(true);

    // RM300,000 is the boundary, so it flips.
    expect(inBand(300_000, 15_000, 300_000, matrix.policy)).toBe(true);
    expect(inBand(300_000, 15_000, 300_000, flipped)).toBe(false);
  });
});

describe("DAL §1.6 — absence reverts authority upward", () => {
  it("escalates past an absent approver and says so", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      absentRoleCodes: ["CEO"],
    });

    expect(result.approverCode).toBe("CM");
    const warning = result.warnings.find((w) => w.code === "ABSENCE");
    expect(warning?.from).toBe("CEO");
    expect(warning?.to).toBe("CM");
    expect(warning?.messageEn).toContain("never passes down automatically");
  });

  it("keeps climbing while each successive holder is also absent", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      absentRoleCodes: ["CEO", "CM"],
    });
    expect(result.approverCode).toBe("BOD");
    expect(result.warnings.filter((w) => w.code === "ABSENCE")).toHaveLength(2);
  });

  it("does not escalate when the absent role is not the approver", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      absentRoleCodes: ["FD"],
    });
    expect(result.approverCode).toBe("CEO");
    expect(result.warnings.some((w) => w.code === "ABSENCE")).toBe(false);
  });
});

describe("no one approves their own matter", () => {
  it("downgrades the actor to recommender and escalates the approval", () => {
    const result = resolveApproval(matrix, {
      domain: "payment",
      method: "tender",
      value: 620_000,
      actorRoleCode: "CEO",
    });

    expect(result.approverCode).toBe("CM");
    expect(trace(result.chain)).toEqual(["HODEPT:P", "HOD:R", "CEO:R", "CM:A"]);
    expect(result.warnings.find((w) => w.code === "SELF_APPROVAL")?.to).toBe("CM");
  });
});

describe("the Superintending Officer is resolved from contract value", () => {
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

describe("rows the DAL does not actually contain", () => {
  it("flags a gap row loudly rather than presenting it as a rule", () => {
    const gapRules = matrix.rules.filter((r) => r.isGap);
    expect(gapRules.length).toBeGreaterThan(0);

    for (const gap of gapRules) {
      const result = resolveApproval(matrix, {
        domain: gap.domain,
        method: gap.method,
        value: gap.minValue != null ? gap.minValue + 1 : 1_000,
      });
      if (result.rule?.ruleKey !== gap.ruleKey) continue;
      const warning = result.warnings.find((w) => w.code === "GAP_RULE");
      expect(warning?.level).toBe("gap");
      expect(warning?.messageEn).toContain("assumption");
    }
  });

  it("prefers a real rule over a gap rule when both match", () => {
    // Gap rows score -16, so they can never outrank a documented row.
    const documented = matrix.rules.find((r) => !r.isGap && r.domain === "payment");
    expect(documented).toBeDefined();
    const result = resolveApproval(matrix, { domain: "payment", method: "tender", value: 620_000 });
    expect(result.rule?.isGap).toBe(false);
  });
});

describe("when nothing matches", () => {
  it("returns no chain and cites DAL §1.6 rather than guessing", () => {
    const result = resolveApproval(matrix, { domain: "not_a_real_domain", value: 1_000 });
    expect(result.rule).toBeNull();
    expect(result.chain).toEqual([]);
    expect(result.warnings[0]).toMatchObject({ code: "NO_RULE", level: "err", clause: "DAL_16" });
  });
});

describe("government funding supersedes the DAL", () => {
  it("warns when the funding route is government or developer", () => {
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
