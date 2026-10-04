/**
 * The contract's words after award, in English and Malay (AGENTS.md rule 5: codes never reach a
 * screen; the bilingual rule: every string here has both). Screens render `.en` today; the Malay line
 * is kept beside it so the bilingual pass needs no rewording.
 */

import type { ContractPhase } from "./status";
import type { BaselineReason, BaselineSource, ContractStatus, CustodyDirection, CustodyItemKind, FormationCheckKind, LegalDecision, Provenance, ReconciliationComparison, ReconciliationOutcome, SignatureParty } from "./types";

export interface Words {
  en: string;
  ms: string;
}

export const w = (en: string, ms: string): Words => ({ en, ms });

export type Tone = "neutral" | "brand" | "info" | "ok" | "warn" | "err";

/// Every stored state (X-8: exhaustive).
export const CONTRACT_STATUS_WORDS: Readonly<Record<ContractStatus, Words>> = {
  NUMBER_ALLOCATED: w("Number allocated", "Nombor diperuntukkan"),
  CANCELLED: w("Cancelled — number kept as a gap", "Dibatalkan — nombor dikekalkan sebagai jurang"),
  IN_PREPARATION: w("In preparation", "Dalam penyediaan"),
  PENDING_LEGAL_ENDORSEMENT: w("With the legal office", "Di pejabat undang-undang"),
  RETURNED_FOR_AMENDMENT: w("Returned for amendment", "Dikembalikan untuk pindaan"),
  LEGALLY_ENDORSED: w("Legally endorsed", "Disahkan dari segi undang-undang"),
  EXECUTED: w("Executed", "Dilaksanakan"),
  STAMPED: w("Stamped, fully executed", "Dicop, dilaksanakan sepenuhnya"),
  ACTIVE: w("Active", "Aktif"),
  // 6.13 Part B run 1a (ADR 0031): the five stored states after Active.
  PRACTICALLY_COMPLETE: w("Practically complete", "Siap kerja"),
  MAKING_GOOD_COMPLETE: w("Making good of defects complete", "Siap membaiki kecacatan"),
  FINAL_CERTIFICATE_ISSUED: w("Final certificate issued", "Perakuan muktamad dikeluarkan"),
  TERMINATED: w("Terminated", "Ditamatkan"),
  CLOSED: w("Closed", "Ditutup"),
};

/// Every phase, stored or derived (X-8: exhaustive).
export const PHASE_WORDS: Readonly<Record<ContractPhase, Words>> = {
  ...CONTRACT_STATUS_WORDS,
  AWAITING_CONDITIONS: w("Awaiting conditions precedent", "Menunggu syarat duluan"),
  READY_TO_SIGN: w("Ready to sign", "Sedia untuk ditandatangani"),
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
  ARITHMETIC: w("Arithmetical errors corrected", "Kesilapan aritmetik diperbetulkan"),
  FRONT_LOADING: w("Rates tested for front loading", "Kadar diuji bagi berat hadapan"),
  RATE_UNIFORMITY: w("Rates adjusted for uniformity", "Kadar diselaraskan untuk keseragaman"),
  SOR_ADJUSTMENT: w("Schedule of Rates adjustment checked", "Pelarasan Jadual Kadar disemak"),
};

export const COMPARISON_WORDS: Readonly<Record<ReconciliationComparison, Words>> = {
  TENDER_DOCUMENT: w("Against the Tender Document", "Berbanding Dokumen Tender"),
  TENDER_TABLE_DOCUMENT: w("Against the Tender Table Document", "Berbanding Dokumen Meja Tender"),
  DRAWINGS: w("Drawings identical", "Lukisan adalah sama"),
};

export const OUTCOME_WORDS: Readonly<Record<ReconciliationOutcome, Words>> = {
  MATCHES: w("Identical", "Sama"),
  AMENDED: w("Amended, every amendment signed by both sides", "Dipinda, setiap pindaan ditandatangani kedua-dua pihak"),
};

export const DECISION_WORDS: Readonly<Record<LegalDecision, Words>> = {
  ENDORSED: w("Endorsed", "Disahkan"),
  RETURNED: w("Returned for amendment", "Dikembalikan untuk pindaan"),
};

