/**
 * RSAJ starter pack, approvals (plan step 4.4): the offices the DAL routes to, the committees of FR-CTE-001 with no members, the Tender
 * Board's quorum, the opening panel, the three not-approved outcomes, the routing sheets' ICC targets, and the DAL itself as ONE DRAFT
 * matrix that a named person must adopt and put in force (ADR 0043 D2, SP-2). Transcribed from docs/requirements (the specification's
 * Appendix B reproduces DAL Issue A, Revision 00). Each entry cites its requirement and clause.
 *
 * A stacked DAL cell ("JR/R", "JR/P", "MR/P") is two entries, read per RSAJ's answer 1 (2026-10-24): the starred line is the head of the office
 * the Remarks name ("*by CP", "*by AD"), the unstarred line the head of the requesting department, and "P" the proposer. So a rule holds one
 * proposer and its recommenders in the order printed, and is STATED with the reading in its source. An asterisk names who acts in the slot
 * (answer 2): "*A by CP" makes the Head of Contract & Procurement approve. Offices are this pack's own short codes; every figure is the
 * appendix's. Rows of a DAL item no product matter asks (the deed of assignment, B.6 items 11, 13 and 14, B.7 items 2, 6, 8 and 14, the LAD
 * and suspension parts of B.6 item 6 and B.7 item 11, the release of retention and of the performance guarantee) are not loaded.
 */

import { SIGNATORY_DOMAIN } from "../../../src/lib/award/types";
import { NEGOTIATION_DOMAIN } from "../../../src/lib/evaluation/types";
import { LAD_WAIVER_DOMAIN, TERMINATION_DOMAIN, EOT_DOMAIN, PERIOD_EXTENSION_DOMAIN } from "../../../src/lib/matter/matter";
import { APPOINTMENT_DOMAIN, NAME_APPROVAL_DOMAIN, TENDERING_APPROVAL_DOMAIN } from "../../../src/lib/method/types";
import { REQUISITION_DOMAIN } from "../../../src/lib/requisition/types";
import { SO_DOMAIN } from "../../../src/lib/supervision/so";
import type { CoreLevel, Recommender } from "../../../src/lib/authority/types";
import type { PackMatrixDraft, PackRule } from "../../../src/lib/starter/types";

import { list, ref, type Cited } from "./shape";

const K = 1_000;
const M = 1_000_000;
const QUOTATION_FLOOR = 15 * K,
  TENDER_FLOOR = 300 * K;
const DAL = "DAL Issue A, Revision 00 (specification Appendix B)";

// ------------------------------------------------------------------ offices (B.1, B.9)

const office = (code: string, nameEn: string, cited: Cited, more: { isCommittee?: boolean; superior?: string } = {}) => ({
  code,
  values: { nameEn, nameMs: nameEn, isCommittee: more.isCommittee ?? false, escalatesToCode: more.superior ?? null, selfApprovalEscalatesToCode: more.superior ?? null },
  ...cited,
});
/// B.9: nobody approves their own matter (CEO to Chairman, FD to CEO, Head of Division to FD, Head of Department to Head of Division), and an
/// absent holder's authority goes to the immediate superior. The Chairman's superior is not stated.
const B1 = { requirement: "FR-APR-008, FR-APR-010", source: `${DAL} B.1, B.9 (§§1.5, 1.6)` };

export const OFFICES = list("AuthorityRole", "Office", [
  office("HOD", "Head of Department", B1, { superior: "HODIV" }),
  office("HODIV", "Head of Division", B1, { superior: "FD" }),
  office("FD", "Functional Director", B1, { superior: "CEO" }),
  office("CEO", "Chief Executive Officer", B1, { superior: "CM" }),
  office("CM", "Chairman", B1),
  office("CP", "Head of Contract & Procurement", B1),
  // B.4's Remarks: "*by AD", the starred line of DP_ABOVE_5M's stacked cell (answer 1). Its superior is not stated.
  office("AD", "Head of Administration Division", { requirement: "FR-APR-001, FR-MTD-002", source: `${DAL} B.4 (§3.1.4.2 item 1, Remarks "*by AD"); RSAJ answer 1 (2026-10-24)` }),
  office("BOD", "Board of Directors", B1, { isCommittee: true }),
  office("TBC", "Tender Board Committee", B1, { isCommittee: true }),
  office("QC", "Quotation Committee", B1, { isCommittee: true }),
  office("VOC", "Variation Orders Committee", B1, { isCommittee: true }),
]);

// ------------------------------------------------------------------ committees (FR-CTE-001, spec §5.2), no members

