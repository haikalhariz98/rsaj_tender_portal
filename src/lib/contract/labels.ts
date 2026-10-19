/**
 * The contract's words after award, in English and Malay (AGENTS.md rule 5: codes never reach a
 * screen; the bilingual rule: every string here has both). Screens render `.en` today; the Malay line
 * is kept beside it so the bilingual pass needs no rewording.
 */

import type { ContractPhase } from "./status";
import type { BaselineReason, BaselineSource, ContractStatus, CustodyDirection, CustodyItemKind, FormationCheckKind, LegalDecision, Provenance, ReconciliationComparison, ReconciliationOutcome, SignatureParty } from "./types";

export interface Words {
  en: string;
}

export const w = (en: string): Words => ({ en });

export type Tone = "neutral" | "brand" | "info" | "ok" | "warn" | "err";

/// Every stored state (X-8: exhaustive).
export const CONTRACT_STATUS_WORDS: Readonly<Record<ContractStatus, Words>> = {
  NUMBER_ALLOCATED: w("Number allocated"),
  CANCELLED: w("Cancelled — number kept as a gap"),
  IN_PREPARATION: w("In preparation"),
  PENDING_LEGAL_ENDORSEMENT: w("With the legal office"),
  RETURNED_FOR_AMENDMENT: w("Returned for amendment"),
  LEGALLY_ENDORSED: w("Legally endorsed"),
  EXECUTED: w("Executed"),
  STAMPED: w("Stamped, fully executed"),
  ACTIVE: w("Active"),
  // 6.13 Part B run 1a (ADR 0031): the five stored states after Active.
  PRACTICALLY_COMPLETE: w("Practically complete"),
  MAKING_GOOD_COMPLETE: w("Making good of defects complete"),
  FINAL_CERTIFICATE_ISSUED: w("Final certificate issued"),
  TERMINATED: w("Terminated"),
  CLOSED: w("Closed"),
};

/// Every phase, stored or derived (X-8: exhaustive).
export const PHASE_WORDS: Readonly<Record<ContractPhase, Words>> = {
  ...CONTRACT_STATUS_WORDS,
  AWAITING_CONDITIONS: w("Awaiting conditions precedent"),
  READY_TO_SIGN: w("Ready to sign"),
};

export const PHASE_TONE: Readonly<Record<ContractPhase, Tone>> = {
  NUMBER_ALLOCATED: "neutral",
  CANCELLED: "neutral",
  IN_PREPARATION: "brand",
  PENDING_LEGAL_ENDORSEMENT: "info",
  RETURNED_FOR_AMENDMENT: "warn",
  LEGALLY_ENDORSED: "info",
  AWAITING_CONDITIONS: "warn",
  READY_TO_SIGN: "ok",
  EXECUTED: "ok",
  STAMPED: "ok",
  ACTIVE: "ok",
  PRACTICALLY_COMPLETE: "ok",
  MAKING_GOOD_COMPLETE: "ok",
  FINAL_CERTIFICATE_ISSUED: "ok",
  TERMINATED: "err",
  CLOSED: "neutral",
};

// ------------------------------------------------------------------ formation's own words


export const CHECK_WORDS: Readonly<Record<FormationCheckKind, Words>> = {
  ARITHMETIC: w("Arithmetical errors corrected"),
  FRONT_LOADING: w("Rates tested for front loading"),
  RATE_UNIFORMITY: w("Rates adjusted for uniformity"),
  SOR_ADJUSTMENT: w("Schedule of Rates adjustment checked"),
};

export const COMPARISON_WORDS: Readonly<Record<ReconciliationComparison, Words>> = {
  TENDER_DOCUMENT: w("Against the Tender Document"),
  TENDER_TABLE_DOCUMENT: w("Against the Tender Table Document"),
  DRAWINGS: w("Drawings identical"),
};

export const OUTCOME_WORDS: Readonly<Record<ReconciliationOutcome, Words>> = {
  MATCHES: w("Identical"),
  AMENDED: w("Amended, every amendment signed by both sides"),
};

export const DECISION_WORDS: Readonly<Record<LegalDecision, Words>> = {
  ENDORSED: w("Endorsed"),
  RETURNED: w("Returned for amendment"),
};

export const PARTY_WORDS: Readonly<Record<SignatureParty, Words>> = {
  RSAJ: w("For the employer"),
  CONTRACTOR: w("For the contractor"),
  WITNESS: w("Witness to the contractor's signature"),
};

export const SOURCE_WORDS: Readonly<Record<BaselineSource, Words>> = {
  AWARD: w("From the Letter of Acceptance"),
  APPENDIX: w("From the tender Appendix"),
  BQ: w("From the bill of quantities"),
  DERIVED: w("Derived under a recorded rule"),
  ENTERED: w("Entered at baseline, not from a tender Appendix"),
};

export const REASON_WORDS: Readonly<Record<BaselineReason, Words>> = {
  CONFIRMED: w("Confirmed before the first valuation"),
  EXECUTED: w("At execution: the Contract Date added"),
  POSSESSION: w("At possession of site"),
  CORRECTION: w("Corrected"),
  EXTENSION_OF_TIME: w("By an extension of time"),
  PERIOD_EXTENSION: w("By an extension of the contract period"),
};

export const CUSTODY_KIND_WORDS: Readonly<Record<CustodyItemKind, Words>> = {
  CONTRACT: w("The signed Contract Document"),
  SECURITY: w("Performance bond"),
  POLICY: w("Insurance policy"),
};

export const DIRECTION_WORDS: Readonly<Record<CustodyDirection, Words>> = {
  OUT: w("Checked out"),
  IN: w("Checked in"),
};

export const PROVENANCE_WORDS: Readonly<Record<Provenance, Words>> = {
  STATED: w("Stated"),
  OBSERVED: w("Observed"),
  ASSUMED: w("Assumed"),
};

export const GATE_WORDS: Readonly<Record<string, Words>> = {
  RETURNED: w("the instrument returned signed"),
  BOND: w("the performance bond lodged and verified"),
  INSURANCE: w("every required insurance policy lodged and verified"),
};

/// The baseline's fields, by key, as the screen and every refusal name them.
export const BASELINE_FIELD_WORDS: Readonly<Record<string, Words>> = {
  contractSum: w("Contract sum"),
  completion: w("Period for completion"),
  dlp: w("Defects liability period"),
  lad: w("Liquidated damages"),
  retention: w("Retention and its cap"),
  sums: w("Prime cost and provisional sums"),
  buildersWorksValue: w("Builder's works value"),
  firstInterim: w("First interim certificate minimum"),
  subsequentInterim: w("Subsequent interim certificate minimum"),
  honourDays: w("Days to honour a certificate"),
  sectional: w("Sectional completion"),
  unfixedMaterials: w("Unfixed materials allowance"),
  onCost: w("On-cost percentage"),
  designWork: w("Design work value"),
  contractDate: w("Contract Date"),
  possession: w("Date of possession of site"),
  dateForCompletion: w("Date for completion"),
};
