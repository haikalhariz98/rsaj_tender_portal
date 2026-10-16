/**
 * Who the staff audit and History views may see acting on an online bid (ADR 0036 D9, rulings 20a, 20c; build plan §1.3). Pure.
 *
 * The supplier and its account are plain in the database (20a, a recorded gap), but no screen shows who bid before the opening: on the online-bid records the audit
 * views withhold the actor and the supplier until the unseal for the named officers, who need the names to work the opening check (20c), and until finalising for
 * everyone else. Other records are not masked here.
 */

/// The records whose entries name a bidder by their actor or supplier.
export const SEALED_AUDIT_ENTITIES: readonly string[] = ["OnlineBid", "OnlineBidFile", "OnlineBidPart"];

/// The records an unseal names a bidder on, on an ONLINE exercise: the opened offer and the envelope that moves to OPENED with its party (20c: between the unseal and finalising only the named
/// officers see who bid). Judged only where the exercise is online (a paper opening names its bidders at the table); their actor is an officer, never a bidder, so it is not withheld.
export const NAMED_AT_UNSEAL_ENTITIES: readonly string[] = ["OpenedBid", "BidEnvelope"];

// src/lib/bids/online/audit-mask.ts (D9)
export function sealedAuditMask(i: { entity: string; viewer: "NAMED_OFFICER" | "OTHER"; unsealed: boolean; finalised: boolean; online?: boolean }): { hideActor: boolean; hideSupplier: boolean } {
  const shown = i.finalised || (i.viewer === "NAMED_OFFICER" && i.unsealed);
  if (NAMED_AT_UNSEAL_ENTITIES.includes(i.entity)) return { hideActor: false, hideSupplier: i.online === true && !shown };
  if (!SEALED_AUDIT_ENTITIES.includes(i.entity)) return { hideActor: false, hideSupplier: false };
  return { hideActor: !shown, hideSupplier: !shown };
}

/// What a masked actor reads as. It names nobody and says why.
export const MASKED_ACTOR_WORDS = "Withheld until the opening: online bids name no bidder before it";

/// What the mask is judged on for one exercise: whether its opening is unsealed and finalised, and who its named opening officers are.
export interface SealedAuditFacts {
  /// Whether the exercise's main opening has started (its roll is frozen). Before it, the rows of online bids are withheld altogether (security audit 2: their number, kinds and times are the
  /// counts, replacements and withdrawals Received hides, 20u).
  started: boolean;
  /// Whether the exercise takes bids online. Only then are the opened offers and envelopes masked at the unseal.
  online: boolean;
  unsealed: boolean;
  finalised: boolean;
  namedOfficerPersonIds: readonly string[];
}

/// A change whose field names who bid, or groups one bidder's submissions: the supplier, its account, who submitted or withdrew it, what it replaces or is replaced by, the bid an alternative
/// belongs to, a file's size, the register reading of a restriction (it quotes the supplier's own document). Withheld from a row whose supplier is hidden.
const IDENTITY_FIELD = /supplier|account|submitted ?by|withdrawn ?by|uploaded ?by|bidder|party|replaces|replaced ?by|parent|cipher ?bytes|restriction ?reading/i;

/// The rows a reader is shown (ADR 0036 D9, 20a, 20c): a row of an online-bid record has its actor and any change naming the supplier withheld until the unseal for the exercise's named
/// officers, and until finalising for everyone else. `factsOf` null means the exercise could not be found, which reads as not yet unsealed: the mask fails closed. One function serves
/// the exported trail and the exercise's History, so the two cannot disagree. Rows of other records are returned as they were.
export function maskSealedAuditRows<R extends { entity: string; entityId: string; actorName?: string | null; changes?: unknown }>(rows: readonly R[], factsOf: (row: R) => SealedAuditFacts | null, viewerPersonId: string | null): R[] {
  const out: R[] = [];
  for (const r of rows) {
    const sealed = SEALED_AUDIT_ENTITIES.includes(r.entity);
    if (!sealed && !NAMED_AT_UNSEAL_ENTITIES.includes(r.entity)) {
      out.push(r);
      continue;
    }
    const facts = factsOf(r) ?? { started: false, online: sealed, unsealed: false, finalised: false, namedOfficerPersonIds: [] };
    // Before the opening starts nobody reads the rows of an online bid: not the named officers, not an administrator.
    if (sealed && !facts.started) continue;
    const viewer = viewerPersonId != null && facts.namedOfficerPersonIds.includes(viewerPersonId) ? "NAMED_OFFICER" : "OTHER";
    const mask = sealedAuditMask({ entity: r.entity, viewer, unsealed: facts.unsealed, finalised: facts.finalised, online: facts.online });
    if (!mask.hideActor && !mask.hideSupplier) {
      out.push(r);
      continue;
    }
    const changes = mask.hideSupplier && Array.isArray(r.changes) ? r.changes.filter((c) => !(c && typeof c === "object" && "field" in c && IDENTITY_FIELD.test(String((c as { field: unknown }).field)))) : r.changes;
    out.push({ ...r, ...(mask.hideActor && "actorName" in r ? { actorName: MASKED_ACTOR_WORDS } : {}), changes });
  }
  return out;
}
