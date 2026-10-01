/**
 * The vocabulary of the invitation window (spec §6.5, §7.1), as pure types. Mirrors the Prisma
 * enums so `src/lib/window/**` stays free of the client, as the other lib modules do. Every rule
 * about the window lives beside this file; actions and screens call it and never restate it.
 *
 * Nothing here is policy: every figure, day, channel, floor, calendar and template is the
 * customer's configuration (`WindowPolicyFacts` and friends), shipped empty. Unset is "not set",
 * never zero and never a default (AGENTS.md rules 1 and 2).
 */

import type { Provenance } from "@/lib/reference/types";

export type { Provenance };

export type Level = "block" | "warn" | "info";

export interface Finding<C extends string = string> {
  code: C;
  level: Level;
  /// Values the words are written with (labels, days as YYYY-MM-DD, money as sen strings, counts).
  data?: Record<string, string | number | null>;
}

export const blocking = <C extends string>(fs: readonly Finding<C>[]) => fs.filter((f) => f.level === "block");

export type WindowPath = "ADVERTISED" | "INVITED";
export const WINDOW_PATHS: readonly WindowPath[] = ["ADVERTISED", "INVITED"];
export type FeeCostKind = "PAPER_A4" | "PAPER_A3" | "PAPER_A1" | "PAPER_A0" | "COPYING" | "BINDING" | "ADMIN" | "OTHER";
export const FEE_COST_KINDS: readonly FeeCostKind[] = ["PAPER_A4", "PAPER_A3", "PAPER_A1", "PAPER_A0", "COPYING", "BINDING", "ADMIN", "OTHER"];
export type SiteEventKind = "BRIEFING" | "SITE_VISIT";
export const SITE_EVENT_KINDS: readonly SiteEventKind[] = ["BRIEFING", "SITE_VISIT"];
export type CertSighted = "ORIGINAL" | "CERTIFIED_COPY" | "NOT_SHOWN";
export const CERT_SIGHTED: readonly CertSighted[] = ["ORIGINAL", "CERTIFIED_COPY", "NOT_SHOWN"];
export type CheckState = "NOT_CHECKED" | "CLEAR" | "FAILED";
export const CHECK_STATES: readonly CheckState[] = ["NOT_CHECKED", "CLEAR", "FAILED"];
export type PartySource = "PROPOSED_INVITEE" | "ATTENDEE" | "PURCHASER";
export const PARTY_SOURCES: readonly PartySource[] = ["PROPOSED_INVITEE", "ATTENDEE", "PURCHASER"];
export type AdvertisementDayRule = "LATEST_REQUIRED_CHANNEL" | "NAMED_CHANNEL";
export const ADVERTISEMENT_DAY_RULES: readonly AdvertisementDayRule[] = ["LATEST_REQUIRED_CHANNEL", "NAMED_CHANNEL"];
export type ClosingChangeKind = "CORRECTION" | "EXTENSION";
export const CLOSING_CHANGE_KINDS: readonly ClosingChangeKind[] = ["CORRECTION", "EXTENSION"];
export type AddendumStatus = "DRAFT" | "ISSUED" | "VOID";
export const ADDENDUM_STATUSES: readonly AddendumStatus[] = ["DRAFT", "ISSUED", "VOID"];
export type DeliveryMethod = "REGISTERED_POST" | "COLLECTION" | "BY_HAND";
export const DELIVERY_METHODS: readonly DeliveryMethod[] = ["REGISTERED_POST", "COLLECTION", "BY_HAND"];

/// The organisation's window rules as the lib reads them. Every null is "not set".
export interface WindowPolicyFacts {
  minAdvertisementDays: number | null;
  targetAdvertisementDays: number | null;
  newspaperWarnDays: number | null;
  purchaseCutoffDays: number | null;
  dateRulesProvenance: Provenance | null;
  defaultClosingTime: string | null;
  closingTimeProvenance: Provenance | null;
  advertisementDayRule: AdvertisementDayRule | null;
  advertisementChannelId: string | null;
  dayRuleProvenance: Provenance | null;
  calendarId: string | null;
  mandatoryAttendancePermitted: boolean | null;
  attendanceProvenance: Provenance | null;
  noticeTemplateId: string | null;
  invitationTemplateId: string | null;
  addendumTemplateId: string | null;
  /// The written source the date rules are cited by (e.g. a clause of the customer's SOP). Empty: no citation.
  dateRuleSource: string;
}

/// No policy row: every rule not set.
export const UNSET_WINDOW_POLICY: WindowPolicyFacts = {
  minAdvertisementDays: null,
  targetAdvertisementDays: null,
  newspaperWarnDays: null,
  purchaseCutoffDays: null,
  dateRulesProvenance: null,
  defaultClosingTime: null,
  closingTimeProvenance: null,
  advertisementDayRule: null,
  advertisementChannelId: null,
  dayRuleProvenance: null,
  calendarId: null,
  mandatoryAttendancePermitted: null,
  attendanceProvenance: null,
  noticeTemplateId: null,
  invitationTemplateId: null,
  addendumTemplateId: null,
  dateRuleSource: "",
};

/// A maintained holiday calendar. Days are YYYY-MM-DD.
export interface CalendarFacts {
  id: string;
  name: string;
  /// ISO weekdays, 1 Monday to 7 Sunday. Empty: not set.
  weekendDays: readonly number[];
  years: readonly { year: number; complete: boolean }[];
  holidays: readonly { day: string; nameEn: string }[];
}

export interface ChannelFacts {
  id: string;
  nameEn: string;
  /// Null: not set, and publication is refused naming it.
  requiredWhenAdvertised: boolean | null;
  /// The day it was retired, YYYY-MM-DD. A retired channel stays on old records only.
  retiredOn: string | null;
}

export interface PublicationFacts {
  channelId: string;
  /// YYYY-MM-DD.
  publishedOn: string;
}

export interface FeeFloorFacts {
  regime: string;
  minimum: bigint;
}

/// A site event (briefing or site visit) as the rules read it.
export interface EventFacts {
  id: string;
  kind: SiteEventKind;
  /// Null where the form gave no day or time.
  startsAt: Date | null;
  place: string;
  mandatory: boolean | null;
  /// YYYY-MM-DD, or null while not held.
  heldOn: string | null;
  cancelled: boolean;
  /// The parties recorded as attending.
  attendeePartyIds: readonly string[];
}
