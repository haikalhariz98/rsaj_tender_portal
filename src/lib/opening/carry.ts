/**
 * FR-OPN-009: what evaluation (6.8) reads of the openings — the offers that PASSED at a finalised
 * opening, main or supplementary, and nothing else. A rejected offer never appears, nor one read at an
 * opening not yet finalised. 6.8 reads only this. Pure.
 */

import type { OpeningVerdict } from "./types";

export interface CarriedOpening<B> {
  kind: "MAIN" | "SUPPLEMENTARY";
  finalised: boolean;
  bids: readonly (B & { verdict: OpeningVerdict | null })[];
}

export function evaluationSet<B>(openings: readonly CarriedOpening<B>[]): (B & { verdict: OpeningVerdict | null })[] {
  return openings.filter((o) => o.finalised).flatMap((o) => o.bids.filter((b) => b.verdict === "PASS"));
}

/// The parties carried to evaluation (C-7: the award gate compares parties, never free text).
export const evaluationParties = <B extends { partyId: string }>(openings: readonly CarriedOpening<B>[]) => new Set(evaluationSet(openings).map((b) => b.partyId));
