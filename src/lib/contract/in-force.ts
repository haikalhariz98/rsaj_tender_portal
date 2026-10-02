/**
 * Whether a contract-controls row or the legal office is in force on the organisation's day (6.12 review
 * R-6). A row retired "from" a day stops being offered on that day, not before it: the end is exclusive, as
 * every effective period in the project is (`src/lib/effective.ts`). A row retired from next month is still
 * offered today; one retired from today is not.
 */

import { dayToDate } from "@/lib/dates";
import { hasEnded, inForceOn } from "@/lib/effective";

/// A row with a "retired from" day, in force on `today` (the organisation's day, YYYY-MM-DD).
export const rowInForce = (row: { retiredOn: Date | null }, today: string): boolean => !hasEnded({ effectiveTo: row.retiredOn }, dayToDate(today));

type UnitRow = { code: string; effectiveFrom: Date; effectiveTo: Date | null };

/**
 * The unit row of a code in force on `today` (begun, and not ended: `inForceOn`), never merely the first row
 * with that code: a unit renamed by a new row from a day reads its new name from that day, and a unit that
 * starts tomorrow is not in force today (6.12 re-review M-2).
 */
export function unitInForce<U extends UnitRow>(code: string | null | undefined, units: readonly U[], today: string): U | null {
  if (!code) return null;
  const on = dayToDate(today);
  return units.find((u) => u.code === code && inForceOn(u, on)) ?? null;
}

/// Whether the configured legal office is a unit of the organisation's structure in force on `today`.
export const legalOfficeKnown = (code: string | null | undefined, units: readonly UnitRow[], today: string): boolean => unitInForce(code, units, today) != null;

/**
 * What starting preparation reads from the configuration on the organisation's day (6.12 review R-6): the
 * basis, its document parts and the copy recipients in force that day (a row "retired from" a later day is
 * still in force; the end is exclusive), and whether the legal office is a unit in force. The start act and
 * the Overview's "what would refuse it" both read this, so they never differ.
 */
export function preparationSettings<P extends { contractBasisCode: string; retiredOn: Date | null }, R extends { retiredOn: Date | null }, U extends UnitRow, B extends { code: string }>(
  cfg: { policy: { legalOfficeCode: string | null } | null; parts: readonly P[]; recipients: readonly R[]; units: readonly U[]; bases: readonly B[] },
  basisCode: string | null,
  today: string,
) {
  const basis = cfg.bases.find((b) => b.code === basisCode) ?? null;
  const parts = cfg.parts.filter((p) => p.contractBasisCode === basisCode && rowInForce(p, today));
  const recipients = cfg.recipients.filter((r) => rowInForce(r, today));
  // One lookup for the check and the name frozen: the row in force today.
  const office = unitInForce(cfg.policy?.legalOfficeCode ?? null, cfg.units, today);
  return { basis, parts, recipients, office, legalOfficeKnown: office != null };
}
