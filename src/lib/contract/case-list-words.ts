/**
 * The case list's words and the chips on a case's row (Award and Contract Requirements v2, C-1; AC-17). Pure.
 *
 * Stage and ended labels are here so that no code reaches a screen (AGENTS.md rule 5). The chips are the Awards list's, carried over
 * unchanged in wording and order; the page works out the facts (the return read from the scans, the securities counted) and this
 * says what they read as.
 */

import type { AwardStatus } from "@/lib/award/types";
import type { Language } from "@/lib/i18n/language";
import { say, sayWith } from "@/lib/i18n/say";

import type { CaseEnded, CaseStage, CaseStanding } from "./case-stage";
import { CASE_CHIP_WORDS as C } from "./case-page-words";
import { w, type Tone, type Words } from "./labels";

export const CASE_STAGE_WORDS: Readonly<Record<CaseStage, Words>> = {
  AWARDING: w("Awarding"),
  SIGNING: w("Signing"),
  ON_SITE: w("On site"),
  COMPLETED: w("Completed"),
  CLOSED: w("Closed"),
};

export const CASE_ENDED_WORDS: Readonly<Record<CaseEnded, Words>> = {
  CANCELLED_BEFORE_ISSUE: w("Cancelled before issue"),
  CONTRACT_CANCELLED: w("Cancelled — number kept as a gap"),
  TERMINATED: w("Terminated"),
};

export const CASE_ENDED_TONE: Readonly<Record<CaseEnded, Tone>> = { CANCELLED_BEFORE_ISSUE: "neutral", CONTRACT_CANCELLED: "neutral", TERMINATED: "err" };

/// The Stage column's words for a standing: the stage, or "Cancelled or terminated" for all three ended kinds (AC-17's sixth view).
export const ENDED_VIEW_WORDS: Words = w("Cancelled or terminated");
export const standingWords = (s: CaseStanding): Words => (s.kind === "LIVE" ? CASE_STAGE_WORDS[s.stage] : ENDED_VIEW_WORDS);

/// The views the list offers over its rows, in order, with their words (the wave G views are their own readers, F0-8).
export const CASE_VIEW_WORDS = {
  awarding: CASE_STAGE_WORDS.AWARDING,
  signing: CASE_STAGE_WORDS.SIGNING,
  on_site: CASE_STAGE_WORDS.ON_SITE,
  completed: CASE_STAGE_WORDS.COMPLETED,
  closed: CASE_STAGE_WORDS.CLOSED,
  ended: ENDED_VIEW_WORDS,
  // The old Awards list's organisation-wide work views (FR-AWD-006 for the indents).
  pending: w("Awaiting approval"),
  approved: w("Approved, not issued"),
  return: w("Awaiting return"),
  commitment: w("No commitment number"),
  expired: w("Indents expired"),
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
export function awardChips(f: AwardChipFacts, lang: Language = "en"): Chip[] {
  const t = (words: Words) => say(words, lang);
  const issued = f.status === "ISSUED" || f.status === "ACCEPTED";
  return [
    ...(issued ? [{ text: t(f.returned ? C.returned : C.awaitingReturn), tone: f.returned ? ("ok" as const) : ("warn" as const) }] : []),
    ...(issued ? [{ text: f.toVerify ? sayWith(C.toVerify, lang, { count: String(f.toVerify) }) : t(f.registered ? C.securitiesVerified : C.noSecuritiesLodged), tone: f.toVerify || !f.registered ? ("warn" as const) : ("ok" as const) }] : []),
    ...(issued && !f.hasCommitmentNo ? [{ text: t(C.noCommitmentNumber), tone: "warn" as const }] : []),
    ...(f.indentExpired ? [{ text: t(C.indentExpired), tone: "err" as const }] : []),
    ...(!issued && f.status !== "CANCELLED" ? [{ text: t(f.status === "APPROVED" ? C.toIssue : f.status === "PENDING_APPROVAL" ? C.withTheApprovers : C.beingPrepared), tone: "brand" as const }] : []),
  ];
}
