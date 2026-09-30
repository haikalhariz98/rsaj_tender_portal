import type { Matrix, Rule } from "./types";

/**
 * A small synthetic matrix for testing the resolver.
 *
 * Deliberately not any real organisation's authority limits: the resolver's job is
 * to apply whatever bands, committees and escalation paths it is given, and a
 * fixture built from one customer's policy tends to bake that customer's shape into
 * the tests. Everything here exists to exercise one behaviour.
 */

const role = (
  code: string,
  nameEn: string,
  escalatesToCode: string | null = null,
  selfApprovalEscalatesToCode: string | null = null,
  isCommittee = false,
) => ({ code, nameEn, nameMs: nameEn, isCommittee, escalatesToCode, selfApprovalEscalatesToCode });

const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey" | "domain">): Rule => ({
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  labelEn: r.ruleKey,
  labelMs: null,
  proposerCode: null,
  approverCode: null,
  committeeCode: null,
  committeeAct: null,
  nonDelegable: false,
  approverMandatory: false,
  isGap: false,
  gapNote: null,
  note: "",
  clause: "TEST",
  sortOrder: 0,
  recommenders: [],
  ...r,
});

export const TEST_MATRIX: Matrix = {
  policy: {
    boundaryValue: 300_000,
    boundaryInclusive: true,
    quotationFloor: 15_000,
    tenderFloor: 300_000,
    requisitionBoundary: 50_000,
    splittingWindowDays: 30,
    currency: "MYR",
  },
  roles: Object.fromEntries(
    [
      role("CLERK", "Clerk", "MANAGER"),
      role("MANAGER", "Manager", "DIRECTOR", "DIRECTOR"),
      role("DIRECTOR", "Director", "CHIEF", "CHIEF"),
      role("CHIEF", "Chief Executive", "CHAIR", "CHAIR"),
      role("CHAIR", "Chair", "BOARD", "BOARD"),
      role("BOARD", "Board", null, null, true),
      role("PANEL", "Review Panel", "CHIEF", null, true),
    ].map((r) => [r.code, r]),
  ),
  rules: [
    // Three value bands on one matter, to test band edges and escalation.
    rule({
      ruleKey: "PAY_LOW",
      domain: "payment",
      method: "tender",
      maxValue: 100_000,
      proposerCode: "CLERK",
      approverCode: "MANAGER",
    }),
    rule({
      ruleKey: "PAY_MID",
      domain: "payment",
      method: "tender",
      minValue: 100_000,
      maxValue: 500_000,
      proposerCode: "CLERK",
      recommenders: [{ roleCode: "MANAGER", act: "R" }],
      approverCode: "DIRECTOR",
    }),
    rule({
      ruleKey: "PAY_HIGH",
      domain: "payment",
      method: "tender",
      minValue: 500_000,
      proposerCode: "CLERK",
      recommenders: [{ roleCode: "MANAGER", act: "R" }],
      approverCode: "CHIEF",
    }),

    // A mandatory, non-delegable committee recommendation either side of the boundary.
    rule({
      ruleKey: "APP_UNDER_BOUNDARY",
      domain: "appointment",
      method: "open",
      minValue: 15_000,
      maxValue: 300_000,
      proposerCode: "CLERK",
      recommenders: [{ roleCode: "PANEL", act: "MR" }],
      approverCode: "CHIEF",
      committeeCode: "PANEL",
      committeeAct: "MR",
      nonDelegable: true,
    }),
    rule({
      ruleKey: "APP_OVER_BOUNDARY",
      domain: "appointment",
      method: "open",
      minValue: 300_000,
      proposerCode: "CLERK",
      approverCode: "BOARD",
      committeeCode: "BOARD",
      committeeAct: "A",
    }),

    // Percentage band, and a percentage band qualified by the parent contract value.
    rule({
      ruleKey: "VAR_SMALL",
      domain: "variation",
      pctMax: 10,
      approverCode: "DIRECTOR",
    }),
    rule({
      ruleKey: "VAR_LARGE_ON_BIG_CONTRACT",
      domain: "variation",
      pctMin: 10,
      contractValueMin: 1_000_000,
      recommenders: [{ roleCode: "PANEL", act: "MR" }],
      approverCode: "CHIEF",
      committeeCode: "PANEL",
      committeeAct: "MR",
    }),

    // An office resolved from the parent contract's value is ordinary rows banded on
    // contract value — there is no special case for it in the engine.
    rule({ ruleKey: "INSTR_SMALL", domain: "instruction", contractValueMax: 1_000_000, approverCode: "MANAGER" }),
    rule({
      ruleKey: "INSTR_MID",
      domain: "instruction",
      contractValueMin: 1_000_000,
      contractValueMax: 3_000_000,
      approverCode: "DIRECTOR",
    }),
    rule({ ruleKey: "INSTR_LARGE", domain: "instruction", contractValueMin: 3_000_000, approverCode: "CHIEF" }),

    // A matter with no rule behind it: routing shown is an assumption.
    rule({
      ruleKey: "RETENTION_GAP",
      domain: "retention_release",
      approverCode: "MANAGER",
      isGap: true,
      clause: "GAP",
    }),
  ],
};
