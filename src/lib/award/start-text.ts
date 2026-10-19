/**
 * The words for `awardStartRefusal`, shared by the Award tab (which shows them beside the disabled button) and `createAward` (which returns them). One place, so the two never differ.
 */

import { awardFindingTextFor } from "./labels";
import { NO_ZONE } from "./route-write";
import type { StartRefusal } from "./start-gate";

/// `recommendationOpen` false: the reader the recommendation is closed to, who is not told how the award compares with it.
export function startRefusalText(r: StartRefusal, recommendationOpen = true): string {
  switch (r.kind) {
    case "NO_ZONE":
      return NO_ZONE.message ?? "";
    case "NOT_OPEN":
    case "LIVE_AWARD":
      return r.message;
    case "FINDINGS":
      return r.findings.map((f) => awardFindingTextFor(f, false, recommendationOpen)).join(" ");
  }
}

/// The recommendation is SULIT and closed to this reader (FR-EVL-014): said the same on the tab and in the act. `closed` is the access decision's own words.
export const recommendationClosedText = (closed: string, lead = "Nothing was saved"): string => `${lead}: the award is judged against the evaluation's recommendation, which is SULIT and closed to you. ${closed}`;
