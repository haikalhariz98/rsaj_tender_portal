/**
 * The four aspects of a traditional evaluation (FR-EVL-003): a verdict and a narrative per bidder per
 * aspect, append-only (a reassessment supersedes). Aspect (a), completeness, is offered prefilled from
 * what the opening found missing on the bid (6.7's completeness), editable; aspect (b), the price
 * against the estimate, shows the computed variance beside the form (never in the narrative, which is
 * saved to the trail: fix R-5) and, where the model bands it, the band as a guide — the verdict is the
 * evaluators' (OD-6 A). An aspect left unassessed holds the stage's submission
 * (ASPECT_UNASSESSED, `stages.ts`). Pure.
 */

import { variance } from "./commercial";
import { evaluatedPrice, type BidderFacts } from "./facts";
import { pctText } from "./fixed";
import type { EstimateRead } from "./saving";
import type { AspectKind, AspectVerdict, Finding } from "./types";

export interface AspectSuggestion {
  verdict: AspectVerdict | null;
  narrative: string;
  /// What the figures show, for the evaluator to read beside the form (on the SULIT tab), never put
  /// into the narrative: a saved narrative reaches the trail (fix R-5).
  guide?: string;
}

/// What the screen offers to start an aspect from. Never recorded until the evaluator saves it.
export function aspectPrefill(kind: AspectKind, b: Pick<BidderFacts, "missingAtOpening" | "priceAsRead" | "correctedPrice">, estimate: EstimateRead): AspectSuggestion {
  if (kind === "COMPLETENESS") {
    return b.missingAtOpening.length
      ? { verdict: "NOT_SATISFACTORY", narrative: `At the opening the bid was found without: ${b.missingAtOpening.join(", ")}.` }
      : { verdict: "SATISFACTORY", narrative: "At the opening every item on the checklist was found with the bid." };
  }
  if (kind === "PRICE_VS_ESTIMATE") {
    if ("sealed" in estimate) return { verdict: null, narrative: "The company estimate is still sealed." };
    if ("notRequired" in estimate) return { verdict: null, narrative: "No company estimate was required for this exercise." };
    const v = variance(evaluatedPrice(b), estimate.value);
    // R-5: the variance is shown beside the form, never written into the narrative it would be saved with.
    return { verdict: null, narrative: "", ...(v.pct == null ? {} : { guide: `The evaluated price is ${pctText(v.pct, 2, true)} against the company estimate.` }) };
  }
  return { verdict: null, narrative: "" };
}

export type AspectFault = "ASPECT_NOT_IN_MODEL" | "NARRATIVE_REQUIRED" | "VERDICT_REQUIRED";

export function assessFaults(i: { aspectInModel: boolean; verdict: AspectVerdict | null; narrative: string }): Finding<AspectFault>[] {
  const out: Finding<AspectFault>[] = [];
  if (!i.aspectInModel) out.push({ code: "ASPECT_NOT_IN_MODEL", level: "block" });
  if (!i.verdict) out.push({ code: "VERDICT_REQUIRED", level: "block" });
  if (!i.narrative.trim()) out.push({ code: "NARRATIVE_REQUIRED", level: "block" });
  return out;
}