const CTE = "FR-CTE-001";
export const COMMITTEES = list("Committee", "Committee", [
  {
    code: "TBC",
    values: {
      nameEn: "Tender Board Committee",
      aliases: [],
      action: "APPROVES",
      mandate: "Established by the Board of Directors to approve tenders, extension of the contract period for term contracts, delay and extension of time and variation of works. Alone decides whether a late tender may be opened and evaluated.",
      valueScopeMin: "300000.00",
      quorum: 3,
      quorumProvenance: "STATED",
      notes: "An absent Chairman may appoint the CEO as chairman (SK003 7.6.3).",
    },
    requirement: `${CTE}, FR-CTE-003, FR-CTE-008`,
    source: "DAL p.12 (Appendix B.10); SK003 7.2.1(a), 7.6.2, 7.6.3",
  },
  {
    code: "QC",
    values: { nameEn: "Quotation Committee", aliases: [], action: "RECOMMENDS", mandate: "Mandatory, non-delegable recommendation on direct purchase and on open and selective appointment above RM15,000 and up to RM300,000, and on extending a term contract in the quotation band. The CEO approves.", valueScopeMin: "15000.00", valueScopeMax: "300000.00" },
    requirement: CTE,
    source: "DAL §3.1.4.2 items 1–2, §3.1.4.3 item 9 (spec §5.2)",
  },
  {
    code: "VOC",
    values: {
      nameEn: "Variation Orders Committee",
      aliases: ["Variation Order Committee"],
      action: "RECOMMENDS",
      mandate: "Mandatory, non-delegable recommendation on every variation and every delay and extension of time row in the tender regime, and on variations above 20% in the quotation regime.",
      compositionProvenance: "STATED",
      notes: "Chaired by the COO and CFO; members the heads of the P&D, P&M, QM and F&C divisions (KP002 flowchart 6.2). SK006 7.5.3 also has it approve extensions of time (see the route choice).",
    },
    requirement: `${CTE}, FR-CTE-002`,
    source: "DAL §§3.1.4.3, 3.1.4.4 (spec §5.2); KP002 flowchart 6.2; SK006 7.5.3; RSAJ answer 5 (2026-10-24)",
  },
  {
    code: "TOC",
    values: { nameEn: "Tender Opening Committee", aliases: [], action: "APPROVES", mandate: "Opens the tender box on the closing day, lists the offers in the schedule of tenders in opening order, numbers and initials each tender, enters the department estimate and signs.", valueScopeMin: "300000.00", panelSize: 2, panelSizeProvenance: "STATED", compositionProvenance: "STATED", notes: "Two appointed executives (SK002 7.7.2)." },
    requirement: `${CTE}, FR-CTE-002, FR-OPN-001, FR-OPN-002`,
    source: "SK002 7.7.2–7.7.4; DAL §3.1.4.4 item 2",
  },
  {
    code: "QOC",
    values: { nameEn: "Quotation Opening Committee", aliases: [], action: "APPROVES", mandate: "Opens quotations and signs the schedule of quotations.", valueScopeMin: "15000.00", valueScopeMax: "300000.00" },
    requirement: `${CTE}, FR-OPN-001`,
    source: "DAL §3.1.4.3 item 2",
  },
  {
    code: "TC",
    values: { nameEn: "Technical Committee", aliases: [], action: "DECIDES", mandate: "Decides the first-stage technical evaluation of design and build and turnkey tenders (design, materials, structural, mechanical and electrical), and approves specialist and sole-source repair methods." },
    requirement: `${CTE}, FR-EVL-005`,
    source: "SK003 7.3(a); OM/P/005 8.5",
  },
  {
    code: "TCC",
    values: { nameEn: "Technical & CAPEX Committee", aliases: [], action: "APPROVES", mandate: "Approves technical working papers and project proposals, and sets the scope of emergency works." },
    requirement: CTE,
    source: "OM/P/001 8.3; OM/P/004 8.4.2",
  },
  {
    code: "CC",
    values: { nameEn: "Claims Committee", aliases: [], action: "APPROVES", mandate: "Approves contractor loss and expense claims before the final account on service contracts." },
    requirement: CTE,
    source: "KP003 5.11.5",
  },
]);

// ------------------------------------------------------------------ not approved (FR-CTE-009): the three documented loops, no terminal outcome

const loop = (code: string, nameEn: string, returnsToStage: string) => ({
  code,
  values: { nameEn, kind: "LOOP" as const, returnsToStage, committeeId: ref("Committee", "TBC") },
  requirement: "FR-CTE-009",
  source: "SK003 flowchart; KP002/003/004 flowchart 6.1",
});
export const NOT_APPROVED = list("NotApprovedOutcome", "Not approved", [
  loop("recall", "Recall", "evaluation.recall"),
  loop("clarification", "Re-clarification", "evaluation.clarification"),
  loop("negotiation", "Re-negotiation", "evaluation.negotiation"),
]);

// ------------------------------------------------------------------ routing sheets and their ICC targets (FR-CRT-007, FR-CRT-008)

const CRT = { requirement: "FR-CRT-007, FR-CRT-008", source: "FORMS §11 (ICC columns)" };
/// The form a sheet prints on is its source, never its label (codes never reach a screen).
const sheet = (code: string, labelEn: string, form: string | null, certificateKind: "NON_COMPLETION" | "PRACTICAL_COMPLETION" | "MAKING_GOOD_DEFECTS" | "VARIATION" | "EOT" | "INTERIM_PAYMENT", upperEdgeInclusive: boolean | null = null, more: { notes?: string; source?: string } = {}) => ({
  code,
  values: { labelEn, subject: "CERTIFICATE" as const, certificateKind, upperEdgeInclusive, ...(more.notes ? { notes: more.notes } : {}) },
  requirement: CRT.requirement,
  source: more.source ?? (form ? `${CRT.source}; form ${form}` : CRT.source),
});
/// RSAJ answer 12: the interim payment's two routing sheets. Which applies to a certificate is not stated, so no kind setting picks one.
const IPC_SHEET = { source: "FR-CRT-008; RSAJ answer 12 (2026-10-24)" };
const IPC_OPEN = "When (ii) applies is not stated (RSAJ question 12).";
export const ROUTING_SHEETS = list("RoutingSheetType", "Routing sheet", [
  sheet("non_completion", "Certificate of non-completion", "CPD/DFA/CNC-CPC-CMGD", "NON_COMPLETION"),
  sheet("practical_completion", "Certificate of practical completion", "CPD/DFA/CNC-CPC-CMGD", "PRACTICAL_COMPLETION"),
  sheet("making_good_defects", "Certificate of making good defects", "CPD/DFA/CNC-CPC-CMGD", "MAKING_GOOD_DEFECTS"),
  sheet("variation_tender", "Tender variation", "CPD/DFA/VO(T)", "VARIATION"),
  // "2 weeks up to 20% and 6 weeks above 20%": a ratio of exactly 20% is "up to".
  sheet("variation_quotation", "Quotation variation", "CPD/DFA/VO(SH)", "VARIATION", true),
  sheet("eot_tender", "Tender extension of time, checking", null, "EOT"),
  sheet("eot_quotation", "Quotation extension of time, checking", null, "EOT"),
  sheet("interim_payment_cp", "Interim payment, through Contract & Procurement", null, "INTERIM_PAYMENT", null, { ...IPC_SHEET, notes: `21 days the user department, 21 Contract & Procurement, 10 Finance. ${IPC_OPEN}` }),
  sheet("interim_payment_so", "Interim payment, Superintending Officer approval", null, "INTERIM_PAYMENT", null, { ...IPC_SHEET, notes: `21 days the user department, 5 the Superintending Officer's approval, 15 Finance; Contract & Procurement is skipped. ${IPC_OPEN}` }),
]);
const target = (code: string, sheetCode: string, targetDays: number, band: { pctMin?: string; pctMax?: string } = {}, cited: Cited = CRT) => ({
  code,
  label: `${targetDays} days`,
  values: { typeId: ref("RoutingSheetType", sheetCode), targetDays, pctMin: band.pctMin ?? null, pctMax: band.pctMax ?? null },
  ...cited,
});
export const ROUTING_TARGETS = list("RoutingTarget", "ICC target", [
  target("non_completion", "non_completion", 28),
  target("practical_completion", "practical_completion", 28),
  target("making_good_defects", "making_good_defects", 28),
  target("variation_tender", "variation_tender", 42),
  target("variation_quotation_20", "variation_quotation", 14, { pctMax: "20" }),
  target("variation_quotation_above", "variation_quotation", 42, { pctMin: "20" }),
  target("eot_tender", "eot_tender", 14),
  target("eot_quotation", "eot_quotation", 7),
  target("interim_payment_cp", "interim_payment_cp", 52, {}, { requirement: CRT.requirement, source: IPC_SHEET.source }),
  target("interim_payment_so", "interim_payment_so", 41, {}, { requirement: CRT.requirement, source: IPC_SHEET.source }),
]);

