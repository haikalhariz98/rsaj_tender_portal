/**
 * The contract's vocabulary after award (spec §6.12, §7.3.3), as pure types.
 *
 * Mirrors the Prisma enums so `src/lib/contract/**` stays free of the client, as the other lib
 * modules do. Every rule about forming a contract lives beside this file; actions and screens call
 * it and never restate it. `status-schema.test.ts` keeps these lists equal to the schema's.
 */

export type { Finding, Level } from "@/lib/method/types";
export type { Provenance } from "@/lib/award/types";

/// Stored states (§7.3.3 up to Active). AWAITING_CONDITIONS and READY_TO_SIGN are derived (`phaseOf`).
export type ContractStatus =
  | "NUMBER_ALLOCATED"
  | "CANCELLED"
  | "IN_PREPARATION"
  | "PENDING_LEGAL_ENDORSEMENT"
  | "RETURNED_FOR_AMENDMENT"
  | "LEGALLY_ENDORSED"
  | "EXECUTED"
  | "STAMPED"
  | "ACTIVE";

export const CONTRACT_STATUSES: readonly ContractStatus[] = [
  "NUMBER_ALLOCATED",
  "CANCELLED",
  "IN_PREPARATION",
  "PENDING_LEGAL_ENDORSEMENT",
  "RETURNED_FOR_AMENDMENT",
  "LEGALLY_ENDORSED",
  "EXECUTED",
  "STAMPED",
  "ACTIVE",
];

export type BaselineSource = "APPENDIX" | "AWARD" | "BQ" | "DERIVED" | "ENTERED";
export const BASELINE_SOURCES: readonly BaselineSource[] = ["APPENDIX", "AWARD", "BQ", "DERIVED", "ENTERED"];
export type BaselineReason = "CONFIRMED" | "EXECUTED" | "POSSESSION" | "CORRECTION";
export const BASELINE_REASONS: readonly BaselineReason[] = ["CONFIRMED", "EXECUTED", "POSSESSION", "CORRECTION"];
export type AssemblyPartState = "READY" | "CANCELLED_BY_ALTERNATIVE";
export type ReconciliationComparison = "TENDER_DOCUMENT" | "TENDER_TABLE_DOCUMENT" | "DRAWINGS";
export const RECONCILIATION_COMPARISONS: readonly ReconciliationComparison[] = ["TENDER_DOCUMENT", "TENDER_TABLE_DOCUMENT", "DRAWINGS"];
export type ReconciliationOutcome = "MATCHES" | "AMENDED";
export type FormationCheckKind = "ARITHMETIC" | "FRONT_LOADING" | "RATE_UNIFORMITY" | "SOR_ADJUSTMENT";
export const FORMATION_CHECK_KINDS: readonly FormationCheckKind[] = ["ARITHMETIC", "FRONT_LOADING", "RATE_UNIFORMITY", "SOR_ADJUSTMENT"];
export type LegalDecision = "ENDORSED" | "RETURNED";
export type SignatureParty = "RSAJ" | "CONTRACTOR" | "WITNESS";
export type CustodyItemKind = "CONTRACT" | "SECURITY" | "POLICY";
export type CustodyDirection = "OUT" | "IN";
export type LadKind = "AMOUNT_PER_DAY" | "PERCENT_OF_SUM_PER_DAY";
export type PeriodUnit = "DAYS" | "WEEKS" | "MONTHS";

/// The matter the contract agreement's signatory rows route on: 6.11's `award_signatory`, with the
/// customer's condition for the contract agreement (OD-4 A, `ContractPolicy.signatoryCond`).
export { SIGNATORY_DOMAIN } from "@/lib/award/types";

/// ContractPolicy, every field nullable: unset is not a default.
export interface ContractPolicyFacts {
  legalOfficeCode: string | null;
  frontLoadingRatio: string | null;
  controlledCopyStampEn: string | null;
  controlledCopyStampMs: string | null;
  signatoryCond: string | null;
  provenance: "STATED" | "OBSERVED" | "ASSUMED" | null;
}

export const UNSET_CONTRACT_POLICY: ContractPolicyFacts = {
  legalOfficeCode: null,
  frontLoadingRatio: null,
  controlledCopyStampEn: null,
  controlledCopyStampMs: null,
  signatoryCond: null,
  provenance: null,
};
