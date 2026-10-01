# 0014 — The invitation window's phase is derived from stored instants; only acts are statuses

**Status:** proposed 2026-10-01 with 6.5, under ruling OD-2 A (`docs/notes/plans/6.5-invitation-window.md` §8;
decisions log "· 6.5 ·" entry) and X-2, X-8, X-9, X-11 (`docs/notes/plans/phase2-rulings.md`).

## Context

§7.3.2 draws the exercise after Approved for tendering as Advertised / Invited → Open for purchase → Closed for purchase →
Open for submission → Closed. Of those, only two are acts somebody performs: publishing (advertising, or issuing the letters
of invitation) and, later, cancelling. The others happen because a day arrives: the first day of sale, the day after the
last day of sale, the closing instant. The product has no scheduler, and nothing in it runs at midnight. A stored
"Open for purchase" would be true only until somebody or something rewrote it, and every screen and act reading it in
between would be wrong without saying so. 6.4 already stores the closing as an instant (`SourcingExercise.closingAt`, X-2)
and the window stores its first and last days of sale.

## Decision

1. **Statuses record acts only.** `ExerciseStatus` gains ADVERTISED and INVITED (each in its own migration before use, X-6),
   entered from APPROVED_FOR_TENDERING only by the publication act (`via: PUBLICATION`), and left only to CANCELLED by the
   window's cancellation act (`via: WINDOW_CANCELLATION`) once its route is approved. `ExerciseWindow` has no status column.
2. **The phase is a pure function of instants.** `windowPhase(status, purchaseFromDay, purchaseCloseDay, closingAt, now,
   timeZone)` (`src/lib/window/phase.ts`) returns NOT_PUBLISHED, PUBLISHED, OPEN_FOR_PURCHASE, CLOSED_FOR_PURCHASE, CLOSED,
   CANCELLED or UNKNOWN. Cancelled wins; the closing is an instant judged without a zone (14:30:00 is closed); the purchase
   days are days in the organisation's zone. With no zone set, a day-based phase is UNKNOWN, never UTC: an unset zone is not
   a zone, and acts that depend on the phase refuse under it.
3. **Every read and every write derives it, now.** Screens derive it at render; each window act derives it under its locks
   (requisition → exercise → window → the register it writes) from the locked rows and the server's clock, never from the
   form. The sale is open only in OPEN_FOR_PURCHASE; an addendum is drafted and issued only while published and not closed;
   a sale is voided only before CLOSED (X-11); the award gate (X-9, interim until 6.7) reads CLOSED with no window change
   pending. FR-DOC-010's Tender Table Document availability is derived from the same phase.
4. **The closing moves only by an applied change.** A correction (before publication) or an extension (after) is a
   `ClosingChange` on the engine's `window_change` route; the step that completes the route re-runs the date rules under the
   window's lock and, only then, writes `closingAt` (the closing's second writer, by name in the source scan, X-2) and the
   last day of sale. The closing's history is the approved pack's dates followed by each applied change, and its last entry
   is the exercise's closing (`closingHistory`, `closingConsistent`).

## Consequences

- No job, cron or queue is needed, and none can fall behind: the phase is right whenever it is read.
- A list or report filtering by phase cannot use a column; it derives the phase per row (bounded by the published
  exercises), or filters on the stored instants that define it.
- An act refused because the phase moved while a form was open says so with the phase it found; nothing is half-applied.
- 6.6 and 6.7 read the same function (submission open, opening after closing) rather than adding states for time.
- A day-based phase needs the organisation's zone; an organisation without one sees UNKNOWN and is told to set it.
