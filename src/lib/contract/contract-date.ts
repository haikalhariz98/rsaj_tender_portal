/**
 * The Contract Date (FR-CON-009, OD-1 A): the day the RSAJ officer signs, derived, never keyed.
 *
 * The system knows the signature as the act that records it, so the Contract Date is the organisation's
 * day of that act's server instant. A signature recorded late is corrected in the open, never keyed
 * silently: an audited correction to an earlier day only, with a reason, never before the day the
 * contract was first ready to sign (frozen with the signature), and the screen says "corrected from …".
 */

import { dayOf } from "@/lib/dates";

import type { Finding } from "./types";

/// The organisation's day of the signature act; null with no time zone (never UTC's day).
export const contractDateOf = (actAt: Date, timeZone: string | null): string | null => dayOf(actAt, timeZone);

/**
 * The first day the contract was ready to sign, as the facts it was judged on say: the latest of the days
 * each condition was met (the endorsement, the instrument's return, each verification, the recorded check,
 * the resolution). Null where none is known.
 */
export function readySince(days: readonly (string | null)[]): string | null {
  const known = days.filter((d): d is string => !!d).sort();
  return known.length ? known[known.length - 1] : null;
}

export type DateCorrectionFault = "NOT_EXECUTED" | "NOT_EARLIER" | "BEFORE_READY" | "READY_DAY_NOT_FROZEN" | "REASON_REQUIRED" | "BEFORE_CONTRACTOR_SIGNED";

/**
 * A correction of the Contract Date: to an earlier day only, not before the day it was ready to sign, not
 * before the contractor signed (nor the witness, where recorded: 6.12 review M-1, as frozen with the RSAJ
 * signature), with a reason. `signed` is the days frozen with the signature; the act always gives them.
 */
export function dateCorrectionFaults(i: { executed: boolean; current: string | null; proposed: string; readySince: string | null; reason: string; signed?: { contractor: string | null; witness: string | null } }): Finding<DateCorrectionFault>[] {
  if (!i.executed || !i.current) return [{ code: "NOT_EXECUTED", level: "block" }];
  const out: Finding<DateCorrectionFault>[] = [];
  if (i.proposed >= i.current) out.push({ code: "NOT_EARLIER", level: "block", data: { current: i.current } });
  if (!i.readySince) out.push({ code: "READY_DAY_NOT_FROZEN", level: "block" });
  else if (i.proposed < i.readySince) out.push({ code: "BEFORE_READY", level: "block", data: { readySince: i.readySince } });
  // The employer signs after the contractor (FR-CON-007): never a Contract Date before the contractor's signature, or its witness's.
  if (i.signed?.contractor && i.proposed < i.signed.contractor) out.push({ code: "BEFORE_CONTRACTOR_SIGNED", level: "block", data: { party: "CONTRACTOR", signedOn: i.signed.contractor } });
  else if (i.signed?.witness && i.proposed < i.signed.witness) out.push({ code: "BEFORE_CONTRACTOR_SIGNED", level: "block", data: { party: "WITNESS", signedOn: i.signed.witness } });
  if (!i.reason.trim()) out.push({ code: "REASON_REQUIRED", level: "block" });
  return out;
}
