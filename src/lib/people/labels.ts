/**
 * Words for people and delegations that more than one screen shows. Codes never reach a
 * screen.
 */

/// How a delegation's absent-holder recommendation reads (FR-APR-012, OD-6).
export function recommendationLabel(d: { holderRecommendation?: string | null; recommendationAttached?: boolean }): string | null {
  if (d.recommendationAttached) return "signed recommendation attached";
  if ((d.holderRecommendation ?? "").trim()) return "recorded as text before attachments existed";
  return null;
}

export const RECOMMENDATION_HINT =
  "Needed where the person delegating is recorded as away: their authority has reverted upward, and is delegated again only on their recommendation. Summarise it here and attach the signed recommendation.";

export const RECOMMENDATION_NOT_ATTACHED =
  "They are recorded as away, so their authority has reverted upward. It is delegated again only on the absent holder's signed recommendation: attach it, with its date and a summary.";
