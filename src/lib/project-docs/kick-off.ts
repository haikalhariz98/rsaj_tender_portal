/**
 * The contract's kick-off meeting (ADR 0042 D10, PW-18, PW-29; plan step 7 §8.2): what refuses each of its three acts, who may be ticked as attending, and how
 * the card reads it. Judged on the rows the act read under the meeting's lock (`kick-off-store.ts`); every refusal the database would give is caught here first
 * (the meeting's trigger PA045 and its commit-time check, the attendance trigger PA046, the CHECKs and the unique keys of migration 20261123000000 are the
 * backstop, never the first word). Each function returns every fault it finds, never only the first, so the form can show them together. Pure: time is a
 * parameter (`today`, the organisation's day), never the clock.
 *
 * - One meeting per contract (ALREADY_SCHEDULED), from EXECUTED: the act x status row PROJECT_WORKSPACE refuses before it, and is asked by the caller.
 * - Changed only before it is held (HELD); then frozen.
 * - Recorded held in one act (PW-29): a held day not after today, at least one attendee, and the minutes (at least one file). The minutes become an ordinary
 *   Project document of the organisation with no approver, so the contractor sees them at once.
 * - Authority is PW-5's (`mayActForOrganisation`), handed in as `authorityToday`.
 * - The Integrity Pact briefing is NOT here: the card asks `briefingMissing` (`src/lib/contract/sign.ts`) itself, unchanged (PW-18).
 *
 * The length bounds below are technical constants (they keep a field to what a screen and a printout hold), not customer policy, like `TITLE_MAX` (`faults.ts`).
 */

import { dayIn, isDay } from "@/lib/dates";

import { faultText } from "./labels";
import type { Finding } from "./types";

export type KickOffFault =
  | "NO_AUTHORITY"
  | "ALREADY_SCHEDULED"
  | "HELD"
  | "NOT_SCHEDULED"
  | "WHEN_REQUIRED"
  | "PLACE_OR_LINK_REQUIRED"
  | "AGENDA_REQUIRED"
  | "TOO_LONG"
  | "NO_MINUTES"
  | "NO_ATTENDANCE"
  | "HELD_IN_FUTURE";

/// The most characters of a place, an online link, an agenda and another attendee's name. Technical bounds, not policy.
export const PLACE_MAX = 200;
export const LINK_MAX = 500;
export const AGENDA_MAX = 4000;
export const ATTENDEE_NAME_MAX = 200;

/// The title the minutes are filed under, as a Project document (PW-18).
export const MINUTES_TITLE = "Kick-off meeting minutes";

const blank = (s: string) => s.trim().length === 0;

function collector() {
  const out: Finding<KickOffFault>[] = [];
  const add = (code: KickOffFault, data?: Finding<KickOffFault>["data"]) => out.push(data ? { code, level: "block", data } : { code, level: "block" });
  return { out, add };
}

type Arrangement = { meetsAt: Date | null; place: string; onlineLink: string; agenda: string };

/// When, where and the agenda, as scheduling and changing both judge them. TOO_LONG says which field (`data.field`: "place", "onlineLink", "agenda") and its limit.
function arrangementFaults(i: Arrangement, add: (code: KickOffFault, data?: Finding<KickOffFault>["data"]) => void): void {
  if (i.meetsAt === null || Number.isNaN(i.meetsAt.getTime())) add("WHEN_REQUIRED");
  if (blank(i.place) && blank(i.onlineLink)) add("PLACE_OR_LINK_REQUIRED");
  if (blank(i.agenda)) add("AGENDA_REQUIRED");
  if (i.place.trim().length > PLACE_MAX) add("TOO_LONG", { field: "place", limit: PLACE_MAX });
  if (i.onlineLink.trim().length > LINK_MAX) add("TOO_LONG", { field: "onlineLink", limit: LINK_MAX });
  if (i.agenda.trim().length > AGENDA_MAX) add("TOO_LONG", { field: "agenda", limit: AGENDA_MAX });
}