// ------------------------------------------------------------------ the DAL, as one draft

const steps = (...s: [string, Recommender["act"]][]): Recommender[] => s.map(([roleCode, act]) => ({ roleCode, act }));
const core = (approverCode: string, chain: [string, "P" | "R", string?][]): CoreLevel => ({
  approverCode,
  clause: "§2.2.1",
  provenance: "STATED",
  steps: chain.map(([roleCode, act, note]) => ({ roleCode, act, provenance: "STATED", ...(note ? { note } : {}) })),
});

/// B.2: the chain beneath each approving office. Nothing above the CEO: §2.2.1 is silent there.
const CORE_ROUTING: CoreLevel[] = [
  core("HOD", []),
  core("HODIV", [["HOD", "R"]]),
  core("FD", [["HOD", "P"], ["HODIV", "R"]]),
  core("CEO", [["HOD", "P"], ["HODIV", "P", "or jointly propose"], ["FD", "R"]]),
];

type RuleIn = Partial<PackRule> & Pick<PackRule, "ruleKey" | "domain" | "labelEn" | "clause">;
const rule = (r: RuleIn, requirement: string): PackRule => ({
  method: null,
  cond: null,
  minValue: null,
  maxValue: null,
  pctMin: null,
  pctMax: null,
  contractValueMin: null,
  contractValueMax: null,
  followsBoundarySwitch: true,
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
  sortOrder: 0,
  recommenders: [],
  generateCoreChain: null,
  coreChainReason: null,
  provenance: "STATED",
  source: `${DAL} ${r.clause}`,
  requirement,
  ...r,
});
/// A stacked DAL cell ("JR/R by CP"), read per RSAJ answer 1: STATED, the reading in its source.
const stacked = (r: RuleIn, requirement: string): PackRule => rule({ ...r, source: `${DAL} ${r.clause}; stacked code read per RSAJ answer 1 (2026-10-24)` }, requirement);
/// "*A by CP": the Head of Contract & Procurement approves (RSAJ answer 2).
const byCp = (r: RuleIn, requirement: string): PackRule => rule({ approverCode: "CP", ...r, source: `${DAL} ${r.clause}; "*A by CP" read per RSAJ answer 2 (2026-10-24)` }, requirement);

const REQ = "FR-REQ-009, FR-MTD-001";
const APP = "FR-MTD-002, FR-APR-006";
const VO_QUOTATION = "FR-VAR-012, FR-APR-002";
const VO_TENDER = "FR-VAR-011, FR-APR-002";
const voTender = (ruleKey: string, labelEn: string, cvMin: number, cvMax: number | null, pctMin: string | null, pctMax: string | null, approverCode: string, clause: string) =>
  rule({ ruleKey, domain: "vo", labelEn, contractValueMin: cvMin, contractValueMax: cvMax, pctMin, pctMax, recommenders: steps(["VOC", "MR"]), approverCode, committeeCode: "VOC", committeeAct: "MR", clause }, VO_TENDER);
/// B.6 and B.7 are headed by the contract's value ("contracts more than RM15K and up to RM300K"; "contracts more than RM300K"), not by how
/// it was procured: a post-award rule names no method (a contract's method key is "open_selective" or "direct") and is banded by the
/// contract's value instead. The tender variations' own contract bands already sit inside B.7's.
const QUOTATION_CONTRACTS = { contractValueMin: QUOTATION_FLOOR, contractValueMax: TENDER_FLOOR } as const;
const TENDER_CONTRACTS = { contractValueMin: TENDER_FLOOR, contractValueMax: null } as const;
const EXAMPLE_5_REASON = "§3.1.4.2 item 1 states the chain; §2.2.1 is silent above the CEO";
/// A pre-award matter is banded on its own value (B.6 and B.7 headings; exactly RM300,000.00 is a quotation, RSAJ answer 3).
const QUOTATION_VALUES = { minValue: QUOTATION_FLOOR, maxValue: TENDER_FLOOR } as const;
const TENDER_VALUES = { minValue: TENDER_FLOOR, maxValue: null } as const;
const CP_THEN_HOD = { recommenders: steps(["CP", "JR"], ["HOD", "R"]) };
/// "*A As S.O./P.D.": one row per Superintending Officer band (as the S.O. rows below), the stacked "JR/R by CP" beneath it.
const SO_BANDS = [
  { key: "300K_TO_1M", words: "contract more than RM300,000 and up to RM1 million", min: TENDER_FLOOR, max: 1 * M, office: "HODIV" },
  { key: "1M_TO_3M", words: "contract more than RM1 million and up to RM3 million", min: 1 * M, max: 3 * M, office: "FD" },
  { key: "ABOVE_3M", words: "contract more than RM3 million", min: 3 * M, max: null, office: "CEO" },
] as const;
const asSo = (prefix: string, domain: string, what: string, clause: string, requirement: string): PackRule[] =>
  SO_BANDS.map((b) => stacked({ ruleKey: `${prefix}_${b.key}`, domain, contractValueMin: b.min, contractValueMax: b.max, labelEn: `${what}, ${b.words}`, ...CP_THEN_HOD, approverCode: b.office, clause }, requirement));