export const PARTY_WORDS: Readonly<Record<SignatureParty, Words>> = {
  RSAJ: w("For the employer", "Bagi pihak majikan"),
  CONTRACTOR: w("For the contractor", "Bagi pihak kontraktor"),
  WITNESS: w("Witness to the contractor's signature", "Saksi tandatangan kontraktor"),
};

export const SOURCE_WORDS: Readonly<Record<BaselineSource, Words>> = {
  AWARD: w("From the Letter of Acceptance", "Daripada Surat Setuju Terima"),
  APPENDIX: w("From the tender Appendix", "Daripada Lampiran tender"),
  BQ: w("From the bill of quantities", "Daripada senarai kuantiti"),
  DERIVED: w("Derived under a recorded rule", "Diterbitkan di bawah peraturan yang direkodkan"),
  ENTERED: w("Entered at baseline, not from a tender Appendix", "Dimasukkan semasa garis dasar, bukan daripada Lampiran tender"),
};

export const REASON_WORDS: Readonly<Record<BaselineReason, Words>> = {
  CONFIRMED: w("Confirmed before the first valuation", "Disahkan sebelum penilaian pertama"),
  EXECUTED: w("At execution: the Contract Date added", "Semasa pelaksanaan: Tarikh Kontrak ditambah"),
  POSSESSION: w("At possession of site", "Semasa milik tapak"),
  CORRECTION: w("Corrected", "Diperbetulkan"),
  EXTENSION_OF_TIME: w("By an extension of time", "Melalui lanjutan masa"),
  PERIOD_EXTENSION: w("By an extension of the contract period", "Melalui lanjutan tempoh kontrak"),
};

export const CUSTODY_KIND_WORDS: Readonly<Record<CustodyItemKind, Words>> = {
  CONTRACT: w("The signed Contract Document", "Dokumen Kontrak yang ditandatangani"),
  SECURITY: w("Performance bond", "Bon pelaksanaan"),
  POLICY: w("Insurance policy", "Polisi insurans"),
};

export const DIRECTION_WORDS: Readonly<Record<CustodyDirection, Words>> = {
  OUT: w("Checked out", "Dikeluarkan"),
  IN: w("Checked in", "Dikembalikan"),
};

export const PROVENANCE_WORDS: Readonly<Record<Provenance, Words>> = {
  STATED: w("Stated", "Dinyatakan"),
  OBSERVED: w("Observed", "Diperhatikan"),
  ASSUMED: w("Assumed", "Diandaikan"),
};

export const GATE_WORDS: Readonly<Record<string, Words>> = {
  RETURNED: w("the instrument returned signed", "surat tawaran dikembalikan bertandatangan"),
  BOND: w("the performance bond lodged and verified", "bon pelaksanaan diserahkan dan disahkan"),
  INSURANCE: w("every required insurance policy lodged and verified", "setiap polisi insurans yang diperlukan diserahkan dan disahkan"),
};

/// The baseline's fields, by key, as the screen and every refusal name them.
export const BASELINE_FIELD_WORDS: Readonly<Record<string, Words>> = {
  contractSum: w("Contract sum", "Jumlah kontrak"),
  completion: w("Period for completion", "Tempoh siap"),
  dlp: w("Defects liability period", "Tempoh tanggungan kecacatan"),
  lad: w("Liquidated damages", "Ganti rugi tertentu"),
  retention: w("Retention and its cap", "Wang tahanan dan hadnya"),
  sums: w("Prime cost and provisional sums", "Wang kos prima dan wang peruntukan sementara"),
  buildersWorksValue: w("Builder's works value", "Nilai kerja pembina"),
  firstInterim: w("First interim certificate minimum", "Minimum perakuan interim pertama"),
  subsequentInterim: w("Subsequent interim certificate minimum", "Minimum perakuan interim berikutnya"),
  honourDays: w("Days to honour a certificate", "Hari untuk membayar perakuan"),
  sectional: w("Sectional completion", "Penyiapan berperingkat"),
  unfixedMaterials: w("Unfixed materials allowance", "Elaun bahan belum dipasang"),
  onCost: w("On-cost percentage", "Peratus kos tambahan"),
  designWork: w("Design work value", "Nilai kerja reka bentuk"),
  contractDate: w("Contract Date", "Tarikh Kontrak"),
  possession: w("Date of possession of site", "Tarikh milik tapak"),
  dateForCompletion: w("Date for completion", "Tarikh siap"),
};
