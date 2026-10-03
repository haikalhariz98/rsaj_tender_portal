import type { CoreLevel, Matrix, Rule } from "./types";

/**
 * The rows of the specification's Appendix B (DAL Issue A, Revision 00) that the
 * §6.9.3 worked routing examples run on — FOR TESTS ONLY (close-out ruling C5).
 *
 * This file is never seeded and never imported by the product: no customer's limits
 * ship with it (AGENTS.md). It exists so the engine is held to the printed examples:
 * if a change to the resolver stops reproducing one, a test fails. Office codes are
 * this fixture's own shorthand; every figure is the appendix's.
 *
 * Slashed codes (6.9 ruling on FR-APR-003). The appendix writes some steps with two
 * codes, which the act grammar does not hold. This fixture reads them as follows — test
 * only readings, never shipped as a rule; the joint partner office is not modelled and
 * is a question to the customer:
 *   "JR/R" → JR: a joint recommendation (the partner being the Administration
 *            Division, e.g. §3.1.4.2 item 1 above RM5M: HoDiv JR).
 *   "JR/P" → P: Contract & Procurement heads the chain, so it proposes (e.g. items 13
 *            and 15: CP P → HoDiv R → CEO A).
 *
 * Core routing (FR-APR-004, 6.9 R3). B.2's four rows of §2.2.1, STATED. Nothing above
 * the Chief Executive: §2.2.1 is silent there, and a row the fixture invented would be
 * copied from the very clause example 5 checks (ruling on departure 2). Examples 1 and 2
 * take their chains from these rows, with their rules trimmed to what §3.1.4 adds, so
 * the generation is what reproduces the printed chain. Example 5 is decided "as
 * entered", with its reason. Every other rule is left undecided (null), as an issue
 * ships, and its route warns that the chain was not checked.
 */

const rule = (r: Partial<Rule> & Pick<Rule, "ruleKey" | "domain">): Rule => ({
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: true,
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
  clause: "Appendix B",
  sortOrder: 0,
  recommenders: [],
  generateCoreChain: null,
  coreChainReason: null,
  ...r,
});

const role = (code: string, nameEn: string, isCommittee = false, escalatesToCode: string | null = null) => ({
  code,
  nameEn,
  nameMs: nameEn,
  isCommittee,
  escalatesToCode,
  selfApprovalEscalatesToCode: null,
});

/// §2.2.1 as Appendix B.2 prints it: the chain beneath each approving office.
const core = (approverCode: string, steps: [string, "P" | "JP" | "R" | "JR", string?][]): CoreLevel => ({
  approverCode,
  clause: "§2.2.1",
  provenance: "STATED",
  steps: steps.map(([roleCode, act, note]) => ({ roleCode, act, provenance: "STATED", ...(note ? { note } : {}) })),
});

export const DAL_CORE_ROUTING: CoreLevel[] = [
  core("HOD", []),
  core("HODIV", [["HOD", "R"]]),
  core("FD", [["HOD", "P"], ["HODIV", "R"]]),
  core("CEO", [["HOD", "P"], ["HODIV", "P", "or jointly propose"], ["FD", "R"]]),
];

/// Example 5's rule states its own chain above the CEO, where §2.2.1 is silent.
export const EXAMPLE_5_REASON = "§3.1.4.2 item 1 states the chain; §2.2.1 is silent above the CEO";

const K = 1_000;
const M = 1_000_000;

/// B.6/B.7 variation bands: the tender regime is two-dimensional (contract value × VO %).
const voTender = (key: string, cvMin: number, cvMax: number | null, pctMin: string | null, pctMax: string | null, approver: string, clause: string) =>
  rule({ ruleKey: key, domain: "vo", method: "tender", contractValueMin: cvMin, contractValueMax: cvMax, pctMin, pctMax, recommenders: [{ roleCode: "VOC", act: "MR" }], approverCode: approver, committeeCode: "VOC", committeeAct: "MR", clause });