/// Route choices (decision D2, RSAJ answer 16; founder: "make it configurable"). Where the DAL and an SK procedure give different routes, both
/// load as options, STATED, each citing its own document, and none chosen: RSAJ chooses on the draft. One constant per option, so a typo cannot
/// split a choice.
const CHOICE_ANSWER = "route choice per RSAJ answer 16 (2026-10-24)";
const DAL_OPTION = "DAL Appendix B";
const SK008_OPTION = "SK008 §7.5.1";
const SK006_EOT_OPTION = "SK006 §7.6.1";
const SK006_PX_OPTION = "SK006 §7.6.2";
/// A row of a route choice from a document other than the DAL: its clause and source are that document's, never the DAL's.
const sk = (r: RuleIn, requirement: string): PackRule => rule({ ...r, source: `${r.clause}; ${CHOICE_ANSWER}` }, requirement);
const option = (choiceOptionEn: string, rows: PackRule[]): PackRule[] => rows.map((r) => ({ ...r, choiceOptionEn, chosen: null }));
const NO_FIN = { domain: EOT_DOMAIN, cond: "no_financial_impact" } as const;
const VOC_MR = { recommenders: steps(["VOC", "MR"]), committeeCode: "VOC", committeeAct: "MR", nonDelegable: true } as const;
const VOC_APPROVES = { approverCode: "VOC", committeeCode: "VOC", committeeAct: "A" } as const;

