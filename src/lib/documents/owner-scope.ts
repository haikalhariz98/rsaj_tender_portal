import type { SulitScope } from "@/lib/sulit-fields";

import type { OwnerKind } from "./types";

/**
 * Which kind of record judges the bytes of a document attached to an owner of this kind (OD-2, Phase 3b). Pure: `entitlement.ts` reads the records and asks the rule.
 * An exercise's papers (its award, bill, tender pack, opening, withdrawal letters) are judged by who is named on the exercise; an evaluation's, its meetings' and its bidders',
 * by the evaluation's resolver; a supplier's, a contract's and the rest keep no list of who is named, so only the organisation-wide permission opens them.
 */
const EVALUATION_OWNERS: readonly OwnerKind[] = ["evaluation", "evaluationMeeting", "evaluationBidder"];
const SUPPLIER_OWNERS: readonly OwnerKind[] = ["supplierDocument", "supplierApplication", "standingEvent", "registrationDraftDocument"];
const CONTRACT_OWNERS: readonly OwnerKind[] = ["contract", "variationInstruction", "delayNotice", "eotClaim"];

/// The scope that judges an owner of this kind; `exerciseId` is the exercise it hangs on, where it hangs on one.
export function scopeOfOwner(kind: OwnerKind, exerciseId: string | null): SulitScope {
  if (exerciseId) return EVALUATION_OWNERS.includes(kind) ? "evaluation" : "exercise";
  // Phase 4b: a creditor profile's bank statement is judged by who is named on the profile's application route, or holds the grant to read creditor profiles.
  if (kind === "creditorProfile") return "creditorProfile";
  if (SUPPLIER_OWNERS.includes(kind)) return "supplier";
  if (CONTRACT_OWNERS.includes(kind)) return "contract";
  return "requisition";
}
