/**
 * FR-EVL-019: on a quotation, a bid above the exercise's own ceiling — the boundary between quotation
 * and tender, as determined and frozen on the exercise (`boundaryValue`, `boundaryOperator`) — is
 * excluded from evaluation with the reason recorded. Never a literal: the boundary is the customer's
 * matrix, and the operator says which side an exact value falls (GT: the boundary itself is still a
 * quotation; GTE: it is a tender). A tender has no ceiling here. An exercise whose boundary was never
 * recorded is not judged (BOUNDARY_NOT_RECORDED). Pure.
 */

import { formatMoney, type Sen } from "@/lib/money";

import type { Finding } from "./types";

export interface CeilingSnapshot {
  regime: string | null;
  boundary: Sen | null;
  operator: "GT" | "GTE" | null;
}

export type CeilingFault = "BOUNDARY_NOT_RECORDED";

export type CeilingJudgement = { excluded: false } | { excluded: true; boundary: Sen; operator: "GT" | "GTE" } | { fault: Finding<CeilingFault> };

export function ceilingExclusion(price: Sen, s: CeilingSnapshot): CeilingJudgement {
  if (s.regime !== "quotation") return { excluded: false };
  if (s.boundary == null || s.operator == null) return { fault: { code: "BOUNDARY_NOT_RECORDED", level: "block" } };
  const above = s.operator === "GT" ? price > s.boundary : price >= s.boundary;
  return above ? { excluded: true, boundary: s.boundary, operator: s.operator } : { excluded: false };
}

export type RecommendedCeilingFault = "PRICE_ABOVE_CEILING" | "BOUNDARY_NOT_RECORDED";

/**
 * 6.8 Q1 (ruled; FR-EVL-016, 019, E-9): the price a bid is recommended at — after negotiation where
 * negotiated — is judged against the exercise's frozen quotation ceiling with the same rule as the
 * exclusion at the start. Above it, the bid is not recommended on that price (PRICE_ABOVE_CEILING,
 * naming the boundary and which side a price exactly on it falls); the bid itself is not excluded
 * (exclusion means "not evaluated" and would rewrite submitted stages). A quotation whose boundary
 * was never recorded cannot be judged (BOUNDARY_NOT_RECORDED). A tender has no ceiling here.
 */
export function recommendedCeilingFault(price: Sen, s: CeilingSnapshot): Finding<RecommendedCeilingFault> | null {
  const j = ceilingExclusion(price, s);
  if ("fault" in j) return j.fault;
  return j.excluded ? { code: "PRICE_ABOVE_CEILING", level: "block", data: { boundary: formatMoney(j.boundary), operator: j.operator } } : null;
}

/// Closing a negotiation round (Q1): a price after the round above the ceiling is said, never refused — the round's minutes and price are facts.
export function roundCeilingWarning(priceAfter: Sen, s: CeilingSnapshot): Finding<"PRICE_ABOVE_CEILING_AT_ROUND"> | null {
  const j = ceilingExclusion(priceAfter, s);
  return "excluded" in j && j.excluded ? { code: "PRICE_ABOVE_CEILING_AT_ROUND", level: "warn", data: { boundary: formatMoney(j.boundary), operator: j.operator } } : null;
}