const RULES: PackRule[] = [
  // B.3 §3.1.4.1 Approval of requisition. Requisition bands do not follow the boundary switch (ruling OD-4).
  rule({ ruleKey: "REQ_UP_TO_500", domain: REQUISITION_DOMAIN, labelEn: "Requisition, up to RM500", maxValue: 500, approverCode: "HOD", followsBoundarySwitch: false, clause: "§3.1.4.1" }, REQ),
  rule({ ruleKey: "REQ_500_TO_50K", domain: REQUISITION_DOMAIN, labelEn: "Requisition, more than RM500 and up to RM50,000", minValue: 500, maxValue: 50 * K, recommenders: steps(["HOD", "R"]), approverCode: "HODIV", followsBoundarySwitch: false, clause: "§3.1.4.1" }, REQ),
  rule({ ruleKey: "REQ_50K_TO_300K", domain: REQUISITION_DOMAIN, labelEn: "Requisition, more than RM50,000 and up to RM300,000", minValue: 50 * K, maxValue: 300 * K, proposerCode: "HOD", recommenders: steps(["HODIV", "R"]), approverCode: "FD", followsBoundarySwitch: false, clause: "§3.1.4.1" }, REQ),
  rule({ ruleKey: "REQ_ABOVE_300K", domain: REQUISITION_DOMAIN, labelEn: "Requisition, more than RM300,000", minValue: 300 * K, recommenders: steps(["HODIV", "R"], ["FD", "MR"]), approverCode: "CEO", followsBoundarySwitch: false, generateCoreChain: true, clause: "§3.1.4.1" }, REQ),

  // B.4 §3.1.4.2 item 1 Direct purchase (proprietary and emergency).
  rule({ ruleKey: "DP_UP_TO_500", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, up to RM500", maxValue: 500, approverCode: "HOD", clause: "§3.1.4.2 item 1" }, APP),
  rule({ ruleKey: "DP_500_TO_5K", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, more than RM500 and up to RM5,000", minValue: 500, maxValue: 5 * K, recommenders: steps(["HOD", "R"]), approverCode: "HODIV", clause: "§3.1.4.2 item 1" }, APP),
  rule({ ruleKey: "DP_5K_TO_15K", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, more than RM5,000 and up to RM15,000", minValue: 5 * K, maxValue: 15 * K, proposerCode: "HOD", recommenders: steps(["HODIV", "R"]), approverCode: "FD", clause: "§3.1.4.2 item 1" }, APP),
  rule(
    { ruleKey: "DP_15K_TO_300K", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, more than RM15,000 and up to RM300,000", minValue: 15 * K, maxValue: 300 * K, proposerCode: "HOD", recommenders: steps(["HODIV", "JP"], ["FD", "R"], ["QC", "MR"]), approverCode: "CEO", committeeCode: "QC", committeeAct: "MR", nonDelegable: true, clause: "§3.1.4.2 item 1" },
    APP,
  ),
  rule({ ruleKey: "DP_300K_TO_3M", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, more than RM300,000 and up to RM3 million", minValue: 300 * K, maxValue: 3 * M, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.2 item 1" }, APP),
  rule({ ruleKey: "DP_3M_TO_5M", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, more than RM3 million and up to RM5 million", minValue: 3 * M, maxValue: 5 * M, recommenders: steps(["TBC", "MR"]), approverCode: "CM", committeeCode: "TBC", committeeAct: "MR", clause: "§3.1.4.2 item 1" }, APP),
  // "JR/R Head of Div (*by AD)": the Head of Administration Division jointly recommends, then the Head of Division recommends.
  stacked(
    { ruleKey: "DP_ABOVE_5M", domain: APPOINTMENT_DOMAIN, method: "direct", labelEn: "Direct purchase, more than RM5 million", minValue: 5 * M, proposerCode: "HOD", recommenders: steps(["AD", "JR"], ["HODIV", "R"], ["TBC", "MR"]), approverCode: "BOD", committeeCode: "TBC", committeeAct: "MR", generateCoreChain: false, coreChainReason: EXAMPLE_5_REASON, clause: "§3.1.4.2 item 1" },
    APP,
  ),

  // B.5 §3.1.4.2 item 2 Open and selective: no Chairman or Board row at any value.
  rule({ ruleKey: "OS_UP_TO_5K", domain: APPOINTMENT_DOMAIN, method: "open_selective", labelEn: "Open or selective appointment, up to RM5,000", maxValue: 5 * K, recommenders: steps(["HOD", "R"]), approverCode: "HODIV", clause: "§3.1.4.2 item 2" }, APP),
  rule({ ruleKey: "OS_5K_TO_15K", domain: APPOINTMENT_DOMAIN, method: "open_selective", labelEn: "Open or selective appointment, more than RM5,000 and up to RM15,000", minValue: 5 * K, maxValue: 15 * K, proposerCode: "HOD", recommenders: steps(["HODIV", "R"]), approverCode: "FD", clause: "§3.1.4.2 item 2" }, APP),
  rule(
    { ruleKey: "OS_15K_TO_300K", domain: APPOINTMENT_DOMAIN, method: "open_selective", labelEn: "Open or selective appointment, more than RM15,000 and up to RM300,000", minValue: 15 * K, maxValue: 300 * K, recommenders: steps(["HODIV", "JP"], ["QC", "MR"]), approverCode: "CEO", committeeCode: "QC", committeeAct: "MR", nonDelegable: true, generateCoreChain: true, clause: "§3.1.4.2 item 2" },
    APP,
  ),
  rule({ ruleKey: "OS_ABOVE_300K", domain: APPOINTMENT_DOMAIN, method: "open_selective", labelEn: "Open or selective appointment, more than RM300,000", minValue: 300 * K, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.2 item 2" }, APP),

  // B.6 §3.1.4.3 item 5 Quotation variation: by percentage alone, and no committee up to 20%.
  rule({ ruleKey: "Q_VO_UP_TO_20", domain: "vo", ...QUOTATION_CONTRACTS, labelEn: "Quotation variation, up to 20%", pctMax: "20", approverCode: "HODIV", clause: "§3.1.4.3 item 5c" }, VO_QUOTATION),
  rule({ ruleKey: "Q_VO_20_TO_50", domain: "vo", ...QUOTATION_CONTRACTS, labelEn: "Quotation variation, more than 20% and up to 50%", pctMin: "20", pctMax: "50", recommenders: steps(["VOC", "MR"]), approverCode: "FD", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.3 item 5b" }, VO_QUOTATION),
  rule({ ruleKey: "Q_VO_ABOVE_50", domain: "vo", ...QUOTATION_CONTRACTS, labelEn: "Quotation variation, more than 50%", pctMin: "50", recommenders: steps(["VOC", "MR"]), approverCode: "CEO", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.3 item 5a" }, VO_QUOTATION),

  // B.7 §3.1.4.4 item 5 Signing the letter of acceptance, by the contract's value: the award signatory's matter (its value is the award's).
  rule({ ruleKey: "SIGN_300K_TO_1M", domain: SIGNATORY_DOMAIN, cond: "LETTER_OF_ACCEPTANCE", labelEn: "Signing the letter of acceptance, more than RM300,000 and up to RM1 million", minValue: 300 * K, maxValue: 1 * M, recommenders: steps(["CP", "R"]), approverCode: "HODIV", clause: "§3.1.4.4 item 5c" }, "FR-AWD-002, FR-APR-002"),
  rule({ ruleKey: "SIGN_1M_TO_3M", domain: SIGNATORY_DOMAIN, cond: "LETTER_OF_ACCEPTANCE", labelEn: "Signing the letter of acceptance, more than RM1 million and up to RM3 million", minValue: 1 * M, maxValue: 3 * M, recommenders: steps(["CP", "R"]), approverCode: "FD", clause: "§3.1.4.4 item 5b" }, "FR-AWD-002, FR-APR-002"),
  rule({ ruleKey: "SIGN_ABOVE_3M", domain: SIGNATORY_DOMAIN, cond: "LETTER_OF_ACCEPTANCE", labelEn: "Signing the letter of acceptance, more than RM3 million", minValue: 3 * M, recommenders: steps(["CP", "R"]), approverCode: "CEO", clause: "§3.1.4.4 item 5a" }, "FR-AWD-002, FR-APR-002"),

  // B.7 §3.1.4.4 item 7 Tender variation: contract value × percentage, nine cells.
  voTender("T_VO_A_I", "Tender variation, contract above RM3 million, more than 30%", 3 * M, null, "30", null, "TBC", "§3.1.4.4 item 7a(i)"),
  voTender("T_VO_A_II", "Tender variation, contract above RM3 million, up to 30%", 3 * M, null, null, "30", "CEO", "§3.1.4.4 item 7a(ii)"),
  voTender("T_VO_B_I", "Tender variation, contract RM1 million to RM3 million, more than 30%", 1 * M, 3 * M, "30", null, "TBC", "§3.1.4.4 item 7b(i)"),
  voTender("T_VO_B_II", "Tender variation, contract RM1 million to RM3 million, more than 10% and up to 30%", 1 * M, 3 * M, "10", "30", "CEO", "§3.1.4.4 item 7b(ii)"),
  voTender("T_VO_B_III", "Tender variation, contract RM1 million to RM3 million, up to 10%", 1 * M, 3 * M, null, "10", "FD", "§3.1.4.4 item 7b(iii)"),
  voTender("T_VO_C_I", "Tender variation, contract RM300,000 to RM1 million, more than 15%", 300 * K, 1 * M, "15", null, "TBC", "§3.1.4.4 item 7c(i)"),
  voTender("T_VO_C_II", "Tender variation, contract RM300,000 to RM1 million, more than 10% and up to 15%", 300 * K, 1 * M, "10", "15", "CEO", "§3.1.4.4 item 7c(ii)"),
  voTender("T_VO_C_III", "Tender variation, contract RM300,000 to RM1 million, more than 5% and up to 10%", 300 * K, 1 * M, "5", "10", "FD", "§3.1.4.4 item 7c(iii)"),
  voTender("T_VO_C_IV", "Tender variation, contract RM300,000 to RM1 million, up to 5%", 300 * K, 1 * M, null, "5", "HODIV", "§3.1.4.4 item 7c(iv)"),

  // B.7 §3.1.4.4 item 10 Delay and extension of time with financial impact.
  rule({ ruleKey: "EOT_FIN_NOT_AUTHORITY", domain: EOT_DOMAIN, ...TENDER_CONTRACTS, cond: "financial_not_authority", labelEn: "Extension of time with financial impact, not due to an authority's requirement", recommenders: steps(["VOC", "MR"]), approverCode: "TBC", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.4 item 10a(i)" }, "FR-EOT-007, FR-APR-002"),
  rule({ ruleKey: "EOT_FIN_AUTHORITY", domain: EOT_DOMAIN, ...TENDER_CONTRACTS, cond: "financial_authority", labelEn: "Extension of time with financial impact, due to an authority's requirement", recommenders: steps(["VOC", "MR"]), approverCode: "CEO", committeeCode: "VOC", committeeAct: "MR", clause: "§3.1.4.4 item 10a(ii)" }, "FR-EOT-007, FR-APR-002"),

  // B.7 §3.1.4.4 item 12 Waiver of LAD: a percentage of the LAD amount.
  rule({ ruleKey: "LAD_WAIVER_ABOVE_30", domain: LAD_WAIVER_DOMAIN, ...TENDER_CONTRACTS, labelEn: "Waiver of LAD, more than 30% of the LAD amount", pctMin: "30", approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.4 item 12a" }, "FR-LAD-009, FR-APR-002"),
  rule({ ruleKey: "LAD_WAIVER_UP_TO_30", domain: LAD_WAIVER_DOMAIN, ...TENDER_CONTRACTS, labelEn: "Waiver of LAD, up to 30% of the LAD amount", pctMax: "30", approverCode: "CEO", clause: "§3.1.4.4 item 12b" }, "FR-LAD-009, FR-APR-002"),

  // B.7 §3.1.4.4 item 15, "JR/P by CP": the requesting department's head proposes and the Head of C&P jointly recommends.
  stacked({ ruleKey: "ADVANCE_PAYMENT", domain: "advance_payment", ...TENDER_CONTRACTS, labelEn: "Advance payment", proposerCode: "HOD", recommenders: steps(["CP", "JR"], ["HODIV", "R"]), approverCode: "CEO", clause: "§3.1.4.4 item 15" }, "FR-PAY-001, FR-APR-002"),

  // B.7 §3.1.4.4 item 16 Interim payment, by the certificate's value.
  rule({ ruleKey: "IPC_UP_TO_100K", domain: "payment", ...TENDER_CONTRACTS, labelEn: "Interim payment, up to RM100,000", maxValue: 100 * K, approverCode: "HODIV", clause: "§3.1.4.4 item 16c" }, "FR-PAY-016, FR-APR-002"),
  rule({ ruleKey: "IPC_100K_TO_500K", domain: "payment", ...TENDER_CONTRACTS, labelEn: "Interim payment, more than RM100,000 and up to RM500,000", minValue: 100 * K, maxValue: 500 * K, approverCode: "FD", clause: "§3.1.4.4 item 16b" }, "FR-PAY-016, FR-APR-002"),
  rule({ ruleKey: "IPC_ABOVE_500K", domain: "payment", ...TENDER_CONTRACTS, labelEn: "Interim payment, more than RM500,000", minValue: 500 * K, approverCode: "CEO", clause: "§3.1.4.4 item 16a" }, "FR-PAY-016, FR-APR-002"),

  // Plan step 4.6: the B.6 and B.7 rows the DAL states plainly. Extension of time with no financial impact, extension of the contract period
  // and termination are route choices (decision D2), below.
  // B.6 item 6 and B.7 item 5: the office that acts as Superintending Officer, by the contract's value.
  rule({ ruleKey: "SO_QUOTATION", domain: SO_DOMAIN, ...QUOTATION_CONTRACTS, labelEn: "Superintending Officer, contract more than RM15,000 and up to RM300,000", approverCode: "HODIV", clause: "§3.1.4.3 item 6" }, "FR-SUP-001, FR-APR-002"),
  rule({ ruleKey: "SO_300K_TO_1M", domain: SO_DOMAIN, contractValueMin: TENDER_FLOOR, contractValueMax: 1 * M, labelEn: "Superintending Officer, contract more than RM300,000 and up to RM1 million", approverCode: "HODIV", clause: "§3.1.4.4 item 5c" }, "FR-SUP-001, FR-APR-002"),
  rule({ ruleKey: "SO_1M_TO_3M", domain: SO_DOMAIN, contractValueMin: 1 * M, contractValueMax: 3 * M, labelEn: "Superintending Officer, contract more than RM1 million and up to RM3 million", approverCode: "FD", clause: "§3.1.4.4 item 5b" }, "FR-SUP-001, FR-APR-002"),
  rule({ ruleKey: "SO_ABOVE_3M", domain: SO_DOMAIN, contractValueMin: 3 * M, labelEn: "Superintending Officer, contract more than RM3 million", approverCode: "CEO", clause: "§3.1.4.4 item 5a" }, "FR-SUP-001, FR-APR-002"),
  // B.6 item 7: one waiver row for quotation contracts, "flat — no percentage split at this band".
  rule({ ruleKey: "LAD_WAIVER_QUOTATION", domain: LAD_WAIVER_DOMAIN, ...QUOTATION_CONTRACTS, labelEn: "Waiver of LAD, quotation contract", approverCode: "CEO", clause: "§3.1.4.3 item 7" }, "FR-LAD-009, FR-APR-002"),

  // Pre-award, by the matter's own value (answers 1 to 3): no method, so a tender and a quotation pack of any method find their row.
  byCp({ ruleKey: "TA_QUOTATION", domain: TENDERING_APPROVAL_DOMAIN, ...QUOTATION_VALUES, labelEn: "Approval for tendering, more than RM15,000 and up to RM300,000", clause: "§3.1.4.3 item 1" }, "FR-DOC-012, FR-APR-002"),
  byCp({ ruleKey: "TA_TENDER", domain: TENDERING_APPROVAL_DOMAIN, ...TENDER_VALUES, labelEn: "Approval for tendering, more than RM300,000", clause: "§3.1.4.4 item 1" }, "FR-DOC-012, FR-APR-002"),
  byCp({ ruleKey: "NEG_QUOTATION", domain: NEGOTIATION_DOMAIN, ...QUOTATION_VALUES, labelEn: "Price negotiation, more than RM15,000 and up to RM300,000", clause: "§3.1.4.3 item 3" }, "FR-EVL-016, FR-APR-002"),
  byCp({ ruleKey: "NEG_TENDER", domain: NEGOTIATION_DOMAIN, ...TENDER_VALUES, labelEn: "Price negotiation, more than RM300,000", clause: "§3.1.4.4 item 3" }, "FR-EVL-016, FR-APR-002"),
  stacked({ ruleKey: "NAME_QUOTATION", domain: NAME_APPROVAL_DOMAIN, ...QUOTATION_VALUES, labelEn: "Approval of the names, more than RM15,000 and up to RM300,000", proposerCode: "HOD", recommenders: steps(["CP", "JR"], ["HODIV", "R"]), approverCode: "FD", clause: "§3.1.4.3 item 4" }, "FR-MTD-008, FR-APR-002"),
  // "MR/P by CP": the requesting department's head proposes and the Head of C&P gives a mandatory recommendation.
  stacked(
    { ruleKey: "NAME_TENDER", domain: NAME_APPROVAL_DOMAIN, ...TENDER_VALUES, labelEn: "Approval of the names, more than RM300,000", proposerCode: "HOD", recommenders: steps(["CP", "MR"], ["HODIV", "JR"], ["FD", "R"]), approverCode: "CEO", nonDelegable: true, clause: "§3.1.4.4 item 4" },
    "FR-MTD-008, FR-APR-002",
  ),
  byCp({ ruleKey: "SIGN_INDENT", domain: SIGNATORY_DOMAIN, cond: "WORK_INDENT", ...QUOTATION_VALUES, labelEn: "Signing the work indent, more than RM15,000 and up to RM300,000", clause: "§3.1.4.3 item 15" }, "FR-AWD-007, FR-APR-002"),

  // B.6 items 6, 10 and 12, "JR/R by CP" on a quotation contract: the Head of C&P jointly recommends, the requesting department's head recommends.
  stacked({ ruleKey: "IPC_QUOTATION", domain: "payment", ...QUOTATION_CONTRACTS, labelEn: "Interim payment, quotation contract", ...CP_THEN_HOD, approverCode: "HODIV", clause: "§3.1.4.3 item 12" }, "FR-PAY-016, FR-APR-002"),
  stacked({ ruleKey: "FINAL_QUOTATION", domain: "final_payment", ...QUOTATION_CONTRACTS, labelEn: "Final payment, quotation contract", ...CP_THEN_HOD, approverCode: "HODIV", clause: "§3.1.4.3 item 12" }, "FR-FIN-010, FR-APR-002"),
  stacked({ ruleKey: "MGD_QUOTATION", domain: "making_good", ...QUOTATION_CONTRACTS, labelEn: "Certificate of making good defects, quotation contract", ...CP_THEN_HOD, approverCode: "HODIV", clause: "§3.1.4.3 item 10" }, "FR-CMP-016, FR-APR-002"),
  stacked({ ruleKey: "EOT_Q_FIN_NOT_AUTHORITY", domain: EOT_DOMAIN, cond: "financial_not_authority", ...QUOTATION_CONTRACTS, labelEn: "Extension of time with financial impact, not due to an authority's requirement, quotation contract", ...CP_THEN_HOD, approverCode: "HODIV", clause: "§3.1.4.3 item 6" }, "FR-EOT-007, FR-APR-002"),
  stacked({ ruleKey: "EOT_Q_FIN_AUTHORITY", domain: EOT_DOMAIN, cond: "financial_authority", ...QUOTATION_CONTRACTS, labelEn: "Extension of time with financial impact, due to an authority's requirement, quotation contract", ...CP_THEN_HOD, approverCode: "HODIV", clause: "§3.1.4.3 item 6" }, "FR-EOT-007, FR-APR-002"),

  // B.7 items 11 and 17, "JR/R by CP" with "*A As S.O./P.D.": approved by whichever office acts as Superintending Officer at the contract's value.
  ...asSo("NC_T", "non_completion", "Certificate of non-completion", "§3.1.4.4 item 11", "FR-LAD-006, FR-APR-002"),
  ...asSo("PC_T", "practical_completion", "Certificate of practical completion", "§3.1.4.4 item 11", "FR-CMP-006, FR-APR-002"),
  ...asSo("MGD_T", "making_good", "Certificate of making good defects", "§3.1.4.4 item 11", "FR-CMP-016, FR-APR-002"),
  ...asSo("FINAL_T", "final_payment", "Final payment", "§3.1.4.4 item 17", "FR-FIN-010, FR-APR-002"),

  // Route choice: termination (FR-TRM-005). The DAL has the CEO approve (B.6 item 8, B.7 item 13, "JR/P by CP"); SK008 §7.5.1 has the S.O./P.D. act.
  ...option(DAL_OPTION, [
    stacked({ ruleKey: "TERMINATION", domain: TERMINATION_DOMAIN, ...TENDER_CONTRACTS, labelEn: "Termination, arbitration or litigation", proposerCode: "HOD", recommenders: steps(["CP", "JR"], ["HODIV", "R"]), approverCode: "CEO", clause: "§3.1.4.4 item 13" }, "FR-TRM-005, FR-APR-002"),
    stacked({ ruleKey: "TERMINATION_QUOTATION", domain: TERMINATION_DOMAIN, ...QUOTATION_CONTRACTS, labelEn: "Termination, arbitration or litigation, quotation contract", proposerCode: "HOD", recommenders: steps(["CP", "JR"], ["HODIV", "R"], ["FD", "MR"]), approverCode: "CEO", nonDelegable: true, clause: "§3.1.4.3 item 8" }, "FR-TRM-005, FR-APR-002"),
  ]),
  ...option(
    SK008_OPTION,
    [{ key: "QUOTATION", words: "contract more than RM15,000 and up to RM300,000", min: QUOTATION_FLOOR, max: TENDER_FLOOR, office: "HODIV" }, ...SO_BANDS].map((b) =>
      sk({ ruleKey: `TERMINATION_SO_${b.key}`, domain: TERMINATION_DOMAIN, contractValueMin: b.min, contractValueMax: b.max, labelEn: `Termination by the S.O./P.D., ${b.words}`, approverCode: b.office, clause: "SK008 §7.5.1" }, "FR-TRM-005, FR-APR-002"),
    ),
  ),

  // Route choice: extension of time with no financial impact (FR-EOT-007). The DAL has the S.O./P.D. approve after the Variation Orders
  // Committee's mandatory recommendation (B.7 item 10b; B.6 item 6 on a quotation contract); SK006 §7.6.1, as amended 12.01.2026, and 7.5.3
  // have the committee approve.
  ...option(DAL_OPTION, [
    ...SO_BANDS.map((b) => rule({ ruleKey: `EOT_NOFIN_${b.key}`, ...NO_FIN, contractValueMin: b.min, contractValueMax: b.max, labelEn: `Extension of time with no financial impact, ${b.words}`, ...VOC_MR, approverCode: b.office, clause: "§3.1.4.4 item 10b" }, "FR-EOT-007, FR-APR-002")),
    stacked({ ruleKey: "EOT_NOFIN_Q", ...NO_FIN, ...QUOTATION_CONTRACTS, labelEn: "Extension of time with no financial impact, quotation contract", ...CP_THEN_HOD, approverCode: "HODIV", clause: "§3.1.4.3 item 6" }, "FR-EOT-007, FR-APR-002"),
  ]),
  ...option(SK006_EOT_OPTION, [sk({ ruleKey: "EOT_NOFIN_SK006", ...NO_FIN, labelEn: "Extension of time with no financial impact, by the Variation Orders Committee", ...VOC_APPROVES, clause: "SK006 §7.6.1 (as amended 12.01.2026), 7.5.3" }, "FR-EOT-007, FR-APR-002")]),

  // Route choice: extension of the contract period (FR-EOT-012). The DAL bands it by the contract's value (B.7 item 9, "JR/R by CP", the Tender
  // Board approving; B.6 item 9, the Quotation Committee's mandatory recommendation, the FD approving). SK006 §7.6.2 bands it by the extension's
  // own value: more than RM50,000 to the Tender Board after the Variation Orders Committee, RM0 to the committee. It has no row for RM0.01 to
  // RM50,000, so none is loaded. A period extension raised with no value is routed as RM0 (src/lib/time/route.ts).
  ...option(DAL_OPTION, [
    stacked({ ruleKey: "PX_TENDER", domain: PERIOD_EXTENSION_DOMAIN, ...TENDER_CONTRACTS, labelEn: "Extension of the contract period, tender contract", ...CP_THEN_HOD, approverCode: "TBC", committeeCode: "TBC", committeeAct: "A", clause: "§3.1.4.4 item 9" }, "FR-EOT-012, FR-APR-002"),
    rule({ ruleKey: "PX_QUOTATION", domain: PERIOD_EXTENSION_DOMAIN, ...QUOTATION_CONTRACTS, labelEn: "Extension of the contract period, quotation contract", recommenders: steps(["QC", "MR"]), approverCode: "FD", committeeCode: "QC", committeeAct: "MR", nonDelegable: true, clause: "§3.1.4.3 item 9" }, "FR-EOT-012, FR-APR-002"),
  ]),
  ...option(SK006_PX_OPTION, [
    sk({ ruleKey: "PX_SK006_ABOVE_50K", domain: PERIOD_EXTENSION_DOMAIN, minValue: 50 * K, labelEn: "Extension of the contract period, more than RM50,000", ...VOC_MR, approverCode: "TBC", clause: "SK006 §7.6.2" }, "FR-EOT-012, FR-APR-002"),
    sk({ ruleKey: "PX_SK006_NO_VALUE", domain: PERIOD_EXTENSION_DOMAIN, maxValue: 0, labelEn: "Extension of the contract period, no added value", ...VOC_APPROVES, clause: "SK006 §7.6.2" }, "FR-EOT-012, FR-APR-002"),
  ]),
].map((r, i) => ({ ...r, sortOrder: i + 1 }));

export const DAL_DRAFT: PackMatrixDraft = {
  label: "DAL Issue A, Revision 00 (draft from the starter pack)",
  // FR-MTD-003, decision D3: "more than RM300K", so a value exactly on the boundary is a quotation (RSAJ answer 3).
  policy: { boundaryValue: TENDER_FLOOR, boundaryInclusive: true, quotationFloor: QUOTATION_FLOOR, tenderFloor: TENDER_FLOOR, requisitionBoundary: 50 * K, currency: "MYR" },
  boundaryProvenance: "STATED",
  boundarySource: "DAL §3.1.4.2–3.1.4.4 bands ('more than RM15K and up to RM300K'; 'more than RM300K'); SK001–SK003 'melebihi RM300,000'; RSAJ answer 3",
  coreRouting: CORE_ROUTING,
  // §4.2.3: the quotation-route appointment letters split at RM50,000; above it retention and the defects liability period apply, below it neither.
  termsBands: [
    { bandKey: "QUOTATION_UP_TO_50K", regime: "quotation", minValue: null, maxValue: 50 * K, labelEn: "Quotation terms, up to RM50,000", retentionApplies: false, defectsLiabilityApplies: false, followsBoundarySwitch: null, clause: "Spec §4.2.3 (quotation-route appointment letters)", provenance: "STATED" },
    { bandKey: "QUOTATION_ABOVE_50K", regime: "quotation", minValue: 50 * K, maxValue: null, labelEn: "Quotation terms, more than RM50,000", retentionApplies: true, defectsLiabilityApplies: true, followsBoundarySwitch: null, clause: "Spec §4.2.3 (quotation-route appointment letters)", provenance: "STATED" },
  ],
  rules: RULES,
  requirement: "FR-APR-001, FR-APR-004, FR-MTD-001, FR-MTD-002, FR-MTD-003",
  source: `${DAL}, Appendix B.2 to B.7`,
};

export const APPROVALS = {
  lists: [OFFICES, COMMITTEES, NOT_APPROVED, ROUTING_SHEETS, ROUTING_TARGETS],
  groups: [],
  drafts: { matrices: [DAL_DRAFT] },
};
