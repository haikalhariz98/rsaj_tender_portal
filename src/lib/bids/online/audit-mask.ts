/**
 * Who the staff audit and History views may see acting on an online bid (ADR 0036 D9, rulings 20a, 20c; build plan §1.3). Pure.
 *
 * The supplier and its account are plain in the database (20a, a recorded gap), but no screen shows who bid before the opening: on the online-bid records the audit
 * views withhold the actor and the supplier until the unseal for the named officers, who need the names to work the opening check (20c), and until finalising for
 * everyone else. Other records are not masked here.
 */

/// The records whose entries name a bidder by their actor or supplier.
export const SEALED_AUDIT_ENTITIES: readonly string[] = ["OnlineBid", "OnlineBidFile", "OnlineBidPart"];

// src/lib/bids/online/audit-mask.ts (D9)
export function sealedAuditMask(i: { entity: string; viewer: "NAMED_OFFICER" | "OTHER"; unsealed: boolean; finalised: boolean }): { hideActor: boolean; hideSupplier: boolean } {
  if (!SEALED_AUDIT_ENTITIES.includes(i.entity)) return { hideActor: false, hideSupplier: false };
  const shown = i.finalised || (i.viewer === "NAMED_OFFICER" && i.unsealed);
  return { hideActor: !shown, hideSupplier: !shown };
}

/// What a masked actor reads as. It names nobody and says why.
export const MASKED_ACTOR_WORDS = "Withheld until the opening: online bids name no bidder before it";
