/**
 * The Overview's Key dates (founder, 2026-10-05): when tendering starts, when it closes, the
 * organisation's usual closing time, and the briefings and site visits. Pure: the stored rows
 * go in, the words come out, so a screen asks and renders and does no date arithmetic.
 *
 * A date is "approved" once the step that approves tendering has fixed it (`tenderingStartOn`,
 * `closingAt`), "proposed" while it is only what was entered when the documents were submitted,
 * and otherwise not yet given: that is said, never shown as a blank or a zero. An organisation's
 * closing time that nobody has configured is "not set", not midnight.
 */

import { clockTimeIn, dayIn, storedDay } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";
import type { Provenance } from "@/lib/reference/types";
import { SITE_EVENT_KIND_LABEL } from "@/lib/window/labels";
import type { SiteEventKind } from "@/lib/window/types";

/// The proposal stored on the exercise (SR-05, ruling 8) as the date rules and the form read it: the start and closing days and the closing time, in the organisation's zone.
export function proposedDatesOf(ex: { proposedStartOn: Date | null; proposedClosingAt: Date | null }, timeZone: string | null) {
  return {
    startOn: ex.proposedStartOn ? storedDay(ex.proposedStartOn) : null,
    closingDay: ex.proposedClosingAt && timeZone ? dayIn(ex.proposedClosingAt, timeZone) : null,
    closingTime: ex.proposedClosingAt && timeZone ? clockTimeIn(ex.proposedClosingAt, timeZone) : null,
  };
}

export type DateState = "APPROVED" | "PROPOSED" | "NOT_GIVEN" | "NOT_APPLICABLE";

export interface KeyDate {
  state: DateState;
  /// "Approved" or "Proposed" before the date; null where there is none yet.
  label: string | null;
  /// The date as the organisation reads it, or what it waits for.
  text: string;
}

export interface KeyDatesInput {
  /// A stored day (midnight UTC) and an instant: fixed when tendering was approved.
  tenderingStartOn: Date | null;
  /// The closing as the exercise holds it now (named `closing`: it is read here, never written).
  closing: Date | null;
  /// SR-05 (ruling 8): the dates proposed on Scope and estimate before submission, stored on the exercise. Read after the approved dates and a submitted pack's frozen proposal.
  proposed: { startOn: Date | null; closingAt: Date | null };
  /// The tender pack versions, newest first: only a proposal on the version now submitted counts. A returned
  /// version's proposal was refused, and a draft's is not entered until it is submitted (as the Tender documents tab).
  packs: readonly { versionNo: number; status: string; proposedStartOn: Date | null; proposedClosingAt: Date | null }[];
  /// The exercise issues no tender or quotation documents (the no-pack path): it has no window, so no dates to give.
  noPack: boolean;
  /// A briefing or site visit may be scheduled now (`windowEditFault` allows it).
  canSchedule: boolean;
  /// "HH:MM" and where it came from, as the window policy holds them.
  defaultClosingTime: string | null;
  closingTimeProvenance: Provenance | null;
  events: readonly { id: string; kind: SiteEventKind; startsAt: Date; place: string; mandatory: boolean | null; cancelledAt: Date | null }[];
  timeZone: string | null;
}

export const DATES_LOCKED_TEXT = "The dates are proposed before the documents are submitted. After that the proposal is frozen with them, and the approver records the dates tendering will run on.";
export const START_NOT_GIVEN = "Not entered yet: propose it before the documents are submitted";
export const CLOSING_NOT_GIVEN = "Not entered yet: propose it before the documents are submitted";
export const NO_WINDOW_TEXT = "Not applicable: this exercise has no tendering window";
export const NO_EVENTS_TEXT = "None scheduled";
export const CUTOFF_NOT_SET = "Not set";

export interface KeyDatesView {
  start: KeyDate;
  closing: KeyDate;
  /// The organisation's usual closing time; text null where it is not set.
  cutoff: { text: string | null; provenance: Provenance | null };
  events: { id: string; text: string }[];
  /// Whether to point the officer at scheduling one: only where the server would allow it.
  canSchedule: boolean;
}

export function keyDatesView(i: KeyDatesInput): KeyDatesView {
  const none: KeyDate = { state: "NOT_APPLICABLE", label: null, text: NO_WINDOW_TEXT };
  if (i.noPack) return { start: none, closing: none, cutoff: { text: null, provenance: null }, events: [], canSchedule: false };
  const proposed = i.packs.find((p) => p.status === "SUBMITTED" && (p.proposedStartOn != null || p.proposedClosingAt != null)) ?? null;
  const start: KeyDate = i.tenderingStartOn
    ? { state: "APPROVED", label: "Approved", text: formatDate(i.tenderingStartOn) }
    : proposed?.proposedStartOn
      ? { state: "PROPOSED", label: "Proposed", text: `${formatDate(proposed.proposedStartOn)} · version ${proposed.versionNo}` }
      : i.proposed.startOn
        ? { state: "PROPOSED", label: "Proposed", text: formatDate(i.proposed.startOn) }
        : { state: "NOT_GIVEN", label: null, text: START_NOT_GIVEN };
  const closing: KeyDate = i.closing
    ? { state: "APPROVED", label: "Approved", text: formatOrgDateTime(i.closing, i.timeZone) }
    : proposed?.proposedClosingAt
      ? { state: "PROPOSED", label: "Proposed", text: `${formatOrgDateTime(proposed.proposedClosingAt, i.timeZone)} · version ${proposed.versionNo}` }
      : i.proposed.closingAt
        ? { state: "PROPOSED", label: "Proposed", text: formatOrgDateTime(i.proposed.closingAt, i.timeZone) }
        : { state: "NOT_GIVEN", label: null, text: CLOSING_NOT_GIVEN };
  const events = i.events
    .filter((e) => e.cancelledAt == null)
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((e) => ({ id: e.id, text: `${SITE_EVENT_KIND_LABEL[e.kind]} · ${formatOrgDateTime(e.startsAt, i.timeZone)} · ${e.place.trim() || "place not recorded"}${e.mandatory === true ? " · attendance is mandatory" : ""}` }));
  const time = i.defaultClosingTime?.trim() ? i.defaultClosingTime.trim() : null;
  return { start, closing, cutoff: { text: time, provenance: time ? i.closingTimeProvenance : null }, events, canSchedule: i.canSchedule };
}
