/**
 * RSAJ starter pack, contracts (plan step 4.6): the award clocks, who receives a copy of the Letter of Acceptance, the controlled copies of the
 * executed contract and their stamp, the in-delay line, the retention released at as-built, the design guarantee bond and the finance system's
 * number formats. Transcribed from the specification; each entry cites its requirement and clause, and every one is STATED.
 *
 * Left out, because the documents do not state them (open questions for RSAJ, plan 4.6):
 * - the contract document parts (FR-CON-003): SK004 §7.3.1 prescribes an order per basis, but no document in docs/requirements lists it;
 * - the appointment-letter variants (FR-AWD-007): the six variants and their RM50,000 split are stated, but not which contract types each one
 *   serves, and each needs its template. Loaded with no types, every work indent below RM50,000 would find three equal variants and be refused.
 */

import { group, list } from "./shape";

// ------------------------------------------------------------------ award (FR-AWD-004, FR-AWD-006, FR-AWD-009)

const AWARD_GROUPS = [
  group("AwardPolicy", "Award · indent validity", { indentValidityDays: 14 }, { requirement: "FR-AWD-006", source: "DAL §3.1.4.3 items 14–15" }, { provenance: "provenance" }),
  group("AwardPolicy", "Award · start of work", { commencementGraceDays: 7 }, { requirement: "FR-AWD-009", source: "Appointment-letter templates (seven-day commencement rule)" }, { provenance: "provenance" }),
  group("AwardPolicy", "Award · works needing the regulator's copy", { regulatedActivityLabel: "Water Services works" }, { requirement: "FR-AWD-004", source: "SK003 7.9.3(a)–(e) (SPAN's copy, for water services works only)" }, { provenance: "provenance" }),
];

const COPY = { requirement: "FR-AWD-004", source: "SK003 7.9.3(a)–(e)" };
const LOA = "LETTER_OF_ACCEPTANCE" as const;
export const COPY_RECIPIENTS = list("DistributionRecipient", "Letter of Acceptance copy", [
  { code: "implementing_department", values: { instrumentKind: LOA, nameEn: "Implementing Department" }, ...COPY },
  { code: "accounts_finance", values: { instrumentKind: LOA, nameEn: "Accounts & Finance Department" }, ...COPY },
  { code: "cidb", values: { instrumentKind: LOA, nameEn: "CIDB (LPIPM)" }, ...COPY },
  { code: "lhdn", values: { instrumentKind: LOA, nameEn: "LHDN" }, ...COPY },
  { code: "span", values: { instrumentKind: LOA, nameEn: "SPAN", onlyWhenRegulated: true }, ...COPY },
]);

// ------------------------------------------------------------------ the executed contract's controlled copies (FR-CON-012)

const CONTROLLED = { requirement: "FR-CON-012", source: "SK004 §7.7.1" };
export const CONTROLLED_COPIES = list("ControlledCopyRecipient", "Controlled copy", [
  { code: "contract_procurement", values: { nameEn: "Contract & Procurement", copyForm: "One original with drawings and one PDF" }, ...CONTROLLED },
  { code: "contractor", values: { nameEn: "The contractor", copyForm: "One copy with drawings" }, ...CONTROLLED },
  { code: "so_representative", values: { nameEn: "The S.O.'s Representative", copyForm: "One PDF" }, ...CONTROLLED },
  { code: "consulting_engineer", values: { nameEn: "The Consulting Engineer", copyForm: "One copy with drawings", onlyWithConsultingEngineer: true }, ...CONTROLLED },
]);

const CONTRACT_GROUPS = [group("ContractPolicy", "Contract · controlled copy stamp", { controlledCopyStampEn: "Controlled Copy" }, CONTROLLED, { provenance: "provenance" })];

// ------------------------------------------------------------------ supervision and payment (FR-SUP-010, FR-PAY-021, FR-CMP-017)

const POST_AWARD_GROUPS = [
  group("PostAwardPolicy", "Supervision · in delay", { inDelayProgressPct: "70" }, { requirement: "FR-SUP-010", source: "SK005 §7.4.2(d)" }, { provenance: "inDelayProvenance" }),
  group("PostAwardPolicy", "Payment · retention released at as-built", { firstReleasePct: "50" }, { requirement: "FR-PAY-021", source: "OM/P/007 §8.23–8.26; SK009 §7.7.4" }, { provenance: "firstReleaseProvenance" }),
  // FR-CMP-017: "5% (or as stated in the contract)"; loaded now, shown once close-out ships (plan §7 row 96b).
  group("PostAwardPolicy", "Close-out · design guarantee bond rate", { designBondPct: "5" }, { requirement: "FR-CMP-017", source: "SK009 §7.8" }, { provenance: "designBondPctProvenance" }),
  group("PostAwardPolicy", "Close-out · design guarantee bond years", { designBondYears: 5 }, { requirement: "FR-CMP-017", source: "SK009 §7.8" }, { provenance: "designBondYearsProvenance" }),
];

// ------------------------------------------------------------------ the finance system's numbers (FR-REQ-002, FR-AWD-006)

/// Consumed, never minted: the portal only checks a number against its shape. Each format is its own list, so it loads beside the organisation's
/// other code formats (a cost centre's).
const format = (key: string, label: string, pattern: string, example: string, requirement: string, source: string) =>
  list("CodeFormat", "Finance system number format", [{ code: key, label, values: { pattern, example }, requirement, source }], { key });
export const ERP_FORMATS = [
  format("erp_requisition_no", "Finance system requisition no. format", "PROC\\d{4}\\d{6}", "PROC2026154676", "FR-REQ-002", "PRETENDER-artifacts §5.1, §6.1 (PROC<YYYY><NNNNNN>)"),
  format("erp_note_no", "Requisition note no. format", "NM/\\d{4}/\\d{5}", "", "FR-REQ-002", "PRETENDER-artifacts §5.1, §6.1 (NM/YYYY/NNNNN)"),
  format("erp_indent_no", "Indent number format", "IN\\d{4}\\d{5}", "IN202600395", "FR-AWD-006", "DAL §3.1.4.3 items 14–15; IN202600395 covering memo (IN<YYYY><NNNNN>)"),
];

export const CONTRACTS = {
  lists: [COPY_RECIPIENTS, CONTROLLED_COPIES, ...ERP_FORMATS],
  groups: [...AWARD_GROUPS, ...CONTRACT_GROUPS, ...POST_AWARD_GROUPS],
};
