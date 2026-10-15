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

/// Wave 3b step 12: a replaced online bid (SUPERSEDED) is neither a bid nor a withdrawal, and is never counted. An online withdrawal is counted only once the opening has started
/// (`onlineOpeningStarted`): before it, the counter would show how many there have been (ruling 20u), which the count dropping already shows only as a smaller number.
export function bidCount(envelopes: readonly (Pick<EnvelopeFacts, "kind" | "late" | "status"> & Partial<Pick<EnvelopeFacts, "channel">>)[], onlineOpeningStarted = true): BidCount {
  const bids = envelopes.filter((e) => e.kind !== "COMPANY_ESTIMATE" && e.status !== "SUPERSEDED");
  const live = bids.filter((e) => e.status !== "WITHDRAWN");
  const withdrawn = bids.filter((e) => e.status === "WITHDRAWN" && (e.channel !== "ONLINE" || onlineOpeningStarted)).length;
  return {
    inTime: live.filter((e) => e.kind === "BID" && !e.late).length,
    late: live.filter((e) => e.late).length,
    alternatives: live.filter((e) => e.kind === "ALTERNATIVE" && !e.late).length,
    withdrawn,
  };
}

export type Competition = "MET" | "BELOW_MINIMUM" | "SINGLE" | "MINIMUM_NOT_SET";

/// Whether `n` bids meet the method's minimum. One bid is flagged SINGLE and proceeds.
export function competition(n: number, minimum: number | null): Competition {
  if (minimum == null) return "MINIMUM_NOT_SET";
  if (n === 1) return "SINGLE";
  return n < minimum ? "BELOW_MINIMUM" : "MET";
}