export const DAL_FIXTURE: Matrix = {
  policy: {
    boundaryValue: 300 * K,
    // D3 interim: "more than RM300K" — a value exactly on the boundary sits below it.
    boundaryInclusive: true,
    quotationFloor: 15 * K,
    tenderFloor: 300 * K,
    requisitionBoundary: 50 * K,
    currency: "MYR",
  },
  coreRouting: DAL_CORE_ROUTING,
  roles: Object.fromEntries(
    [
      role("HOD", "Head of Department", false, "HODIV"),
      role("HODIV", "Head of Division", false, "FD"),
      role("FD", "Functional Director", false, "CEO"),
      role("CEO", "Chief Executive Officer", false, "CM"),
      role("CM", "Chairman", false, "BOD"),
      role("CP", "Contract & Procurement"),
      role("BOD", "Board of Directors", true),
      role("TBC", "Tender Board Committee", true),
      role("QC", "Quotation Committee", true),
      role("VOC", "Variation Orders Committee", true),
    ].map((r) => [r.code, r]),
  ),
  rules: [
    // B.3 §3.1.4.1 Approval of Requisition. Requisition bands do not follow the D3 switch.
    rule({ ruleKey: "REQ_UP_TO_500", domain: "requisition", maxValue: 500, approverCode: "HOD", followsBoundarySwitch: false, clause: "§3.1.4.1" }),
    rule({ ruleKey: "REQ_500_TO_50K", domain: "requisition", minValue: 500, maxValue: 50 * K, recommenders: [{ roleCode: "HOD", act: "R" }], approverCode: "HODIV", followsBoundarySwitch: false, clause: "§3.1.4.1" }),
    rule({ ruleKey: "REQ_50K_TO_300K", domain: "requisition", minValue: 50 * K, maxValue: 300 * K, proposerCode: "HOD", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "FD", followsBoundarySwitch: false, clause: "§3.1.4.1" }),
    // Example 1: generated. The rule adds only what §3.1.4.1 strengthens — HoDiv
    // recommends where §2.2.1 has it propose, FD's recommendation is mandatory.
    rule({ ruleKey: "REQ_ABOVE_300K", domain: "requisition", minValue: 300 * K, recommenders: [{ roleCode: "HODIV", act: "R" }, { roleCode: "FD", act: "MR" }], approverCode: "CEO", followsBoundarySwitch: false, generateCoreChain: true, clause: "§3.1.4.1" }),

    // B.4 §3.1.4.2 item 1 Direct purchase (proprietary and emergency).
    rule({ ruleKey: "DP_UP_TO_500", domain: "appointment", method: "direct", maxValue: 500, approverCode: "HOD", clause: "§3.1.4.2 item 1" }),
    rule({ ruleKey: "DP_500_TO_5K", domain: "appointment", method: "direct", minValue: 500, maxValue: 5 * K, recommenders: [{ roleCode: "HOD", act: "R" }], approverCode: "HODIV", clause: "§3.1.4.2 item 1" }),
    rule({ ruleKey: "DP_5K_TO_15K", domain: "appointment", method: "direct", minValue: 5 * K, maxValue: 15 * K, proposerCode: "HOD", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "FD", clause: "§3.1.4.2 item 1" }),
    rule({ ruleKey: "DP_15K_TO_300K", domain: "appointment", method: "direct", minValue: 15 * K, maxValue: 300 * K, proposerCode: "HOD", recommenders: [{ roleCode: "HODIV", act: "JP" }, { roleCode: "FD", act: "R" }, { roleCode: "QC", act: "MR" }], approverCode: "CEO", committeeCode: "QC", committeeAct: "MR", nonDelegable: true, clause: "§3.1.4.2 item 1" }),
    rule({ ruleKey: "DP_300K_TO_3M", domain: "appointment", method: "direct", minValue: 300 * K, maxValue: 3 * M, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.2 item 1" }),
    rule({ ruleKey: "DP_3M_TO_5M", domain: "appointment", method: "direct", minValue: 3 * M, maxValue: 5 * M, recommenders: [{ roleCode: "TBC", act: "MR" }], approverCode: "CM", committeeCode: "TBC", committeeAct: "MR", clause: "§3.1.4.2 item 1" }),
    // Example 5: as entered, decided so with its reason (ruling on departure 2).
    rule({ ruleKey: "DP_ABOVE_5M", domain: "appointment", method: "direct", minValue: 5 * M, proposerCode: "HOD", recommenders: [{ roleCode: "HODIV", act: "JR" }, { roleCode: "TBC", act: "MR" }], approverCode: "BOD", committeeCode: "TBC", committeeAct: "MR", generateCoreChain: false, coreChainReason: EXAMPLE_5_REASON, clause: "§3.1.4.2 item 1" }),

    // B.5 §3.1.4.2 item 2 Open and selective: no Chairman or Board row at any value.
    rule({ ruleKey: "OS_UP_TO_5K", domain: "appointment", method: "open_selective", maxValue: 5 * K, recommenders: [{ roleCode: "HOD", act: "R" }], approverCode: "HODIV", clause: "§3.1.4.2 item 2" }),
    rule({ ruleKey: "OS_5K_TO_15K", domain: "appointment", method: "open_selective", minValue: 5 * K, maxValue: 15 * K, proposerCode: "HOD", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "FD", clause: "§3.1.4.2 item 2" }),
    // Example 2: generated. The rule sets HoDiv's act to a joint proposal (the same
    // rank as §2.2.1's proposal) and adds the Quotation Committee's MR.
    rule({ ruleKey: "OS_15K_TO_300K", domain: "appointment", method: "open_selective", minValue: 15 * K, maxValue: 300 * K, recommenders: [{ roleCode: "HODIV", act: "JP" }, { roleCode: "QC", act: "MR" }], approverCode: "CEO", committeeCode: "QC", committeeAct: "MR", nonDelegable: true, generateCoreChain: true, clause: "§3.1.4.2 item 2" }),
    rule({ ruleKey: "OS_ABOVE_300K", domain: "appointment", method: "open_selective", minValue: 300 * K, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.2 item 2" }),

    // B.6 §3.1.4.3 item 5 Quotation VO: one dimension, and no MR up to 20%.
    rule({ ruleKey: "Q_VO_UP_TO_20", domain: "vo", method: "quotation", pctMax: "20", approverCode: "HODIV", clause: "§3.1.4.3 item 5c" }),
    rule({ ruleKey: "Q_VO_20_TO_50", domain: "vo", method: "quotation", pctMin: "20", pctMax: "50", recommenders: [{ roleCode: "VOC", act: "MR" }], approverCode: "FD", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.3 item 5b" }),
    rule({ ruleKey: "Q_VO_ABOVE_50", domain: "vo", method: "quotation", pctMin: "50", recommenders: [{ roleCode: "VOC", act: "MR" }], approverCode: "CEO", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.3 item 5a" }),

    // B.7 §3.1.4.4 item 5 Signing of the Letter of Acceptance, by contract value.
    rule({ ruleKey: "SIGN_300K_TO_1M", domain: "signing", method: "tender", contractValueMin: 300 * K, contractValueMax: 1 * M, recommenders: [{ roleCode: "CP", act: "R" }], approverCode: "HODIV", clause: "§3.1.4.4 item 5c" }),
    rule({ ruleKey: "SIGN_1M_TO_3M", domain: "signing", method: "tender", contractValueMin: 1 * M, contractValueMax: 3 * M, recommenders: [{ roleCode: "CP", act: "R" }], approverCode: "FD", clause: "§3.1.4.4 item 5b" }),
    rule({ ruleKey: "SIGN_ABOVE_3M", domain: "signing", method: "tender", contractValueMin: 3 * M, recommenders: [{ roleCode: "CP", act: "R" }], approverCode: "CEO", clause: "§3.1.4.4 item 5a" }),

    // B.7 §3.1.4.4 item 7 Tender VO: nine cells, contract value × VO percentage.
    voTender("T_VO_A_I", 3 * M, null, "30", null, "TBC", "§3.1.4.4 item 7a(i)"),
    voTender("T_VO_A_II", 3 * M, null, null, "30", "CEO", "§3.1.4.4 item 7a(ii)"),
    voTender("T_VO_B_I", 1 * M, 3 * M, "30", null, "TBC", "§3.1.4.4 item 7b(i)"),
    voTender("T_VO_B_II", 1 * M, 3 * M, "10", "30", "CEO", "§3.1.4.4 item 7b(ii)"),
    voTender("T_VO_B_III", 1 * M, 3 * M, null, "10", "FD", "§3.1.4.4 item 7b(iii)"),
    voTender("T_VO_C_I", 300 * K, 1 * M, "15", null, "TBC", "§3.1.4.4 item 7c(i)"),
    voTender("T_VO_C_II", 300 * K, 1 * M, "10", "15", "CEO", "§3.1.4.4 item 7c(ii)"),
    voTender("T_VO_C_III", 300 * K, 1 * M, "5", "10", "FD", "§3.1.4.4 item 7c(iii)"),
    voTender("T_VO_C_IV", 300 * K, 1 * M, null, "5", "HODIV", "§3.1.4.4 item 7c(iv)"),

    // B.7 §3.1.4.4 item 10 Delay and extension of time.
    rule({ ruleKey: "EOT_FIN_NOT_AUTHORITY", domain: "eot", method: "tender", cond: "financial_not_authority", recommenders: [{ roleCode: "VOC", act: "MR" }], approverCode: "TBC", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.4 item 10a(i)" }),
    rule({ ruleKey: "EOT_FIN_AUTHORITY", domain: "eot", method: "tender", cond: "financial_authority", recommenders: [{ roleCode: "VOC", act: "MR" }], approverCode: "CEO", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.4 item 10a(ii)" }),

    // B.7 §3.1.4.4 item 12 Waiver of LAD: a percentage of the LAD amount, not of the contract sum.
    rule({ ruleKey: "LAD_WAIVER_ABOVE_30", domain: "lad_waiver", method: "tender", pctMin: "30", approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.4 item 12a" }),
    rule({ ruleKey: "LAD_WAIVER_UP_TO_30", domain: "lad_waiver", method: "tender", pctMax: "30", approverCode: "CEO", clause: "§3.1.4.4 item 12b" }),

    // B.7 §3.1.4.4 item 13 Termination (conflicts with SK008 §7.5.1 — decision D2).
    rule({ ruleKey: "TERMINATION", domain: "termination", method: "tender", proposerCode: "CP", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "CEO", clause: "§3.1.4.4 item 13" }),

    // B.7 §3.1.4.4 item 15 Advance payment: no value band, and no quotation row at all.
    rule({ ruleKey: "ADVANCE_PAYMENT", domain: "advance_payment", method: "tender", proposerCode: "CP", recommenders: [{ roleCode: "HODIV", act: "R" }], approverCode: "CEO", clause: "§3.1.4.4 item 15" }),

    // B.7 §3.1.4.4 item 16 Interim payment, by the certificate's value.
    rule({ ruleKey: "IPC_UP_TO_100K", domain: "payment", method: "tender", maxValue: 100 * K, approverCode: "HODIV", clause: "§3.1.4.4 item 16c" }),
    rule({ ruleKey: "IPC_100K_TO_500K", domain: "payment", method: "tender", minValue: 100 * K, maxValue: 500 * K, approverCode: "FD", clause: "§3.1.4.4 item 16b" }),
    rule({ ruleKey: "IPC_ABOVE_500K", domain: "payment", method: "tender", minValue: 500 * K, approverCode: "CEO", clause: "§3.1.4.4 item 16a" }),
  ],
};
