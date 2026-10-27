/**
 * The award's vocabulary, as pure types (spec §6.11, §6.12 at award).
 *
 * Mirrors the Prisma enums so `src/lib/award/**` stays free of the client, as the other
 * lib modules do. Every rule about an award lives beside this file; actions and screens
 * call it and never restate it.
 */

export type { Finding, Level } from "@/lib/method/types";

export type AwardStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "ISSUED" | "ACCEPTED" | "CANCELLED";
export type InstrumentKind = "LETTER_OF_ACCEPTANCE" | "WORK_INDENT";
export type DocumentKind = "LETTER_OF_ACCEPTANCE" | "SUCCESSFUL_BIDDER_DECLARATION" | "APPOINTMENT_LETTER" | "INDENT_COVERING_MEMO";
export type DocumentLanguage = "MS" | "EN";
export type PeriodUnit = "DAYS" | "WEEKS" | "MONTHS";
export type DeliveryMethod = "REGISTERED_POST" | "COLLECTION" | "BY_HAND";
export type NonCommencement = "CANCEL_AND_BLACKLIST" | "WARNING_LETTER";
/// QUOTATION_NUMBER (Phase 0.3 item 15, RSAJ Q22(d)): the quotation's own number, its exercise's reference.
export type QuotationContractKey = "INDENT_NUMBER" | "CONTRACT_SERIES" | "QUOTATION_NUMBER";
export type Provenance = "STATED" | "OBSERVED" | "ASSUMED";

export const AWARD_STATUSES: readonly AwardStatus[] = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ISSUED", "ACCEPTED", "CANCELLED"];
/// The matter the signatory rows route on: vocabulary, not policy (FR-AWD-002).
export const SIGNATORY_DOMAIN = "award_signatory";

/// The documents each instrument issues (FR-AWD-003, 006, 007). The Inden Kerja itself is
/// the finance system's document: the portal records its number and issues the memo and
/// the appointment letter.
export const DOCUMENTS_FOR: Record<InstrumentKind, readonly DocumentKind[]> = {
  LETTER_OF_ACCEPTANCE: ["LETTER_OF_ACCEPTANCE", "SUCCESSFUL_BIDDER_DECLARATION"],
  WORK_INDENT: ["INDENT_COVERING_MEMO", "APPOINTMENT_LETTER"],
};

/// AwardPolicy, every field nullable: unset is not a default.
export interface AwardPolicy {
  tenderInstrument: InstrumentKind | null;
  quotationInstrument: InstrumentKind | null;
  indentValidityDays: number | null;
  commencementGraceDays: number | null;
  acceptanceReturnDays: number | null;
  preContractUnitCode: string | null;
  postContractUnitCode: string | null;
  quotationContractKey: QuotationContractKey | null;
  regulatedActivityLabel: string | null;
  loaTemplateId: string | null;
  declarationTemplateId: string | null;
  coveringMemoTemplateId: string | null;
  provenance: Provenance | null;
}

export const UNSET_AWARD_POLICY: AwardPolicy = {
  tenderInstrument: null,
  quotationInstrument: null,
  indentValidityDays: null,
  commencementGraceDays: null,
  acceptanceReturnDays: null,
  preContractUnitCode: null,
  postContractUnitCode: null,
  quotationContractKey: null,
  regulatedActivityLabel: null,
  loaTemplateId: null,
  declarationTemplateId: null,
  coveringMemoTemplateId: null,
  provenance: null,
};
