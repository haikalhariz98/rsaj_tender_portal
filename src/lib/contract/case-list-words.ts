/**
 * The case list's words and the chips on a case's row (Award and Contract Requirements v2, C-1; AC-17). Pure.
 *
 * Stage and ended labels are here so that no code reaches a screen (AGENTS.md rule 5). The chips are the Awards list's, carried over
 * unchanged in wording and order; the page works out the facts (the return read from the scans, the securities counted) and this
 * says what they read as.
 */

import type { AwardStatus } from "@/lib/award/types";

import type { CaseEnded, CaseStage, CaseStanding } from "./case-stage";
import { w, type Tone, type Words } from "./labels";

export const CASE_STAGE_WORDS: Readonly<Record<CaseStage, Words>> = {
  AWARDING: w("Awarding", "Pemberian"),
  SIGNING: w("Signing", "Menandatangani"),
  ON_SITE: w("On site", "Di tapak"),
  COMPLETED: w("Completed", "Selesai"),
  CLOSED: w("Closed", "Ditutup"),
};

export const CASE_ENDED_WORDS: Readonly<Record<CaseEnded, Words>> = {
  CANCELLED_BEFORE_ISSUE: w("Cancelled before issue", "Dibatalkan sebelum dikeluarkan"),
  CONTRACT_CANCELLED: w("Cancelled — number kept as a gap", "Dibatalkan — nombor dikekalkan sebagai jurang"),
  TERMINATED: w("Terminated", "Ditamatkan"),
};

export const CASE_ENDED_TONE: Readonly<Record<CaseEnded, Tone>> = { CANCELLED_BEFORE_ISSUE: "neutral", CONTRACT_CANCELLED: "neutral", TERMINATED: "err" };

/// The Stage column's words for a standing: the stage, or "Cancelled or terminated" for all three ended kinds (AC-17's sixth view).
export const ENDED_VIEW_WORDS: Words = w("Cancelled or terminated", "Dibatalkan atau ditamatkan");
export const standingWords = (s: CaseStanding): Words => (s.kind === "LIVE" ? CASE_STAGE_WORDS[s.stage] : ENDED_VIEW_WORDS);

/// The views the list offers over its rows, in order, with their words (the wave G views are their own readers, F0-8).
export const CASE_VIEW_WORDS = {
  awarding: CASE_STAGE_WORDS.AWARDING,
  signing: CASE_STAGE_WORDS.SIGNING,
  on_site: CASE_STAGE_WORDS.ON_SITE,
  completed: CASE_STAGE_WORDS.COMPLETED,
  closed: CASE_STAGE_WORDS.CLOSED,
  ended: ENDED_VIEW_WORDS,
} as const;

export interface AwardChipFacts {
  status: AwardStatus;
  /** The signed letter and its papers are back (returnReadsComplete). */
  returned: boolean;
  /** Securities and policies still LODGED, awaiting verification. */
  toVerify: number;
  /** Securities and policies lodged or verified, of any state. */
  registered: number;
  hasCommitmentNo: boolean;
  indentExpired: boolean;
}

export interface Chip {
  text: string;
  tone: "ok" | "warn" | "err" | "brand";
}

/// The Awards list's "checks" chips, in its order and words.
export function awardChips(f: AwardChipFacts): Chip[] {
  const issued = f.status === "ISSUED" || f.status === "ACCEPTED";
  return [
    ...(issued ? [{ text: f.returned ? "Returned" : "Awaiting return", tone: f.returned ? ("ok" as const) : ("warn" as const) }] : []),
    ...(issued ? [{ text: f.toVerify ? `${f.toVerify} to verify` : f.registered ? "Securities verified" : "No securities lodged", tone: f.toVerify || !f.registered ? ("warn" as const) : ("ok" as const) }] : []),
    ...(issued && !f.hasCommitmentNo ? [{ text: "No commitment number", tone: "warn" as const }] : []),
    ...(f.indentExpired ? [{ text: "Indent expired", tone: "err" as const }] : []),
    ...(!issued && f.status !== "CANCELLED" ? [{ text: f.status === "APPROVED" ? "To issue" : f.status === "PENDING_APPROVAL" ? "With the approvers" : "Being prepared", tone: "brand" as const }] : []),
  ];
}
