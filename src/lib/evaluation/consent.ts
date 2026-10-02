/**
 * FR-BID-010 (6.6 OD-7, carried in): an applied validity extension stands on the consent of the party
 * the officer named when it was recorded ("not yet checked against an evaluation"). Issuing the report,
 * and the award, check the validity as it stands against the recommendation (6.8 re-review 2, the
 * lead's ruling; AGENTS.md rule 2, no dead end): only the extension that sets the current expiry — the
 * latest applied, which runs furthest — is judged. On another party's consent it blocks, with the exit
 * "record and apply an extension to a later day on the recommended tenderer's consent"; doing so makes
 * that extension the one in force, and the earlier ones are then superseded, recorded as such, never
 * judged again. The result is frozen with the report. Pure.
 */

import type { Finding } from "./types";

export type ConsentFault = "CONSENT_NOT_FROM_RECOMMENDED";
export type ConsentOutcome = "CHECKED" | "CONSENT_NOT_FROM_RECOMMENDED" | "SUPERSEDED";

export interface ConsentRow {
  extensionId: string;
  /// The day it moves the expiry to, for the record.
  toExpiry: string;
  consentPartyName: string;
  outcome: ConsentOutcome;
}

/// The words a report records for each applied extension.
export const CONSENT_OUTCOME_TEXT: Readonly<Record<ConsentOutcome, string>> = {
  CHECKED: "Checked: from the recommended tenderer",
  CONSENT_NOT_FROM_RECOMMENDED: "Not from the recommended tenderer",
  SUPERSEDED: "Superseded by a later extension: the validity no longer stands on it",
};

export function consentCheck(extensions: readonly { id: string; consentPartyId: string; consentPartyName: string; applied: boolean; toExpiry: string }[], recommendedPartyId: string | null): { rows: ConsentRow[]; faults: Finding<ConsentFault>[] } {
  const applied = extensions.filter((x) => x.applied);
  // The extension in force: the furthest expiry applied (each is applied only later than the one before); a tie, the later recorded.
  const governing = applied.reduce<(typeof applied)[number] | null>((g, x) => (g == null || x.toExpiry >= g.toExpiry ? x : g), null);
  const rows = applied.map((x): ConsentRow => ({
    extensionId: x.id,
    toExpiry: x.toExpiry,
    consentPartyName: x.consentPartyName,
    outcome: x !== governing ? "SUPERSEDED" : recommendedPartyId != null && x.consentPartyId === recommendedPartyId ? "CHECKED" : "CONSENT_NOT_FROM_RECOMMENDED",
  }));
  const faults = rows.filter((r) => r.outcome === "CONSENT_NOT_FROM_RECOMMENDED").map((r) => ({ code: "CONSENT_NOT_FROM_RECOMMENDED" as const, level: "block" as const, data: { party: r.consentPartyName, day: r.toExpiry } }));
  return { rows, faults };
}
