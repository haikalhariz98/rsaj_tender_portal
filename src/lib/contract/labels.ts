/**
 * The contract's words after award, in English and Malay (AGENTS.md rule 5: codes never reach a
 * screen; the bilingual rule: every string here has both). Screens render `.en` today; the Malay line
 * is kept beside it so the bilingual pass needs no rewording.
 */

import type { ContractPhase } from "./status";
import type { ContractStatus } from "./types";

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
};
