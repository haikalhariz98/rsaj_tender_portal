/**
 * FR-BID-011 (B7): the number of bids and whether competition is adequate. Shown, never blocking.
 * The estimate and withdrawn envelopes are never bids; late ones are counted apart (their
 * admission is the committee's); alternatives are counted apart from the bids they go with.
 * Before opening only envelopes received by an officer exist: the box is counted at opening (6.7).
 * The minimum is the method's configuration; unset reads MINIMUM_NOT_SET, never "met". Pure.
 */

import type { EnvelopeFacts } from "./types";

export interface BidCount {
  /// Bids received in time, not withdrawn.
  inTime: number;
  /// Late bids and alternatives, not withdrawn.
  late: number;
  /// Alternatives received in time, not withdrawn.
  alternatives: number;
  withdrawn: number;
}

export function bidCount(envelopes: readonly Pick<EnvelopeFacts, "kind" | "late" | "status">[]): BidCount {
  const bids = envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE");
  const live = bids.filter((e) => e.status !== "WITHDRAWN");
  return {
    inTime: live.filter((e) => e.kind === "BID" && !e.late).length,
    late: live.filter((e) => e.late).length,
    alternatives: live.filter((e) => e.kind === "ALTERNATIVE" && !e.late).length,
    withdrawn: bids.length - live.length,
  };
}

export type Competition = "MET" | "BELOW_MINIMUM" | "SINGLE" | "MINIMUM_NOT_SET";

/// Whether `n` bids meet the method's minimum. One bid is flagged SINGLE and proceeds.
export function competition(n: number, minimum: number | null): Competition {
  if (minimum == null) return "MINIMUM_NOT_SET";
  if (n === 1) return "SINGLE";
  return n < minimum ? "BELOW_MINIMUM" : "MET";
}
