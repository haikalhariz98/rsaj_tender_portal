/**
 * Spec-shaped fixtures for the award's tests: the 6.3 spec matrix with the award
 * signatory rows of DAL §3.1.4.4 item 5 as the spec states them. Never seeded — they
 * are one customer's figures, and the product ships none.
 */

import type { Matrix, Rule } from "@/lib/authority/types";
import { SPEC_MATRIX } from "@/lib/method/fixture";

import { SIGNATORY_DOMAIN } from "./types";

const sig = (r: Partial<Rule> & Pick<Rule, "ruleKey">): Rule => ({
  domain: SIGNATORY_DOMAIN,
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: null,
  labelEn: r.ruleKey,
  labelMs: null,
  proposerCode: null,
  approverCode: null,
  committeeCode: null,
  committeeAct: null,
  nonDelegable: true,
  approverMandatory: false,
  isGap: false,
  gapNote: null,
  note: "",
  clause: "TEST 3.1.4.4(5)",
  sortOrder: 0,
  recommenders: [],
  ...r,
});

const CP_RECOMMENDS = [{ roleCode: "CP", act: "R" as const }];

export const SIGNATORY_RULES: Rule[] = [
  // 5c: more than RM300,000 and up to RM1 million. The lower edge is the boundary, so it follows the switch.
  sig({ ruleKey: "SIG_LOA_1M", cond: "LETTER_OF_ACCEPTANCE", minValue: 300_000, maxValue: 1_000_000, followsBoundarySwitch: true, approverCode: "HODIV", recommenders: CP_RECOMMENDS }),
  // 5b: more than RM1 million and up to RM3 million.
  sig({ ruleKey: "SIG_LOA_3M", cond: "LETTER_OF_ACCEPTANCE", minValue: 1_000_000, maxValue: 3_000_000, approverCode: "FD", recommenders: CP_RECOMMENDS }),
  // 5a: more than RM3 million.
  sig({ ruleKey: "SIG_LOA_OVER", cond: "LETTER_OF_ACCEPTANCE", minValue: 3_000_000, approverCode: "CEO", recommenders: CP_RECOMMENDS }),
  // FR-AWD-007: the appointment letter is signed by the head of the user department.
  sig({ ruleKey: "SIG_INDENT", cond: "WORK_INDENT", minValue: 15_000, maxValue: 300_000, followsBoundarySwitch: true, approverCode: "HOD", nonDelegable: false }),
];

export const AWARD_MATRIX: Matrix = { ...SPEC_MATRIX, rules: [...SPEC_MATRIX.rules, ...SIGNATORY_RULES] };

/// The same matrix with the D3 switch the other way: a value exactly on the boundary in the upper band.
export const AWARD_MATRIX_GTE: Matrix = { ...AWARD_MATRIX, policy: { ...AWARD_MATRIX.policy, boundaryInclusive: false } };