/// Scheduling the meeting: one per contract, with a time, a place or a plain-text online link, and an agenda.
export function scheduleFaults(i: { authorityToday: boolean; exists: boolean } & Arrangement): Finding<KickOffFault>[] {
  const { out, add } = collector();
  if (!i.authorityToday) add("NO_AUTHORITY");
  if (i.exists) add("ALREADY_SCHEDULED");
  arrangementFaults(i, add);
  return out;
}

/// Changing when, where or the agenda: only before it is held (the trigger refuses any change after, a no-op included).
export function changeFaults(i: { authorityToday: boolean; held: boolean } & Arrangement): Finding<KickOffFault>[] {
  const { out, add } = collector();
  if (!i.authorityToday) add("NO_AUTHORITY");
  if (i.held) add("HELD");
  arrangementFaults(i, add);
  return out;
}

/**
 * Recording it held (PW-29): a scheduled meeting not yet held, the day it was held (not after today: HELD_IN_FUTURE; the meeting's own day may be later or
 * earlier, as it was), who attended (at least one, after `attendanceOf` de-duplicates), and the minutes' files (at least one). `heldOn` and `today` are
 * YYYY-MM-DD, the organisation's days; an unreadable `heldOn` reads as missing.
 */
export function heldFaults(i: { authorityToday: boolean; scheduled: boolean; held: boolean; heldOn: string | null; today: string; attendees: number; minutesFiles: number }): Finding<KickOffFault>[] {
  const { out, add } = collector();
  if (!i.authorityToday) add("NO_AUTHORITY");
  if (!i.scheduled) add("NOT_SCHEDULED");
  if (i.held) add("HELD");
  if (i.heldOn === null || !isDay(i.heldOn)) add("WHEN_REQUIRED", { field: "heldOn" });
  else if (i.heldOn > i.today) add("HELD_IN_FUTURE");
  if (i.attendees < 1) add("NO_ATTENDANCE");
  if (i.minutesFiles < 1) add("NO_MINUTES");
  return out;
}

// ------------------------------------------------------------------ who attended

/// One attendance row as the schema holds it (the CHECKs of migration 20261123000000): an organisation person, a contractor account, or another name.
export type AttendeeRow = { side: "ORGANISATION"; personId: string } | { side: "CONTRACTOR"; supplierAccountId: string } | { side: null; name: string };

/**
 * The attendance a form ticked, made into rows: each person and each account once (the unique keys would refuse a second), each other name trimmed and once
 * (compared without case and inner spacing), blank ones dropped. A name longer than `ATTENDEE_NAME_MAX` is TOO_LONG (`data.field` "attendee"). Whether each
 * person is the organisation's and each account the awardee's is read by the store, which knows the rows.
 */
export function attendanceOf(i: { personIds: readonly string[]; accountIds: readonly string[]; otherNames: readonly string[] }): { rows: AttendeeRow[]; faults: Finding<KickOffFault>[] } {
  const { out, add } = collector();
  const rows: AttendeeRow[] = [];
  for (const personId of new Set(i.personIds.map((x) => x.trim()).filter((x) => x !== ""))) rows.push({ side: "ORGANISATION", personId });
  for (const supplierAccountId of new Set(i.accountIds.map((x) => x.trim()).filter((x) => x !== ""))) rows.push({ side: "CONTRACTOR", supplierAccountId });
  const seen = new Set<string>();
  let long = false;
  for (const raw of i.otherNames) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (name === "") continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (name.length > ATTENDEE_NAME_MAX) long = true;
    rows.push({ side: null, name });
  }
  if (long) add("TOO_LONG", { field: "attendee", limit: ATTENDEE_NAME_MAX });
  return { rows, faults: out };
}

// ------------------------------------------------------------------ how the card reads it

