/**
 * Whether a contract-controls row or the legal office is in force on the organisation's day (6.12 review
 * R-6). A row retired "from" a day stops being offered on that day, not before it: the end is exclusive, as
 * every effective period in the project is (`src/lib/effective.ts`). A row retired from next month is still
 * offered today; one retired from today is not.
 */

import { dayToDate } from "@/lib/dates";
import { hasEnded } from "@/lib/effective";

/// A row with a "retired from" day, in force on `today` (the organisation's day, YYYY-MM-DD).
export const rowInForce = (row: { retiredOn: Date | null }, today: string): boolean => !hasEnded({ effectiveTo: row.retiredOn }, dayToDate(today));

/// Whether the configured legal office is a unit of the organisation's structure in force on `today`.
export function legalOfficeKnown(code: string | null | undefined, units: readonly { code: string; effectiveTo: Date | null }[], today: string): boolean {
  if (!code) return false;
  return units.some((u) => u.code === code && !hasEnded(u, dayToDate(today)));
}

/**
 * What starting preparation reads from the configuration on the organisation's day (6.12 review R-6): the
 * basis, its document parts and the copy recipients in force that day (a row "retired from" a later day is
 * still in force; the end is exclusive), and whether the legal office is a unit in force. The start act and
 * the Overview's "what would refuse it" both read this, so they never differ.
 */
export function preparationSettings<P extends { contractBasisCode: string; retiredOn: Date | null }, R extends { retiredOn: Date | null }, U extends { code: string; effectiveTo: Date | null }, B extends { code: string }>(
  cfg: { policy: { legalOfficeCode: string | null } | null; parts: readonly P[]; recipients: readonly R[]; units: readonly U[]; bases: readonly B[] },
  basisCode: string | null,
  today: string,
) {
  const basis = cfg.bases.find((b) => b.code === basisCode) ?? null;
  const parts = cfg.parts.filter((p) => p.contractBasisCode === basisCode && rowInForce(p, today));
  const recipients = cfg.recipients.filter((r) => rowInForce(r, today));
  const code = cfg.policy?.legalOfficeCode ?? null;
  const known = legalOfficeKnown(code, cfg.units, today);
  const office = known ? (cfg.units.find((u) => u.code === code) ?? null) : null;
  return { basis, parts, recipients, office, legalOfficeKnown: known };
}
