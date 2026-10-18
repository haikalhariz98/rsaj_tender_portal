/**
 * The register at a bid opening (FR-BID-008 on paper, OD-6 A; plan 6.15 §4.3), for 6.7. When an
 * envelope is opened for a bidder linked to the register, its eligibility for the exercise is judged on
 * the locked supplier row (taken last, after the exercise side) and frozen on the offer
 * (`OpenedBid.eligibilityFinding`); a bidder not linked has none. What follows from a NOT_ELIGIBLE
 * finding is the register's `ineligibleBidConsequence`, read live until the opening is finalised and
 * frozen on the opening then; unset blocks finalising only where such a finding exists. Pure: the
 * judging itself, on the locked row, is `eligibilityAtOpening` (standing-repo.ts).
 */

import { isEligibilitySnapshot, type EligibilitySnapshot } from "./eligibility";
import { STANDING_LABEL } from "./labels";
import type { Standing } from "./standing";

export type Consequence = "ELIMINATE" | "REPORT";

/// The finding frozen on an offer, read back defensively. Null: none (not linked when opened).
export const eligibilityFindingOf = (raw: unknown): EligibilitySnapshot | null => (isEligibilitySnapshot(raw) ? raw : null);

/**
 * The class (Kelas) the register held for a bidder when its offer was read (SR-15, ruling 24): the grade the frozen eligibility reading found held, for the work the exercise needs
 * (`GRADE` rows' held label). Null: the bidder was not linked to the register, or the exercise asked for no grade, so the register gave none and nothing is invented.
 */
export function registerClassOf(raw: unknown): string | null {
  const f = eligibilityFindingOf(raw);
  const held = [...new Set((f?.rows ?? []).filter((r) => r.kind === "GRADE").map((r) => r.data?.held?.trim() ?? "").filter(Boolean))];
  return held.length ? held.join(", ") : null;
}

/// The supplier register's standing for a bidder, as the frozen eligibility reading held it when the offer was read (AC-44), as a label. Null: not linked to the register, or a
/// standing with no label. Never the live register.
export function registerStandingOf(raw: unknown): string | null {
  const s = eligibilityFindingOf(raw)?.standing;
  return s ? (STANDING_LABEL[s as Standing]?.en ?? null) : null;
}

/// Whether an offer's frozen finding is NOT_ELIGIBLE. Not assessed is not a failure.
export const ineligibleOf = (raw: unknown) => eligibilityFindingOf(raw)?.verdict === "NOT_ELIGIBLE";

/// The consequence frozen on an opening at finalising, where it was; undefined where not frozen.
export function frozenConsequence(policySnapshot: unknown): Consequence | null | undefined {
  if (!policySnapshot || typeof policySnapshot !== "object" || !("ineligible" in policySnapshot)) return undefined;
  const v = (policySnapshot as { ineligible?: { consequence?: unknown } }).ineligible?.consequence;
  return v === "ELIMINATE" || v === "REPORT" ? v : null;
}

/// The consequence an opening judges by: frozen at its finalising, else the register's policy now.
export const consequenceFor = (policySnapshot: unknown, live: Consequence | null) => {
  const f = frozenConsequence(policySnapshot);
  return f === undefined ? live : f;
};