/**
 * Where the meeting stands, for its card (PW-29):
 * - NOT_SCHEDULED: no meeting yet;
 * - UPCOMING: scheduled, and its day (in the organisation's zone) is today or later. A meeting later today is still upcoming;
 * - NOT_RECORDED_AS_HELD: scheduled, its day has passed (the day after it, and every day after), and nobody has recorded it held. Never "upcoming";
 * - HELD: recorded held;
 * - SCHEDULED: scheduled, and the organisation's day is not known (no time zone): neither upcoming nor passed is claimed.
 */
export type KickOffState = "NOT_SCHEDULED" | "UPCOMING" | "NOT_RECORDED_AS_HELD" | "HELD" | "SCHEDULED";

export function kickOffState(m: { meetsAt: Date; held: boolean } | null, today: string | null, timeZone: string | null): KickOffState {
  if (!m) return "NOT_SCHEDULED";
  if (m.held) return "HELD";
  if (!today || !timeZone) return "SCHEDULED";
  return dayIn(m.meetsAt, timeZone) < today ? "NOT_RECORDED_AS_HELD" : "UPCOMING";
}

export const KICK_OFF_STATE_WORDS: Readonly<Record<KickOffState, string>> = {
  NOT_SCHEDULED: "Not scheduled",
  UPCOMING: "Scheduled",
  NOT_RECORDED_AS_HELD: "Not recorded as held",
  HELD: "Held",
  SCHEDULED: "Scheduled",
};

/// The badge's tone: a meeting whose day passed unrecorded is a warning; held is done.
export const KICK_OFF_STATE_TONE: Readonly<Record<KickOffState, "neutral" | "info" | "warn" | "ok">> = {
  NOT_SCHEDULED: "neutral",
  UPCOMING: "info",
  NOT_RECORDED_AS_HELD: "warn",
  HELD: "ok",
  SCHEDULED: "info",
};

// ------------------------------------------------------------------ words

const FIELD_WORDS: Readonly<Record<string, string>> = { place: "The place", onlineLink: "The online link", agenda: "The agenda", attendee: "A name" };
const NO_AUTHORITY_WORDS = "the S.O., someone acting as the S.O., or a representative whose letter covers communicating with the contractor";

/// A kick-off refusal in words; null for a code that is not the meeting's own (the caller words it, as the document's acts do).
export function kickOffFaultText(f: Finding): string | null {
  const d = f.data ?? {};
  switch (f.code) {
    case "NO_AUTHORITY":
      return `Only ${NO_AUTHORITY_WORDS} can do this today.`;
    case "ALREADY_SCHEDULED":
      return "The kick-off meeting is already scheduled. Change it instead.";
    case "HELD":
      return "The kick-off meeting is recorded as held, so it no longer changes.";
    case "NOT_SCHEDULED":
      return "Schedule the kick-off meeting first.";
    case "WHEN_REQUIRED":
      return d.field === "heldOn" ? "Give the day it was held." : "Give the day and the time.";
    case "PLACE_OR_LINK_REQUIRED":
      return "Give the place, or an online link.";
    case "AGENDA_REQUIRED":
      return "Give the agenda.";
    case "TOO_LONG":
      return `${FIELD_WORDS[String(d.field)] ?? "A field"} is longer than ${String(d.limit)} characters. Shorten it.`;
    case "NO_MINUTES":
      return "Add the minutes: at least one file.";
    case "NO_ATTENDANCE":
      return "Tick who attended, or add their names.";
    case "HELD_IN_FUTURE":
      return "The day it was held cannot be after today.";
    case "ATTENDEE_UNKNOWN":
      return "Someone ticked as attending is not on either side of this contract. Reload, and tick again.";
    case "NO_CONTRACTOR":
      return "This contract's award names no contractor on the register, so no portal account can be ticked. Add their names instead.";
    default:
      return null;
  }
}

/// A refusal of a kick-off act in words: the lead, then each fault's words, the meeting's own or (for the minutes' document and its files) the workspace's.
export const kickOffRefusalText = (faults: readonly Finding[], orgName = "the organisation"): string => ["Not done:", ...faults.map((f) => kickOffFaultText(f) ?? faultText(f, orgName))].join(" ");
