import type { Matrix, Rule } from "@/lib/authority/types";

/**
 * A synthetic requisition matrix for tests, shaped like the bands the specification's
 * worked examples are written against (§4.2.1: RM500 / RM50,000 / RM300,000). Test
 * data only: no customer's limits ship in the product, and this file is never seeded.
 * Requisition rows do not follow the boundary switch (ruling OD-4).
 */

const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey">): Rule => ({
  domain: "requisition",
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: false,
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

const role = (code: string, nameEn: string, isCommittee = false) => ({
  code,
  nameEn,
  nameMs: nameEn,
  isCommittee,
  escalatesToCode: null,
  selfApprovalEscalatesToCode: null,
});

export const REQ_MATRIX: Matrix = {
  policy: {
    boundaryValue: 300_000,
    boundaryInclusive: true,
    quotationFloor: 15_000,
    tenderFloor: 300_000,
    requisitionBoundary: 50_000,
    currency: "MYR",
    clauses: { funderOverride: "TEST 1.4" },
  },
  roles: Object.fromEntries(
    [
      role("HOD_DEPT", "Head of Department"),
      role("HOD_DIV", "Head of Division"),
      role("FD", "Functional Director"),
      role("CEO", "Chief Executive"),
      role("BOARD", "Board of Directors", true),
    ].map((r) => [r.code, r]),
  ),
  rules: [
    rule({ ruleKey: "REQ_UPTO_500", maxValue: 500, approverCode: "HOD_DEPT" }),
    rule({ ruleKey: "REQ_UPTO_50K", minValue: 500, maxValue: 50_000, recommenders: [{ roleCode: "HOD_DEPT", act: "R" }], approverCode: "HOD_DIV" }),
    rule({
      ruleKey: "REQ_UPTO_300K",
      minValue: 50_000,
      maxValue: 300_000,
      proposerCode: "HOD_DEPT",
      recommenders: [{ roleCode: "HOD_DIV", act: "R" }],
      approverCode: "FD",
    }),
    rule({
      ruleKey: "REQ_OVER_300K",
      minValue: 300_000,
      proposerCode: "HOD_DEPT",
      recommenders: [
        { roleCode: "HOD_DIV", act: "R" },
        { roleCode: "FD", act: "MR" },
      ],
      approverCode: "CEO",
    }),
    rule({
      ruleKey: "REQ_OVER_BUDGET",
      cond: "over_budget",
      recommenders: [{ roleCode: "CEO", act: "MR" }],
      approverCode: "BOARD",
    }),
  ],
};
