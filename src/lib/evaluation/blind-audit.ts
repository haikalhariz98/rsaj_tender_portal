import { BLIND_FIGURE } from "./blind";

/**
 * The blind reading, carried to the audit trail (product owner, 2026-10-09, ruling on log lines 1867(3) and 1869). FR-EVL-020 anonymises bidder identity and price during the
 * technical scoring stage, and `blind.ts` holds the Evaluation tab to it. The History tab and the audit export read the opening's rows and the evaluation's rows, which pair a
 * listing number with a bidder's name and price: left alone they undo what the tab promises, one click away. So while a version's anonymisation is frozen on and has not
 * lifted, a reader on its evaluation team sees those rows with every bidder's name, registration number and price taken out.
 *
 * A bid is still called by its listing number ("Bid No. 3"), as the evaluation's own rows and every refusal message call it: the listing number is the order the envelopes were
 * opened in, and the evaluation shows the reader only a pseudonym that is not that number, so the number alone names nobody.
 *
 * Pure. Which reader is blind, and which bids those are, is `blind-audit-store.ts`'s to ask of the database.
 */

/// One bid of an exercise whose names and figures a blind reader is not shown.
export interface BlindBid {
  listingNo: number;
  /// Every way the trail may write this bidder: the name as read at the opening, the name on the evaluation, the party's own name and the registration number.
  names: readonly string[];
  /// Every way the trail may write this bid's price: the formatted money and the plain decimal.
  figures: readonly string[];
}

/// One exercise a reader is blind to: its audit rows are those whose label begins with its reference.
export interface BlindScope {
  exerciseId: string;
  reference: string;
  bids: readonly BlindBid[];
}

/// What stands where a bidder's name is withheld and it is not one of the bids the reader is blind to (a record that was written with another name).
export const BLIND_NAME = "Held back while the scoring is blind";

/// The audit fields that carry a bidder's identity. Held to the writers by the test: a field added to a bid's row must be named here or in `BLIND_PRICE_FIELDS`, or be known to carry neither.
export const BLIND_NAME_FIELDS: ReadonlySet<string> = new Set(["bidder", "party", "registrationNo", "recommendedTenderer", "bidderIdentity", "matchedTo"]);

/// The audit fields that carry a bid's price, or a figure from which it is read.
export const BLIND_PRICE_FIELDS: ReadonlySet<string> = new Set([
  "openingPrice",
  "openingPrices",
  "correctedPrice",
  "correctedPrices",
  "evaluatedPrice",
  "recommendedPrice",
  "priceBeforeRound",
  "priceAfterRound",
  "monthlyBalances",
]);

/// How a bid is named to a blind reader.
export const bidWords = (listingNo: number): string => `Bid No. ${listingNo}`;

/// Short strings are not searched for: a two-letter name would take its letters out of every word.
const MIN_SEARCHED = 3;

interface Needle {
  text: string;
  lower: string;
  instead: string;
}

/// Every name and figure to look for, longest first so that a name holding another is replaced whole.
function needlesOf(bids: readonly BlindBid[]): Needle[] {
  const found = new Map<string, Needle>();
  for (const b of bids) {
    for (const n of b.names) add(found, n, bidWords(b.listingNo));
    for (const n of b.figures) add(found, n, BLIND_FIGURE);
  }
  return [...found.values()].sort((a, z) => z.text.length - a.text.length || (a.lower < z.lower ? -1 : a.lower > z.lower ? 1 : 0));
}

function add(into: Map<string, Needle>, raw: string, instead: string) {
  const text = raw.trim();
  if (text.length < MIN_SEARCHED) return;
  const lower = text.toLowerCase();
  // The same text for two bids (a joint registration number) is held back by neither's number.
  const was = into.get(lower);
  if (was && was.instead !== instead) into.set(lower, { text, lower, instead: BLIND_NAME });
  else if (!was) into.set(lower, { text, lower, instead });
}

