/**
 * Variation work at valuation (6.13 Part A step 3: FR-PAY-008).
 *
 * A variation is valued only where its approval is obtained (the variation module, step 4, says which are); and at
 * every valuation the value to date is checked against the revised contract sum (the original plus issued
 * adjustments): beyond it, a Variation Order Certificate must be prepared and approved first (VOC_REQUIRED), so
 * the certificate is refused. Exactly the revised sum is not beyond it. Pure.
 */

import type { Sen } from "@/lib/money";

import type { Finding } from "./types";

export interface VariationLine {
  approved: boolean;
  value: Sen;
}

/// The variation value a valuation may include: approved lines only.
export const valuableVariation = (lines: readonly VariationLine[]): Sen => lines.filter((l) => l.approved).reduce((a, l) => a + l.value, 0n);

export function variationFaults(i: { valuedTotal: Sen; revisedSum: Sen; unapproved: number }): Finding[] {
  const out: Finding[] = [];
  if (i.unapproved > 0) out.push({ code: "VARIATION_NOT_APPROVED", level: "block", data: { count: i.unapproved } });
  if (i.valuedTotal > i.revisedSum) out.push({ code: "VOC_REQUIRED", level: "block", data: { valued: i.valuedTotal.toString(), revised: i.revisedSum.toString() } });
  return out;
}

/// FR-PAD-003 (6.13 Part A step 4): the issued adjustments of the contract sum a certificate read its new sum from, and
/// those issued now: any difference refuses its issue (it would certify against a sum no longer the revised one). Both
/// orders: an adjustment issued after the certificate was raised, or (never by the product) one no longer issued.
export function adjustmentsMovedFaults(readAtRaising: readonly string[], issuedNow: readonly string[]): Finding[] {
  const was = new Set(readAtRaising);
  const now = new Set(issuedNow);
  const added = issuedNow.filter((id) => !was.has(id)).length;
  const gone = readAtRaising.filter((id) => !now.has(id)).length;
  return added || gone ? [{ code: "ADJUSTMENTS_MOVED", level: "block", data: { added, gone } }] : [];
}
