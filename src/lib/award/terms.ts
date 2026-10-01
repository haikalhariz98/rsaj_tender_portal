/**
 * What a save of the award's terms writes (FR-AWD-012, BD-11).
 *
 * Only the fields the form carried: a field the form did not show — a retention figure
 * its terms band does not ask for, a bond field hidden behind "no bond" — is left as
 * stored, never cleared because it was absent. The one deliberate clearing is the
 * bond's own decision: answering "no bond" drops the basis, percentage, amount and
 * validity (and "a bond" drops the reason), because they then mean nothing.
 */

export type TermsValues = Record<string, unknown> & { bondRequired?: boolean | null };

const BOND_DETAIL = ["bondBasis", "bondPercent", "bondBasisAmount", "bondValidityExtraMonths"] as const;

export function termsUpdate(present: ReadonlySet<string>, v: TermsValues): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) if (present.has(k)) out[k] = x;
  if (present.has("bondRequired")) {
    if (v.bondRequired !== true) for (const k of BOND_DETAIL) out[k] = null;
    if (v.bondRequired !== false) out.bondNotRequiredReason = "";
    // A stated amount has no percentage; a percentage of the price has no amount.
    if (v.bondRequired === true && present.has("bondBasis")) {
      if (v.bondBasis === "STATED_AMOUNT") out.bondPercent = null;
      if (v.bondBasis === "CONTRACT_PRICE") out.bondBasisAmount = null;
    }
  }
  return out;
}
