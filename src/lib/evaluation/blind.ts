import { createHash } from "node:crypto";

/**
 * A blind reading of an anonymised evaluation (product owner, 2026-10-08, ruling on log line 1751; FR-EVL-020: "anonymise bidder identity and price during the technical scoring
 * stage"). On a version that froze anonymisation ON, until its technical scoring stage is submitted, the Evaluation tab sends a MEMBER OF THE EVALUATION TEAM no bidder name, no
 * price and no evaluation-bidder id outside the logged reveal. The overview's bid list, the recommendation and the aspects show the pseudonym, or are held back with the reason in
 * words. The rows carry an opaque key for each version, not the bidder's id, and the actions that take a bid resolve the key on the server.
 *
 * What stays as it was: the opening's own pages (the panel's record); the readers who are not on the team (the person in charge, the participants, the Secretariat and Internal
 * Audit offices, a holder of the organisation-wide permission), who are not scoring; and the reveal for a criterion that needs the named contractor, which is asked of the gate
 * and logged. A team member who sat on the opening panel has seen the names there, and the configuration says so.
 *
 * Pure (Node's hash only), and server-side: the key is made where the view and the actions are, never in a browser.
 */

/// What stands where a price is withheld from a blind reader.
export const BLIND_FIGURE = "Withheld while the scoring is blind";

/// What stands where free text that may name a bidder or quote a price is withheld from a blind reader.
export const BLIND_TEXT = "Held back while the scoring is blind: it may name the bidder or quote its price.";

/// Why, in words, for the notice at the head of the tab.
export const BLIND_NOTICE = {
  title: "Blind scoring",
  body: "This version froze anonymised scoring. Bids are called Bidder n and prices are withheld until technical scoring is submitted. Names show only where a criterion needs the contractor, and each reveal is logged. An opening panel member has seen the names there.",
} as const;

/// Whether this reader is read blind: the version holds identities back, and they are on its evaluation team.
export function blindReader(held: boolean, teamPersonIds: readonly string[], readerPersonId: string | null): boolean {
  return held && readerPersonId != null && teamPersonIds.includes(readerPersonId);
}

/// A bidder's opaque key within one evaluation version: the same every time the version is read, different in another version, and not the bidder's id. It carries nothing a
/// reader could turn back into the id: the id is a random identifier the reader is never sent.
export function bidderKey(evaluationId: string, bidderId: string): string {
  return createHash("sha256").update(`bidder-key:${evaluationId}:${bidderId}`).digest("hex").slice(0, 24);
}

/**
 * The bidder a form names, by its id or by its key for this version: the id of a bidder of the version, or null where it names none. A key for another version, or one that
 * matches no bidder, resolves to nothing. The server resolves it inside the act's lock, from the bidders of the version in force.
 */
export function resolveBidderRef(evaluationId: string, bidderIds: readonly string[], supplied: string): string | null {
  if (!supplied) return null;
  const byId = bidderIds.find((id) => id === supplied);
  if (byId) return byId;
  return bidderIds.find((id) => bidderKey(evaluationId, id) === supplied) ?? null;
}
