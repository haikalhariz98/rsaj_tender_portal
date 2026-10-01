/**
 * Briefings and site visits (FR-ADV-003 (e)/(f), FR-ADV-013; D8, OQ-03; 6.5 OD-8 refined).
 *
 * An event is optional, but a scheduled one has its day, time and place together. Whether any
 * event may be made mandatory is the customer's policy (`mandatoryAttendancePermitted`): while it
 * is not set, or no, no event is mandatory and none gates a sale — the screen says "Not mandatory:
 * mandatory attendance not set". Where it is permitted, every scheduled event answers the question
 * (unanswered blocks publication). A mandatory event gates the sale on the attendance register.
 * Pure.
 */

import { dayIn } from "@/lib/dates";

import type { EventFacts, Finding } from "./types";

export type EventFault = "EVENT_TIME_MISSING" | "EVENT_PLACE_MISSING" | "EVENT_AFTER_CLOSING" | "MANDATORY_NOT_PERMITTED" | "MANDATORY_NOT_ANSWERED" | "MANDATORY_NOT_OFFERED";

/// Whether the event's answer counts: only where the policy permits mandatory attendance.
export const isMandatory = (e: Pick<EventFacts, "mandatory" | "cancelled">, permitted: boolean | null) => permitted === true && e.mandatory === true && !e.cancelled;

/**
 * One scheduled event's faults against the policy and the closing. `permitted` null: not set.
 */
export function eventFaults(e: Pick<EventFacts, "kind" | "startsAt" | "place" | "mandatory" | "cancelled">, permitted: boolean | null, closingAt: Date | null): Finding<EventFault>[] {
  if (e.cancelled) return [];
  const out: Finding<EventFault>[] = [];
  const kind = e.kind;
  if (!e.startsAt) out.push({ code: "EVENT_TIME_MISSING", level: "block", data: { kind } });
  if (!e.place.trim()) out.push({ code: "EVENT_PLACE_MISSING", level: "block", data: { kind } });
  if (e.startsAt && closingAt && e.startsAt.getTime() >= closingAt.getTime()) out.push({ code: "EVENT_AFTER_CLOSING", level: "block", data: { kind } });
  if (e.mandatory === true && permitted !== true) out.push({ code: "MANDATORY_NOT_PERMITTED", level: "block", data: { kind, permitted: permitted == null ? "not set" : "no" } });
  if (permitted === true && e.mandatory == null) out.push({ code: "MANDATORY_NOT_ANSWERED", level: "block", data: { kind } });
  if (permitted !== true && e.mandatory !== true) out.push({ code: "MANDATORY_NOT_OFFERED", level: "info", data: { kind, permitted: permitted == null ? "not set" : "no" } });
  return out;
}

export type AttendanceFault = "ATTENDANCE_REQUIRED" | "EVENT_NOT_HELD";

/**
 * Whether a party may buy the documents as far as the mandatory events go (FR-ADV-013): absent
 * from a held mandatory event refuses; a mandatory event not yet held refuses too (the register is
 * not complete). Events not mandatory never refuse.
 */
export function attendanceFaults(partyId: string | null, events: readonly EventFacts[], permitted: boolean | null): Finding<AttendanceFault>[] {
  const out: Finding<AttendanceFault>[] = [];
  for (const e of events.filter((x) => isMandatory(x, permitted))) {
    if (!e.heldOn) out.push({ code: "EVENT_NOT_HELD", level: "block", data: { kind: e.kind } });
    else if (!partyId || !e.attendeePartyIds.includes(partyId)) out.push({ code: "ATTENDANCE_REQUIRED", level: "block", data: { kind: e.kind, heldOn: e.heldOn } });
  }
  return out;
}

export type HeldFault = "ALREADY_HELD" | "EVENT_CANCELLED" | "HELD_BEFORE_START" | "HELD_IN_FUTURE" | "TIME_ZONE_UNSET";

/// Marking an event held on a day: not before its start day, not after today, once.
export function heldFault(e: Pick<EventFacts, "startsAt" | "heldOn" | "cancelled">, heldOn: string, today: string | null, timeZone: string | null): Finding<HeldFault> | null {
  if (!today || !timeZone) return { code: "TIME_ZONE_UNSET", level: "block" };
  if (e.cancelled) return { code: "EVENT_CANCELLED", level: "block" };
  if (e.heldOn) return { code: "ALREADY_HELD", level: "block" };
  if (e.startsAt && heldOn < dayIn(e.startsAt, timeZone)) return { code: "HELD_BEFORE_START", level: "block" };
  if (heldOn > today) return { code: "HELD_IN_FUTURE", level: "block" };
  return null;
}

/// A CSV cell: quoted where it must be, never starting with a formula character.
function cell(v: string): string {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/**
 * The attendance register as CSV (FR-ADV-013, Lampiran E of the evaluation report): one line per
 * attendee, in the order recorded, with the event's heading lines. Words only, never codes.
 */
export function attendanceCsv(event: { kindLabel: string; startsText: string; place: string; heldText: string; mandatoryText: string; exerciseReference: string }, rows: readonly { name: string; registrationNo: string; representative: string; recordedBy: string; recordedText: string }[]): string {
  const lines = [
    ["Exercise", event.exerciseReference],
    ["Event", event.kindLabel],
    ["Starts", event.startsText],
    ["Place", event.place],
    ["Held on", event.heldText],
    ["Attendance", event.mandatoryText],
    [],
    ["No.", "Contractor", "Registration number", "Representative", "Recorded by (on their behalf, not signed)", "Recorded"],
    ...rows.map((r, i) => [String(i + 1), r.name, r.registrationNo, r.representative, r.recordedBy, r.recordedText]),
  ];
  return lines.map((l) => l.map(cell).join(",")).join("\r\n") + "\r\n";
}
