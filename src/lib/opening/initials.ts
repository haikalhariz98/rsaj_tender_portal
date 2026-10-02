/**
 * FR-OPN-006, OD-10 (6.7 review M-2): which initials stand on an offer as read. A correction asks
 * every present member's initial again; an initial counts only on the reading it was recorded on.
 * That is decided by a counter, never by stamp order: the offer counts its corrections
 * (`asReadCorrections`, raised in the correcting transaction under the offer's row lock), and each
 * initial records the count it was taken on (`correctionNo`). Two acts in the same second, or
 * committed in another order than their stamps, cannot make a stale initial count. Pure.
 */

export interface ReadingFacts {
  /// How many times what was read has been corrected.
  asReadCorrections: number;
}

export interface InitialFacts {
  personId: string;
  /// The offer's correction count when the initial was recorded.
  correctionNo: number;
}

/// Whether an initial was taken on an earlier reading than the one that stands.
export const initialStale = (bid: ReadingFacts, initial: Pick<InitialFacts, "correctionNo">) => initial.correctionNo !== bid.asReadCorrections;

/// The initials that stand on the offer as it reads now.
export const freshInitials = <I extends Pick<InitialFacts, "correctionNo">>(bid: ReadingFacts, initials: readonly I[]): I[] => initials.filter((i) => !initialStale(bid, i));
