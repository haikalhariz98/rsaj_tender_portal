/**
 * Which exercises a signed-in supplier may open in My Bids (Phase 4d). Pure.
 *
 * An exercise is the supplier's to see in one of two ways, and only these:
 *  - it is a public opportunity (`isPublicOpportunity`: advertised, published, not confidential), which anyone may read, or
 *  - the supplier is the register supplier of one of the exercise's parties (an invitee, a purchaser, an attendee, a bidder at opening), linked by an officer's audited act, and the window has
 *    been published.
 *
 * A confidential ("restricted", FR-MTD-007) exercise is never public, so a supplier reaches it only through a party the office linked to it. An invited exercise is never public either.
 * Before the window is published nobody outside the office sees the exercise, whoever is linked: a proposed invitee on a name route is not yet invited. Anything else reads as not found, and the
 * answer is the same for all of them (a supplier learns nothing from the difference).
 */

export interface VisibilityFacts {
  /// `isPublicOpportunity` for the exercise.
  publicOpportunity: boolean;
  /// The window was published (it has a publication day and an exercise status that records it, including one cancelled after publication).
  windowPublished: boolean;
  /// One of the exercise's parties is linked to this supplier.
  linkedParty: boolean;
}

export type Seen = { seen: true; via: "PUBLIC" | "LINKED" } | { seen: false };

export function supplierSees(f: VisibilityFacts): Seen {
  if (f.publicOpportunity) return { seen: true, via: "PUBLIC" };
  if (f.linkedParty && f.windowPublished) return { seen: true, via: "LINKED" };
  return { seen: false };
}
