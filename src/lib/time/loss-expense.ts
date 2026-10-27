/**
 * Loss and expense (6.13 Part B run 1b: FR-EOT-006; OD-B20 as ruled, BD-613-88; BD-613-128 (2) act side). Pure.
 *
 * Recorded with what is claimed (from an EOT claim's pack, or on its own), valued (amount, basis, day), then sent on
 * `loss_expense` at the valued amount. Where the contract type names a claims committee, the route's committee step
 * must be it (CLAIMS_COMMITTEE_MISMATCH); unset with a committee step on the route warns. Only an approved claim enters
 * a 1.2 loss-and-expense line of the adjustment certificate.
 */

import { senToDecimalString, type Sen } from "@/lib/money";

import type { Day, Finding } from "./types";

export function lossRecordFaults(i: { claimed: Sen | null }): Finding[] {
  return i.claimed == null || i.claimed < 0n ? [{ code: "CLAIMED_REQUIRED", level: "block" }] : [];
}

export function lossValueFaults(i: { sent: boolean; valued: Sen | null; basis: string; valuedOn: Day | null; today: Day }): Finding[] {
  if (i.sent) return [{ code: "VALUED_ALREADY_SENT", level: "block" }];
  const out: Finding[] = [];
  if (i.valued == null || i.valued < 0n) out.push({ code: "VALUED_REQUIRED", level: "block" });
  if (!i.basis.trim()) out.push({ code: "VALUATION_BASIS_REQUIRED", level: "block" });
  if (!i.valuedOn) out.push({ code: "VALUED_REQUIRED", level: "block" });
  else if (i.valuedOn > i.today) out.push({ code: "FUTURE_DATE", level: "block", data: { day: i.valuedOn } });
  return out.filter((x, n) => out.findIndex((y) => y.code === x.code) === n);
}

export function lossSendFaults(i: { valued: Sen | null }): Finding[] {
  return i.valued == null ? [{ code: "NOT_VALUED", level: "block" }] : [];
}

/// OD-B20: the committee codes on the resolved chain against the type's claims committee (`claims`, null: not set).
export function claimsCommitteeFaults(chainCommittees: readonly string[], claims: { code: string; name: string } | null, nameOf: (code: string) => string): Finding[] {
  if (chainCommittees.length === 0) return [];
  if (!claims) return [{ code: "CLAIMS_COMMITTEE_NOT_SET", level: "warn" }];
  const other = chainCommittees.find((c) => c !== claims.code);
  return other ? [{ code: "CLAIMS_COMMITTEE_MISMATCH", level: "block", data: { committee: nameOf(other), claims: claims.name } }] : [];
}

/// Phase 2 close-out stage A: the claim is paid once (`adjustedOn`: the live adjustment that already names it), and never above the value
/// approved (`amount` against `valued`, where both are given).
export function lossLineFaults(i: { approved: boolean; label: string; adjustedOn?: string | null; amount?: Sen; valued?: Sen | null }): Finding[] {
  if (!i.approved) return [{ code: "LOSS_NOT_APPROVED", level: "block", data: { claim: i.label } }];
  const out: Finding[] = [];
  if (i.adjustedOn) out.push({ code: "LOSS_ALREADY_ADJUSTED", level: "block", data: { claim: i.label, adjustment: i.adjustedOn } });
  if (i.amount != null && i.valued != null && i.amount > i.valued) out.push({ code: "LOSS_ABOVE_APPROVED", level: "block", data: { claim: i.label, valued: senToDecimalString(i.valued) } });
  return out;
}
