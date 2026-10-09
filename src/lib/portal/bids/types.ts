import type { Finding } from "@/lib/window/types";

/**
 * What the supplier's own My Bids workspace (Phase 4d) is made of: the findings its acts return, the tabs, and the shapes the pure rules take. No rule is here (they are in `visibility.ts`, `signup.ts`,
 * `acknowledge.ts`, `checks.ts`, `release.ts`, `standing.ts`, `notices.ts` and `non-award.ts`). Nothing names a supplier: the supplier is the signed-in session's, and the stores read only its rows.
 */

export const BID_TABS = ["overview", "briefings", "addenda", "documents", "outcome"] as const;
export type BidTab = (typeof BID_TABS)[number];
export const isBidTab = (s: string | undefined): s is BidTab => (BID_TABS as readonly string[]).includes(s ?? "");

/// The two tabs of the list page.
export const BIDS_LIST_TABS = ["exercises", "notices"] as const;
export type BidsListTab = (typeof BIDS_LIST_TABS)[number];
export const isBidsListTab = (s: string | undefined): s is BidsListTab => (BIDS_LIST_TABS as readonly string[]).includes(s ?? "");

export type BidFault =
  // Whether the supplier may see the exercise at all, and whether the window is in a state to act on.
  | "NOT_FOUND"
  | "NOT_PUBLISHED"
  | "EXERCISE_CANCELLED"
  | "WINDOW_CLOSED"
  | "WINDOW_NOT_DATED"
  | "NOT_INVITED"
  // A sign-up for a briefing or site visit.
  | "REPRESENTATIVE_REQUIRED"
  | "REPRESENTATIVE_TOO_LONG"
  | "EVENT_NOT_FOUND"
  | "EVENT_CANCELLED"
  | "EVENT_HELD"
  | "EVENT_STARTED"
  | "EVENT_NOT_DATED"
  | "ALREADY_SIGNED_UP"
  | "NOT_SIGNED_UP"
  // An addendum.
  | "ADDENDUM_NOT_FOUND"
  | "ADDENDUM_NOT_ISSUED"
  | "NOT_A_PURCHASER"
  | "ALREADY_ACKNOWLEDGED"
  // A request for the documents (the pre-sale checks themselves are `PreSaleCheck`s, in words).
  | "COLLECTOR_REQUIRED"
  | "COLLECTOR_TOO_LONG"
  | "REQUEST_STANDS"
  | "NO_REQUEST"
  | "ALREADY_BOUGHT"
  | "REQUEST_REFUSED";

export type BidFinding = Finding<BidFault>;

/// The window's phase and the path, as the rules read them (derived from stored instants, never stored).
export type { WindowPhase } from "@/lib/window/phase";
export type { WindowPath } from "@/lib/window/types";

/// Raised from inside an act's transaction so that nothing is written. `status` is what a handler answers with: 404 for something that is not the supplier's to see, 409 for a change that came first.
export class BidRefused extends Error {
  constructor(
    readonly faults: readonly BidFinding[],
    readonly status: 404 | 409 | 422 = 422,
  ) {
    super(faults.map((f) => f.code).join(", "));
    this.name = "BidRefused";
  }
}
