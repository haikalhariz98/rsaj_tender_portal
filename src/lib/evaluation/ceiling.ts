/**
 * FR-EVL-019: on a quotation, a bid above the exercise's own ceiling — the boundary between quotation
 * and tender, as determined and frozen on the exercise (`boundaryValue`, `boundaryOperator`) — is
 * excluded from evaluation with the reason recorded. Never a literal: the boundary is the customer's
 * matrix, and the operator says which side an exact value falls (GT: the boundary itself is still a
 * quotation; GTE: it is a tender). A tender has no ceiling here. An exercise whose boundary was never
 * recorded is not judged (BOUNDARY_NOT_RECORDED). Pure.
 */

import type { Sen } from "@/lib/money";

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
