/**
 * The minimum-capital test (FR-EVL-008, 010): the minimum capital is the configured factor of a base —
 * the tender amount (TA 109) or the company estimate (the quotation's Fasa 3) — and the bidder's
 * capital is the average of three monthly balances it evidences (E-6: entered in sen). The ratio is the
 * average as a percentage of the base, so a ratio exactly at the factor is a capital exactly at the
 * minimum (the reading is ASSUMED and shown). The band is the configured set's, its floor the factor
 * chosen for the bidder (store-supplied or contractor-supplied, recorded per bidder). The company
 * estimate is a base only once disclosed: sealed, nothing is computed (ESTIMATE_SEALED). Pure.
 */

import { divRound, ratioPct, senTimesPct, type Fixed } from "./fixed";
import { placeInBands, type Band, type BandPlacement } from "./bands";
import type { Sen } from "@/lib/money";
import type { CapitalBase } from "./types";

/// What the base is for one bidder: its tender amount, or the disclosed estimate, or why there is none.
export type CapitalBaseValue = { base: Sen } | { fault: "ESTIMATE_SEALED" | "ESTIMATE_NOT_AVAILABLE" | "BASE_NOT_SET" };

export function capitalBase(kind: CapitalBase | null, tenderAmount: Sen, estimate: { sealed: true } | { notRequired: true } | { value: Sen }): CapitalBaseValue {
  if (kind == null) return { fault: "BASE_NOT_SET" };
  if (kind === "TENDER_AMOUNT") return { base: tenderAmount };
  if ("sealed" in estimate) return { fault: "ESTIMATE_SEALED" };
  if ("notRequired" in estimate) return { fault: "ESTIMATE_NOT_AVAILABLE" };
  return { base: estimate.value };
}

/// The minimum capital: the factor of the base, to the sen, half up. 10 % of 1,077,508.60 = 107,750.86.
export const minimumCapital = (base: Sen, factorPct: Fixed): Sen => senTimesPct(base, factorPct);

/// The average of three monthly balances, to the sen, half up: 10,000.00 / 12,000.00 / 14,000.01 → 12,000.00.
export const averageBalance = (b1: Sen, b2: Sen, b3: Sen): Sen => divRound(b1 + b2 + b3, 3n);

/// The average as a percentage of the base, at four places; null with a base of nothing.
export const capitalRatio = (average: Sen, base: Sen): Fixed | null => ratioPct(average, base);

/**
 * The band the ratio falls in, the floor being the bidder's factor. Where the capital and its minimum
 * are given, the floor is judged on them, in sen, exactly: a ratio at four places cannot tell a capital
 * one sen short of its minimum from one that meets it.
 */
export function capitalBand(ratio: Fixed, factorPct: Fixed | null, bands: readonly Band[], exact?: { average: Sen; minimum: Sen }): BandPlacement {
  const floorCmp = exact ? (exact.average < exact.minimum ? -1 : exact.average > exact.minimum ? 1 : 0) : undefined;
  return placeInBands(ratio, bands, factorPct, floorCmp);
}
