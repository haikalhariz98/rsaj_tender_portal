/**
 * The price as read on an opened bid (FR-OPN-005), now that it may be unread (wave 3b, ADR 0036 D10, ruling 20). Pure.
 *
 * A paper bid's price is typed when its envelope is opened, so it is never null (a trigger refuses a null price on a paper envelope). An online bid is created at the
 * unseal with its price NULL, and its price is written from the sealed declaration only by the finalise: ruling 20's "the declared figures are plain in the database
 * only from finalising". A trigger refuses to finalise an opening while any of its bids has no price.
 *
 * So a reader that runs only on read prices (the finalise's schedule and Grand Summary, the evaluation, a correction of what was read) takes the price through
 * `priceRead`, which refuses loudly, naming the rule, rather than reading a missing figure as nothing. A screen that may meet an online bid before its finalising
 * shows `PRICE_NOT_READ_WORDS` instead (`priceOrWords`).
 */

/// What a screen says where an online bid's price is still sealed. Never a figure, never "0".
export const PRICE_NOT_READ_WORDS = "Not read yet: an online bid's price is unsealed when the opening is finalised";

/// A reader of read prices met a bid whose price is not read. It names the bid and the rule, so the refusal says which rule refused it.
export class PriceNotReadError extends Error {
  readonly code = "PRICE_NOT_READ" as const;
  constructor(readonly listingNo: number | null) {
    super(
      `Price of bid ${listingNo ?? "(unnumbered)"} not read yet. Online prices are written at finalising.`,
    );
    this.name = "PriceNotReadError";
  }
}

/// The price, where the reader needs one. Throws `PriceNotReadError` for a bid whose price is not read.
export function priceRead<T>(b: { priceAsRead: T | null; listingNo?: number | null }): T {
  if (b.priceAsRead == null) throw new PriceNotReadError(b.listingNo ?? null);
  return b.priceAsRead;
}

/// The price shown on a screen: the reader's formatting of a read price, or the words for one not read yet.
export function priceOrWords<T>(price: T | null, format: (p: T) => string): string {
  return price == null ? PRICE_NOT_READ_WORDS : format(price);
}
