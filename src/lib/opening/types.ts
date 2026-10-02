/**
 * The vocabulary of bid opening (spec §6.7, §7.1; plan 6.7 as ruled, C-1..C-13), as pure types. Mirrors
 * the Prisma enums so `src/lib/opening/**` stays free of the client, as the other lib modules do.
 * Every rule about an opening lives beside this file; actions and screens call it and never restate it.
 *
 * Nothing here is policy: the opening committee, the panel size, the independence rule, the
 * completeness and unpurchased-bid consequences, the invited-count reading and the Grand Summary's
 * labels are the customer's configuration, shipped empty. Unset is "not set", never zero, never a
 * default, and it blocks what it governs, naming the setting.
 *
 * Nobody signs in yet: every person named is recorded on their behalf, not signed (ADR 0017).
 */

import type { Provenance } from "@/lib/reference/types";

export type { Provenance };

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the words are written with (names, numbers, days as YYYY-MM-DD). Never a price.
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

export type OpeningKind = "MAIN" | "SUPPLEMENTARY";
export type ChecklistAnswer = "PRESENT" | "ABSENT" | "NOT_APPLICABLE";
export const CHECKLIST_ANSWERS: readonly ChecklistAnswer[] = ["PRESENT", "ABSENT", "NOT_APPLICABLE"];
export type OpeningVerdict = "PASS" | "REJECT";
export type SaleFinding = "LIVE_SALE" | "NO_LIVE_SALE" | "NOT_ON_INVITEE_LIST";
export type RestrictionFinding = "NOT_RESTRICTED" | "EVIDENCED" | "NOT_EVIDENCED";
export type InvitedCountReading = "PURCHASERS" | "INVITEES";
export type UnpurchasedConsequence = "ELIMINATE" | "REPORT";
export type CopyCheck = "MATCH" | "MISMATCH" | "NOT_IN_BOX";
export type AlternativeConsideration = "CONSIDERED" | "NOT_CONSIDERED";
export type PeriodUnit = "DAYS" | "WEEKS" | "MONTHS";
export const PERIOD_UNITS: readonly PeriodUnit[] = ["DAYS", "WEEKS", "MONTHS"];

/// Where an opening stands, derived from its record (never stored).
export type OpeningPhase =
  /// Started; the panel is assigned; the box (or the admitted envelope) not yet opened.
  | "AWAITING_AUTHORISATION"
  /// Opened; its sitting is authorised; envelopes are being opened and recorded.
  | "IN_PROGRESS"
  /// Adjourned: nothing is recorded until it is resumed and two members authorise again.
  | "ADJOURNED"
  /// Resumed after an adjournment; waiting for two fresh authorisations.
  | "AWAITING_REAUTHORISATION"
  | "FINALISED";

/// A rule's value as frozen on the opening, with where it came from.
export interface Ruled<T> {
  value: T | null;
  provenance: Provenance | null;
}
