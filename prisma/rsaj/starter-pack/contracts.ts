/**
 * RSAJ starter pack, contracts (plan step 4.6): the award clocks, who receives a copy of the Letter of Acceptance, the controlled copies of the
 * executed contract and their stamp, the in-delay line, the retention released at as-built, the design guarantee bond and the finance system's
 * number formats. Transcribed from the specification; each entry cites its requirement and clause, and every one is STATED.
 *
 * Left out, though RSAJ answered them (docs/notes/rsaj-questions.md):
 * - the contract document parts (FR-CON-003): SK004 §7.3.1 gives the parts and their order for three bases (answer 19). SK004 was supplied on
 *   2026-10-27 (docs/requirements) and is not transcribed yet;
 * - the appointment-letter variants (FR-AWD-007): six, split by procurement route and value rather than by contract type (answer 20). The
 *   officer picks the letter (answer 28, 2026-10-27): IT & QA letters leave out the SPAN permit and insurance clauses; One Shot is a one-off
 *   quotation, as against a Schedule of Rates term contract; a letter over RM50,000 adds retention and a defects period (the DAL draft's terms
 *   bands). The six samples are in docs/requirements/rsaj-templates; no letter template is loaded.
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

/// SK003 §7.9.3: the Letter of Acceptance is issued from and returned to Contract & Procurement, so C&P is told of an award returned online
/// and of a contractor's question on one (RSAJ answer 33, 2026-10-27). One list per event, so each loads beside rules the organisation has.
const AWARD_RETURN = { requirement: "FR-AWD-009", source: "SK003 §7.9.3; RSAJ answer 33 (2026-10-27)" };
const notice = (eventKey: string, nameEn: string) => list("NotificationRule", "Notification rule", [{ code: eventKey, values: { eventKey, nameEn, recipientRoleCodes: ["CP"], reminderOffsetDays: [] }, ...AWARD_RETURN }], { eventKey });
export const AWARD_RETURN_NOTICES = [notice("award.return.lodged", "Award returned online"), notice("award.query.raised", "Question on an award")];

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
  // Ruling 14 (close-out Q1, 2026-10-27): both released at the certificate of making good defects; FR-FIN-012 reads the final payment as the
  // other event, which the product's switch offers. The first release stays at the as-built handover (above).
  group("PostAwardPolicy", "Close-out · retention balance released", { retentionBalanceReleaseAt: "MAKING_GOOD" }, { requirement: "FR-PAY-021", source: "OM/P/007 §8.26; SK009 §7.7.4. FR-FIN-012 reads the balance with the final payment instead." }, { provenance: "retentionBalanceReleaseProvenance" }),
  group("PostAwardPolicy", "Close-out · performance bond returned", { performanceBondReleaseAt: "MAKING_GOOD" }, { requirement: "FR-CMP-016", source: "SK009 §7.7.3–7.7.4. FR-FIN-012 reads the bond with the final payment instead." }, { provenance: "performanceBondReleaseProvenance" }),
];

// ------------------------------------------------------------------ the finance system's numbers (FR-REQ-002, FR-AWD-006)

/// Consumed, never minted: the portal only checks a number against its shape. Each format is its own list, so it loads beside the organisation's
/// other code formats (a cost centre's).
const format = (key: string, label: string, pattern: string, example: string, requirement: string, source: string) =>
  list("CodeFormat", "Finance system number format", [{ code: key, label, values: { pattern, example }, requirement, source }], { key });
export const ERP_FORMATS = [
  format("erp_requisition_no", "Finance system requisition no. format", "PROC\\d{4}\\d{6}", "PROC2026154676", "FR-REQ-002", "PRETENDER-artifacts §5.1, §6.1 (PROC<YYYY><NNNNNN>)"),
  format("erp_note_no", "Requisition note no. format", "NM/\\d{4}/\\d{5}", "NM/2025/00461", "FR-REQ-002", "PRETENDER-artifacts §5.1, §6.1 (NM/YYYY/NNNNN); RSAJ answer 26 (the Expenditure Request Form)"),
  format("erp_indent_no", "Indent number format", "IN\\d{4}\\d{5}", "IN202600395", "FR-AWD-006", "DAL §3.1.4.3 items 14–15; IN202600395 covering memo (IN<YYYY><NNNNN>)"),
];

export const CONTRACTS = {
  lists: [COPY_RECIPIENTS, ...AWARD_RETURN_NOTICES, CONTROLLED_COPIES, ...ERP_FORMATS],
  groups: [...AWARD_GROUPS, ...CONTRACT_GROUPS, ...POST_AWARD_GROUPS],
};
