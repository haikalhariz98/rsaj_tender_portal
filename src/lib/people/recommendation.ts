/**
 * The absent holder's recommendation on a delegation (FR-APR-012, OD-6), and what a
 * delegation recorded before attachments existed may still stand on.
 *
 * Ruled 2026-10-01 ("delegation legacy test fixed now"): whether a delegation was
 * recorded on text alone before the document store landed is a stored fact,
 * `Delegation.recommendationTextOnlyAtLanding`, set once by the migration's backfill and
 * never by the application. Nothing here guesses it from the text.
 *
 * - A delegation whose signed recommendation was attached and is no longer (detached, or
 *   its version withdrawn) reads "signed recommendation no longer attached", and stands
 *   on nothing but an attachment again.
 * - A legacy delegation stands on its text until an edit moves its end date later, opens
 *   its end, changes the delegate or widens what is delegated. That edit is a new grant
 *   in substance, and the signed recommendation is then required (OD-6).
 */

/// What is known of a delegation's recommendation, as stored.
export interface RecommendationFacts {
  holderRecommendation?: string | null;
  /// The migration's mark: text and no recommendation attachment when the store landed.
  recommendationTextOnlyAtLanding?: boolean;
  /// Live recommendation attachments: not detached, version not withdrawn.
  liveAttachments: number;
  /// Recommendation attachments ever made, live or not.
  everAttachments: number;
}

export type RecommendationStanding =
  /// The signed recommendation is attached and stands.
  | "ATTACHED"
  /// One was attached, and none stands now.
  | "NO_LONGER_ATTACHED"
  /// Recorded as text before attachments existed, nothing attached since.
  | "TEXT_BEFORE_ATTACHMENTS"
  /// Text recorded, no signed recommendation ever attached, and not from before the store.
  | "TEXT_ONLY"
  | "NONE";

const hasText = (s: string | null | undefined) => (s ?? "").trim().length > 0;

export function recommendationStanding(f: RecommendationFacts): RecommendationStanding {
  if (f.liveAttachments > 0) return "ATTACHED";
  if (f.everAttachments > 0) return "NO_LONGER_ATTACHED";
  if (f.recommendationTextOnlyAtLanding) return "TEXT_BEFORE_ATTACHMENTS";
  if (hasText(f.holderRecommendation)) return "TEXT_ONLY";
  return "NONE";
}

/// The terms of a delegation an edit can change in a way that ends legacy standing.
export interface DelegationTerms {
  toPersonId: string;
  effectiveTo: Date | null;
  /// Empty is the whole office: wider than any listed subset.
  capabilityCodes: readonly string[];
}

export type LegacyEnd = "END_MOVED_LATER" | "END_OPENED" | "DELEGATE_CHANGED" | "CAPABILITIES_WIDENED";

/**
 * Which of the ruled changes an edit makes. Moving the end earlier, closing an open end,
 * removing capabilities or narrowing the whole office to a list are not among them.
 */
export function legacyEndedBy(before: DelegationTerms, after: DelegationTerms): LegacyEnd[] {
  const out: LegacyEnd[] = [];
  if (before.effectiveTo != null && after.effectiveTo == null) out.push("END_OPENED");
  if (before.effectiveTo != null && after.effectiveTo != null && after.effectiveTo.getTime() > before.effectiveTo.getTime()) out.push("END_MOVED_LATER");
  if (after.toPersonId !== before.toPersonId) out.push("DELEGATE_CHANGED");
  const wasWhole = before.capabilityCodes.length === 0;
  const isWhole = after.capabilityCodes.length === 0;
  if (!wasWhole && (isWhole || after.capabilityCodes.some((c) => !before.capabilityCodes.includes(c)))) out.push("CAPABILITIES_WIDENED");
  return out;
}

/**
 * Whether an edit of a stored delegation may still stand on its text recommendation
 * (`faultsIn`'s `recordedBeforeAttachments`). Only a delegation marked text-only at
 * landing, never since given an attachment, and not changed by this edit in a ruled way.
 * A new delegation (no stored row) never does.
 */
export function standsOnTextBeforeAttachments(stored: (RecommendationFacts & DelegationTerms) | null, proposed: DelegationTerms): boolean {
  if (!stored) return false;
  return recommendationStanding(stored) === "TEXT_BEFORE_ATTACHMENTS" && legacyEndedBy(stored, proposed).length === 0;
}