/// A text with every name and figure of the bids taken out. Case does not matter; the rest of the text is as it was.
export function maskText(text: string, bids: readonly BlindBid[]): string {
  let out = text;
  for (const n of needlesOf(bids)) {
    const lowered = out.toLowerCase();
    if (!lowered.includes(n.lower)) continue;
    let built = "";
    let from = 0;
    for (let i = lowered.indexOf(n.lower); i >= 0; i = lowered.indexOf(n.lower, from)) {
      built += out.slice(from, i) + n.instead;
      from = i + n.lower.length;
    }
    out = built + out.slice(from);
  }
  return out;
}

interface Change {
  field: string;
  before: string | null;
  after: string | null;
}

/// The value of a field that carries an identity: a name that is one of the bids' becomes the bid's number; any other is held back whole.
function maskName(value: string, bids: readonly BlindBid[]): string {
  if (!value) return value;
  const masked = maskText(value, bids);
  return masked === value ? BLIND_NAME : masked;
}

/// One stored change: its identity and price fields withheld by name, and any other text with the names and figures taken out of it.
export function maskChange<C extends { field: string; before?: unknown; after?: unknown }>(c: C, bids: readonly BlindBid[]): C {
  const raw = c.field;
  const one = (v: unknown): unknown => {
    if (typeof v !== "string" || v === "") return v;
    if (BLIND_PRICE_FIELDS.has(raw)) return BLIND_FIGURE;
    if (BLIND_NAME_FIELDS.has(raw)) return maskName(v, bids);
    return maskText(v, bids);
  };
  return { ...c, before: one(c.before), after: one(c.after) };
}

interface Row {
  entityLabel: string;
  reason?: string | null;
  changes?: unknown;
}

/// Whether an audit row is the scope's: every row of an exercise is labelled with its reference (`evLabel`, `label(l, …)`), which is also how its History finds them.
export const rowIsOf = (row: { entityLabel: string; entityId?: string }, scope: Pick<BlindScope, "exerciseId" | "reference">): boolean =>
  row.entityLabel.startsWith(`${scope.reference} ·`) || row.entityId === scope.exerciseId;

/// One audit row of an exercise, as a blind reader is shown it: the label, the reason and every change with the names and figures out. A row that held none is returned as it was.
export function maskRow<R extends Row>(row: R, bids: readonly BlindBid[]): R {
  if (bids.length === 0) return row;
  const changes = Array.isArray(row.changes) ? (row.changes as Change[]).map((c) => (c && typeof c === "object" && "field" in c ? maskChange(c, bids) : c)) : row.changes;
  const masked = { ...row, entityLabel: maskText(row.entityLabel, bids), reason: typeof row.reason === "string" ? maskText(row.reason, bids) : row.reason, changes };
  return masked.entityLabel === row.entityLabel && masked.reason === row.reason && JSON.stringify(masked.changes) === JSON.stringify(row.changes) ? row : masked;
}

/// The rows a reader is shown: those of an exercise they are blind to are masked, the rest are returned as they were. The same function serves the History and the export.
export function maskRowsForBlindReader<R extends Row & { entityId?: string }>(rows: readonly R[], scopes: readonly BlindScope[]): R[] {
  if (scopes.length === 0) return [...rows];
  return rows.map((r) => {
    const scope = scopes.find((s) => rowIsOf({ entityLabel: r.entityLabel, entityId: r.entityId }, s));
    return scope ? maskRow(r, scope.bids) : r;
  });
}

/// How many rows the masking changed: the export records it, so a file made for a blind reader says it is not the whole trail.
export function rowsMasked<R extends Row>(before: readonly R[], after: readonly R[]): number {
  return after.filter((r, i) => r !== before[i]).length;
}

/// Whether a value in the trail is what stands where a blind reader's name or price was taken out. Such a value is not a SULIT figure read: the gate is not asked for it and no read is logged.
export const isBlindMasked = (v: string | null | undefined): boolean => v === BLIND_FIGURE || v === BLIND_NAME;

/// Every row of one exercise, as a blind reader is shown it. The History of an exercise holds only that exercise's rows (found by label or by the ids of its routes and parts), so none is left unmasked
/// for want of the reference in its label.
export function maskAllRows<R extends Row>(rows: readonly R[], scope: Pick<BlindScope, "bids">): R[] {
  return rows.map((r) => maskRow(r, scope.bids));
}
