/**
 * Words for people and delegations that more than one screen shows. Codes never reach a
 * screen.
 */

import { recommendationStanding, type RecommendationStanding } from "./recommendation";

const STANDING_TEXT: Readonly<Record<Exclude<RecommendationStanding, "NONE">, string>> = {
  ATTACHED: "signed recommendation attached",
  NO_LONGER_ATTACHED: "signed recommendation no longer attached",
  TEXT_BEFORE_ATTACHMENTS: "recorded as text before attachments existed",
  TEXT_ONLY: "signed recommendation not attached",
};

/// Said beside a legacy delegation's label where it has no end date.
export const NO_END_DATE = "no end date";

type Shown = {
  holderRecommendation?: string | null;
  recommendationTextOnlyAtLanding?: boolean;
  recommendationAttached?: boolean;
  recommendationEverAttached?: boolean;
  effectiveTo?: Date | null;
};

const standingOf = (d: Shown) =>
  recommendationStanding({
    holderRecommendation: d.holderRecommendation,
    recommendationTextOnlyAtLanding: d.recommendationTextOnlyAtLanding,
    liveAttachments: d.recommendationAttached ? 1 : 0,
    everAttachments: d.recommendationAttached || d.recommendationEverAttached ? 1 : 0,
  });

/**
 * How a delegation's absent-holder recommendation reads (FR-APR-012, OD-6). Reads the
 * stored mark of a delegation recorded on text before attachments existed; never guesses
 * it from the text. Null where there is no recommendation at all.
 */
export function recommendationLabel(d: Shown): string | null {
  const standing = standingOf(d);
  if (standing === "NONE") return null;
  const text = STANDING_TEXT[standing];
  return standing === "TEXT_BEFORE_ATTACHMENTS" && d.effectiveTo === null ? `${text} · ${NO_END_DATE}` : text;
}

/**
 * The note above the delegation editor's file field: what is on record, in the words of
 * its state, and what choosing a file does. Null where there is nothing on record.
 */
export function recommendationNote(d: Shown): string | null {
  const label = recommendationLabel(d);
  if (!label) return null;
  const standing = standingOf(d);
  switch (standing) {
    case "ATTACHED":
      return `The recommendation on record: ${label}. Choose a file below to attach another.`;
    case "NO_LONGER_ATTACHED":
      return `The recommendation on record: ${label}. Choose a file below to attach it again.`;
    case "TEXT_BEFORE_ATTACHMENTS":
      return `The recommendation on record: ${label}. It stands on its text until the end date is moved later or opened, the delegate changes or more is delegated; then the signed recommendation is needed. Choose a file below to attach it.`;
    default:
      return `The recommendation on record: ${label}. Choose a file below to attach it.`;
  }
}

export const RECOMMENDATION_HINT =
  "Needed where the person delegating is recorded as away: their authority has reverted upward, and is delegated again only on their recommendation. Summarise it here and attach the signed recommendation.";

export const RECOMMENDATION_NOT_ATTACHED =
  "They are recorded as away, so their authority has reverted upward. It is delegated again only on the absent holder's signed recommendation: attach it, with its date and a summary.";
