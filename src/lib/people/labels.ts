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

/**
 * How a delegation's absent-holder recommendation reads (FR-APR-012, OD-6). Reads the
 * stored mark of a delegation recorded on text before attachments existed; never guesses
 * it from the text. Null where there is no recommendation at all.
 */
export function recommendationLabel(d: {
  holderRecommendation?: string | null;
  recommendationTextOnlyAtLanding?: boolean;
  recommendationAttached?: boolean;
  recommendationEverAttached?: boolean;
  effectiveTo?: Date | null;
}): string | null {
  const standing = recommendationStanding({
    holderRecommendation: d.holderRecommendation,
    recommendationTextOnlyAtLanding: d.recommendationTextOnlyAtLanding,
    liveAttachments: d.recommendationAttached ? 1 : 0,
    everAttachments: d.recommendationAttached || d.recommendationEverAttached ? 1 : 0,
  });
  if (standing === "NONE") return null;
  const text = STANDING_TEXT[standing];
  return standing === "TEXT_BEFORE_ATTACHMENTS" && d.effectiveTo === null ? `${text} · ${NO_END_DATE}` : text;
}

export const RECOMMENDATION_HINT =
  "Needed where the person delegating is recorded as away: their authority has reverted upward, and is delegated again only on their recommendation. Summarise it here and attach the signed recommendation.";

export const RECOMMENDATION_NOT_ATTACHED =
  "They are recorded as away, so their authority has reverted upward. It is delegated again only on the absent holder's signed recommendation: attach it, with its date and a summary.";
