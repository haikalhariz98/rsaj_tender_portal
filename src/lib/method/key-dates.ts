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

import { formatDate, formatOrgDateTime } from "@/lib/format";
import type { Provenance } from "@/lib/reference/types";
import { SITE_EVENT_KIND_LABEL } from "@/lib/window/labels";
import type { SiteEventKind } from "@/lib/window/types";

export type DateState = "APPROVED" | "PROPOSED" | "NOT_GIVEN";

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
  /// The tender pack versions, newest first (any status): only a proposal entered at submission counts.
  packs: readonly { versionNo: number; proposedStartOn: Date | null; proposedClosingAt: Date | null }[];
  /// "HH:MM" and where it came from, as the window policy holds them.
  defaultClosingTime: string | null;
  closingTimeProvenance: Provenance | null;
  events: readonly { id: string; kind: SiteEventKind; startsAt: Date; place: string; mandatory: boolean | null; cancelledAt: Date | null }[];
  timeZone: string | null;
}

export const START_NOT_GIVEN = "Proposed when the documents are submitted";
export const CLOSING_NOT_GIVEN = "Proposed when the documents are submitted";
export const NO_EVENTS_TEXT = "None scheduled";
export const CUTOFF_NOT_SET = "Not set";

export interface KeyDatesView {
  start: KeyDate;
  closing: KeyDate;
  /// The organisation's usual closing time; text null where it is not set.
  cutoff: { text: string | null; provenance: Provenance | null };
  events: { id: string; text: string }[];
}

export function keyDatesView(i: KeyDatesInput): KeyDatesView {
  const proposed = i.packs.find((p) => p.proposedStartOn != null || p.proposedClosingAt != null) ?? null;
  const start: KeyDate = i.tenderingStartOn
    ? { state: "APPROVED", label: "Approved", text: formatDate(i.tenderingStartOn) }
    : proposed?.proposedStartOn
      ? { state: "PROPOSED", label: "Proposed", text: `${formatDate(proposed.proposedStartOn)} · version ${proposed.versionNo}` }
      : { state: "NOT_GIVEN", label: null, text: START_NOT_GIVEN };
  const closing: KeyDate = i.closing
    ? { state: "APPROVED", label: "Approved", text: formatOrgDateTime(i.closing, i.timeZone) }
    : proposed?.proposedClosingAt
      ? { state: "PROPOSED", label: "Proposed", text: `${formatOrgDateTime(proposed.proposedClosingAt, i.timeZone)} · version ${proposed.versionNo}` }
      : { state: "NOT_GIVEN", label: null, text: CLOSING_NOT_GIVEN };
  const events = i.events
    .filter((e) => e.cancelledAt == null)
    .slice()
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .map((e) => ({ id: e.id, text: `${SITE_EVENT_KIND_LABEL[e.kind]} · ${formatOrgDateTime(e.startsAt, i.timeZone)} · ${e.place.trim() || "place not recorded"}${e.mandatory === true ? " · attendance is mandatory" : ""}` }));
  const time = i.defaultClosingTime?.trim() ? i.defaultClosingTime.trim() : null;
  return { start, closing, cutoff: { text: time, provenance: time ? i.closingTimeProvenance : null }, events };
}
