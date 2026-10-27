import type { Sen } from "@/lib/money";

/**
 * The funding source's shapes (ADR 0046, plan `docs/notes/plans/sukuk-core-plan.md` §3.2). Where a matter's money comes from, never
 * how it is procured (that is the funding route). No rule branches on a source being a sukuk: eligibility is per source.
 */

export interface SourceRef {
  id: string;
  /// The finance system's key. Never rendered.
  code: string;
  label: string;
  sortOrder: number;
  /// Null: no envelope set, which is not an envelope of zero.
  envelope: Sen | null;
  /// FS-4: null not set (passes, with a warning), false any category, true only `eligibleCategoryCodes`.
  categoriesRestricted: boolean | null;
  eligibleCategoryCodes: readonly string[];
  retiredOn: Date | null;
}

/// A share in basis points: 60.00% is 6000. A split's shares sum to 10000.
export interface Share {
  sourceId: string;
  bp: number;
}

export type CaseFunding =
  /** The contract's own FundingAllocation rows. */
  | { state: "SPLIT"; shares: Share[] }
  /** No rows: the requisition's source at 10000. */
  | { state: "FROM_REQUISITION"; shares: [Share] }
  | { state: "NOT_SET" };

export type Eligibility =
  | { state: "ELIGIBLE" }
  | { state: "UNRESTRICTED" }
  | { state: "NOT_SET" }
  | { state: "CATEGORY_MISSING" }
  | { state: "NOT_ELIGIBLE"; categoryCode: string };
