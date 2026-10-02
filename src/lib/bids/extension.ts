/**
 * Extending the bids' validity (FR-BID-010; OD-7). An extension is recorded with the reason, the
 * new expiry, the tenderer whose written consent it rests on and the day the consent arrived; the
 * consent is attached (purpose VALIDITY_CONSENT), and only then is it applied. Append-only: the
 * latest applied extension governs. Allowed after expiry (§7.3.2: Validity Expired returns to Under
 * Evaluation on an extension), never before the closing (the validity runs from it).
 *
 * Only the recommended tenderer's consent is recorded. Before 6.8 forms a recommendation the officer
 * names the party, attested, "not yet checked against an evaluation"; once the version in force names
 * one, another party is refused at recording and at applying (NOT_RECOMMENDED; 6.8 fix M-1). Pure.
 */

import { isLate } from "./lateness";
import type { Finding } from "./types";

export type ExtensionFault =
  | "CANCELLED"
  | "TIME_ZONE_UNSET"
  | "NOT_CLOSED"
  | "VALIDITY_NOT_SET"
  | "NOT_LATER"
  | "REASON_REQUIRED"
  | "PARTY_REQUIRED"
  | "NOT_RECOMMENDED"
  | "CONSENT_DAY_REQUIRED"
  | "CONSENT_DAY_IN_FUTURE"
  | "PENDING_EXISTS"
  | "PERSON_REQUIRED";

export function extensionFaults(i: {
  cancelled: boolean;
  closing: Date | null;
  now: Date;
  today: string | null;
  /// The expiry that governs now (`validityState().expiry`); null where the validity is not set.
  currentExpiry: string | null;
  toExpiry: string | null;
  reason: string;
  /// The party named exists on the exercise.
  partyKnown: boolean;
  partyId: string | null;
  /// 6.8's recommended party, once it exists. Null: no recommendation yet (attested, not checked).
  recommendedPartyId: string | null;
  consentReceivedOn: string | null;
  /// An extension is recorded and not yet applied.
  pendingExists: boolean;
  personActive: boolean;
}): Finding<ExtensionFault>[] {
  const out: Finding<ExtensionFault>[] = [];
  const f = (code: ExtensionFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.cancelled) return [{ code: "CANCELLED", level: "block" }];
  if (!i.today) f("TIME_ZONE_UNSET");
  if (!i.closing || !isLate(i.now, i.closing)) f("NOT_CLOSED");
  if (i.currentExpiry == null) f("VALIDITY_NOT_SET");
  else if (!i.toExpiry || i.toExpiry <= i.currentExpiry) f("NOT_LATER", { current: i.currentExpiry });
  if (!i.reason.trim()) f("REASON_REQUIRED");
  if (!i.partyId || !i.partyKnown) f("PARTY_REQUIRED");
  else if (i.recommendedPartyId != null && i.recommendedPartyId !== i.partyId) f("NOT_RECOMMENDED");
  if (!i.consentReceivedOn) f("CONSENT_DAY_REQUIRED");
  else if (i.today && i.consentReceivedOn > i.today) f("CONSENT_DAY_IN_FUTURE");
  if (i.pendingExists) f("PENDING_EXISTS");
  if (!i.personActive) f("PERSON_REQUIRED");
  return out;
}

export type ApplyFault = "CANCELLED" | "ALREADY_APPLIED" | "CONSENT_REQUIRED" | "NOT_LATER" | "NOT_RECOMMENDED";

/**
 * Applying a recorded extension: once, with its consent attached, and still later than the expiry
 * that governs. 6.8 fix M-1: once 6.8 names a recommended tenderer, an extension recorded on another
 * party's consent (before the recommendation existed) is not applied (NOT_RECOMMENDED). `consent`
 * absent: not judged (fixtures from before 6.8); `recordValidityExtension`'s caller always states it.
 */
export function applyFaults(i: { cancelled: boolean; appliedAt: Date | null; liveConsents: number; toExpiry: string; currentExpiry: string | null; consent?: { partyId: string; recommendedPartyId: string | null } }): Finding<ApplyFault>[] {
  const out: Finding<ApplyFault>[] = [];
  const f = (code: ApplyFault, data?: Finding["data"]) => out.push({ code, level: "block", ...(data ? { data } : {}) });
  if (i.cancelled) f("CANCELLED");
  if (i.appliedAt) f("ALREADY_APPLIED");
  if (i.liveConsents === 0) f("CONSENT_REQUIRED");
  if (i.currentExpiry != null && i.toExpiry <= i.currentExpiry) f("NOT_LATER", { current: i.currentExpiry });
  if (i.consent && i.consent.recommendedPartyId != null && i.consent.recommendedPartyId !== i.consent.partyId) f("NOT_RECOMMENDED");
  return out;
}

/// What the screen says of the named tenderer before 6.8 exists (OD-7).
export const RECOMMENDED_ATTESTED = "named by the officer as the recommended tenderer, recorded on their behalf, not yet checked against an evaluation";
