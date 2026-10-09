/**
 * What a supplier's own part in an exercise is, in a line of chips for the My Bids list (Phase 4d). Pure. It says what the supplier has done and what waits for it, in its own words, and nothing
 * about how a bid fared.
 */

export interface PartFacts {
  /// The documents have been sold to the supplier (a sale that stands).
  bought: boolean;
  /// A request for the documents stands.
  requested: boolean;
  /// Sign-ups for events that stand.
  signUps: number;
  /// Addenda the supplier holds and has not acknowledged.
  toAcknowledge: number;
  /// A bid of the supplier's was opened.
  opened: boolean;
  /// A notice of the outcome has been issued to it.
  outcomeNotice: boolean;
  /// The supplier opened the Tender Table Document at least once.
  inspected: boolean;
}

export interface PartChip {
  text: string;
  tone?: "ok" | "warn" | "info" | "brand";
}

export function partChips(f: PartFacts): PartChip[] {
  const out: PartChip[] = [];
  if (f.toAcknowledge > 0) out.push({ text: f.toAcknowledge === 1 ? "1 addendum to acknowledge" : `${f.toAcknowledge} addenda to acknowledge`, tone: "warn" });
  if (f.outcomeNotice) out.push({ text: "Notice of the outcome", tone: "info" });
  if (f.opened) out.push({ text: "Bid opened", tone: "info" });
  if (f.bought) out.push({ text: "Documents bought", tone: "ok" });
  else if (f.requested) out.push({ text: "Documents asked for", tone: "brand" });
  if (f.signUps > 0) out.push({ text: f.signUps === 1 ? "Signed up for 1 event" : `Signed up for ${f.signUps} events`, tone: "ok" });
  if (f.inspected && !f.bought) out.push({ text: "Inspected the documents" });
  return out;
}

/// What the list says when the supplier has done nothing yet on an exercise it can open.
export const NO_PART_YET = "Nothing yet";
