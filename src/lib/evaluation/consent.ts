/**
 * FR-BID-010 (6.6 OD-7, carried in): an applied validity extension stands on the consent of the party
 * the officer named when it was recorded ("not yet checked against an evaluation"). Issuing the report
 * re-checks each against the recommendation: a consent from any other party than the recommended
 * tenderer blocks, with the exit "record the recommended tenderer's consent". The result is frozen with
 * the report. Pure.
 */

import type { Finding } from "./types";

export type ConsentFault = "CONSENT_NOT_FROM_RECOMMENDED";
export type ConsentOutcome = "CHECKED" | "CONSENT_NOT_FROM_RECOMMENDED";

export interface ConsentRow {
  extensionId: string;
  /// The day it moves the expiry to, for the record.
  toExpiry: string;
  consentPartyName: string;
  outcome: ConsentOutcome;
}

export function consentCheck(extensions: readonly { id: string; consentPartyId: string; consentPartyName: string; applied: boolean; toExpiry: string }[], recommendedPartyId: string | null): { rows: ConsentRow[]; faults: Finding<ConsentFault>[] } {
  const rows = extensions
    .filter((x) => x.applied)
    .map((x) => ({ extensionId: x.id, toExpiry: x.toExpiry, consentPartyName: x.consentPartyName, outcome: (recommendedPartyId != null && x.consentPartyId === recommendedPartyId ? "CHECKED" : "CONSENT_NOT_FROM_RECOMMENDED") as ConsentOutcome }));
  const faults = rows.filter((r) => r.outcome !== "CHECKED").map((r) => ({ code: "CONSENT_NOT_FROM_RECOMMENDED" as const, level: "block" as const, data: { party: r.consentPartyName, day: r.toExpiry } }));
  return { rows, faults };
}
