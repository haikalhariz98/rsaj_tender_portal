/**
 * A supplier's acknowledgement of an addendum (FR-VND-013, Phase 4d). Pure.
 *
 * An addendum is notified to the purchasers of the documents (FR-ADV-012, FR-ADV-014): the acknowledgement is theirs to give, so it is allowed only where one of the supplier's linked parties
 * holds a copy of it (an `AddendumRecipient` row, which a later purchaser gets "with the documents"). Anyone may read an issued addendum on the public page; reading it is not acknowledging it.
 * It is allowed once, on an issued addendum, while the window can still be acted on and has not closed. It is not delivery: it never sets the officer's recorded `acknowledgedOn`.
 */

import type { WindowPhase } from "@/lib/window/phase";

import { windowFault } from "./signup";
import type { BidFinding } from "./types";

export interface AcknowledgeInput {
  addendum: { status: string };
  phase: WindowPhase;
  /// One of the supplier's linked parties holds a copy of this addendum.
  holdsCopy: boolean;
  alreadyAcknowledged: boolean;
}

export function acknowledgeFaults(i: AcknowledgeInput): BidFinding[] {
  if (i.addendum.status !== "ISSUED") return [{ code: "ADDENDUM_NOT_ISSUED", level: "block" }];
  const out: BidFinding[] = [];
  const w = windowFault(i.phase);
  if (w) out.push(w);
  if (!i.holdsCopy) out.push({ code: "NOT_A_PURCHASER", level: "block" });
  if (i.alreadyAcknowledged) out.push({ code: "ALREADY_ACKNOWLEDGED", level: "block" });
  return out;
}
