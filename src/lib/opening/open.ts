/**
 * Opening an envelope (FR-OPN-005, FR-BID-006, OD-2, X-11). Once the box is opened and the sitting
 * authorised, each envelope is opened in turn and given the next listing number (Bil.) — opening
 * order across the exercise's openings, never the receipt sequence. The bidder is named here for the
 * first time (OD-2: only `openEnvelope` writes an envelope's party), picked from the exercise's
 * parties or added as named at opening. Its offer is read: price, completion period, validity stated.
 *
 * Never opened: the company estimate's envelope (never a bid); an envelope matched to a withdrawal
 * ("Withdrawn, not opened"); a late envelope at the main opening (its admission is a committee's; a
 * carried one is opened at a supplementary opening, which opens only that envelope).
 *
 * An alternative (FR-BID-006) is marked by the envelope's face or found inside an opened envelope;
 * it is considered or not by the window's frozen answer (`alternativeStatus`), and where the
 * documents do not say whether alternatives are permitted, none can be marked. Pure.
 */

import { alternativeStatus } from "@/lib/bids/alternatives";
import type { EnvelopeKind, EnvelopeStatus } from "@/lib/bids/types";
import type { Sen } from "@/lib/money";

import { actFaults, type ActFault, type OpeningState } from "./state";
import type { AlternativeConsideration, Finding } from "./types";

export type OpenFault =
  | ActFault
  | "ENVELOPE_NOT_FOUND"
  | "ESTIMATE_NOT_A_BID"
  | "ALREADY_OPENED"
  | "OPEN_REFUSED_WITHDRAWN"
  | "LATE_NOT_ADMITTED"
  | "NOT_THE_ADMITTED_ENVELOPE"
  | "ALTERNATIVES_NOT_STATED"
  | "PARENT_NOT_OPENED"
  | "PRICE_REQUIRED"
  | "BIDDER_REQUIRED"
  | "REGISTRATION_REQUIRED"
  | "PARTY_EXISTS"
  | "PERIOD_INCOMPLETE";

export interface EnvelopeToOpen {
  id: string;
  kind: EnvelopeKind;
  status: EnvelopeStatus;
  late: boolean;
}

export interface BidderInput {
  /// An existing party of the exercise, or null to add one named at opening.
  partyId: string | null;
  /// For a party added at opening.
  name: string;
  registrationNo: string;
  /// A party with that registration number already on the exercise (it must be picked instead).
  registrationTaken: boolean;
}

export function openFaults(i: {
  state: OpeningState;
  envelope: EnvelopeToOpen | null;
  /// The withdrawal naming it, if any.
  withdrawn: boolean;
  /// SUPPLEMENTARY: the envelope its carried admission names.
  admittedEnvelopeId: string | null;
  bidder: BidderInput;
  price: Sen | null;
  period: { value: number | null; unit: string | null };
  /// Marked as an alternative: by the envelope's kind, or found inside it.
  isAlternative: boolean;
  /// The window's frozen answer (FR-BID-006): null is not stated.
  alternativesPermitted: boolean | null;
  /// An alternative's parent, where named: an opened main offer of this exercise.
  parent: { opened: boolean } | null;
}): Finding<OpenFault>[] {
  const out: Finding<OpenFault>[] = [...actFaults(i.state)];
  const f = (code: OpenFault) => out.push({ code, level: "block" });
  const e = i.envelope;
  if (!e) return [...out, { code: "ENVELOPE_NOT_FOUND", level: "block" }];
  if (e.kind === "COMPANY_ESTIMATE") return [...out, { code: "ESTIMATE_NOT_A_BID", level: "block" }];
  if (e.status === "OPENED") f("ALREADY_OPENED");
  if (i.withdrawn || e.status === "WITHDRAWN") f("OPEN_REFUSED_WITHDRAWN");
  if (i.state.kind === "MAIN" && e.late) f("LATE_NOT_ADMITTED");
  if (i.state.kind === "SUPPLEMENTARY" && e.id !== i.admittedEnvelopeId) f("NOT_THE_ADMITTED_ENVELOPE");
  if (i.isAlternative && i.alternativesPermitted == null) f("ALTERNATIVES_NOT_STATED");
  if (i.parent && !i.parent.opened) f("PARENT_NOT_OPENED");
  if (i.price == null) f("PRICE_REQUIRED");
  if (!i.bidder.partyId) {
    if (!i.bidder.name.trim()) f("BIDDER_REQUIRED");
    if (!i.bidder.registrationNo.trim()) f("REGISTRATION_REQUIRED");
    else if (i.bidder.registrationTaken) f("PARTY_EXISTS");
  }
  if ((i.period.value == null) !== (i.period.unit == null)) f("PERIOD_INCOMPLETE");
  return out;
}

/// The next Bil.: after every offer read on the exercise, at any of its openings.
export const nextListingNo = (listed: readonly number[]) => listed.reduce((n, x) => Math.max(n, x), 0) + 1;

/// An alternative's status under the window's frozen answer; null for a main offer.
export function alternativeOf(isAlternative: boolean, permitted: boolean | null): AlternativeConsideration | null {
  if (!isAlternative) return null;
  const s = alternativeStatus(permitted);
  return s === "NOT_STATED" ? null : s;
}

export type AlternativeInsideFault = ActFault | "MAIN_NOT_OPENED" | "ALTERNATIVES_NOT_STATED" | "PRICE_REQUIRED" | "PERIOD_INCOMPLETE" | "NOT_THIS_OPENING";

/// An alternative found inside an envelope already opened at this opening: the same bidder, its own offer.
export function alternativeInsideFaults(i: { state: OpeningState; main: { openingMatches: boolean; isAlternative: boolean } | null; alternativesPermitted: boolean | null; price: Sen | null; period: { value: number | null; unit: string | null } }): Finding<AlternativeInsideFault>[] {
  const out: Finding<AlternativeInsideFault>[] = [...actFaults(i.state)];
  const f = (code: AlternativeInsideFault) => out.push({ code, level: "block" });
  if (!i.main || i.main.isAlternative) f("MAIN_NOT_OPENED");
  else if (!i.main.openingMatches) f("NOT_THIS_OPENING");
  if (i.alternativesPermitted == null) f("ALTERNATIVES_NOT_STATED");
  if (i.price == null) f("PRICE_REQUIRED");
  if ((i.period.value == null) !== (i.period.unit == null)) f("PERIOD_INCOMPLETE");
  return out;
}

export type CorrectionFault = ActFault | "REASON_REQUIRED" | "NOTHING_CHANGED" | "PRICE_REQUIRED" | "PERIOD_INCOMPLETE" | "NOT_THIS_OPENING";

/// OD-10: a keying slip in what was read is corrected before finalising, with the reason, audited before and after.
export function correctionFaults(i: { state: OpeningState; sameOpening: boolean; reason: string; changed: boolean; price: Sen | null; period: { value: number | null; unit: string | null } }): Finding<CorrectionFault>[] {
  const out: Finding<CorrectionFault>[] = [...actFaults(i.state)];
  const f = (code: CorrectionFault) => out.push({ code, level: "block" });
  if (!i.sameOpening) f("NOT_THIS_OPENING");
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (i.price == null) f("PRICE_REQUIRED");
  if ((i.period.value == null) !== (i.period.unit == null)) f("PERIOD_INCOMPLETE");
  if (!i.changed) f("NOTHING_CHANGED");
  return out;
}
