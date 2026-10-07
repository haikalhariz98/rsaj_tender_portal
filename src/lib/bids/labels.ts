/**
 * Every word bid receipt puts on a screen: enum labels and the text of every finding. Codes never
 * reach a screen (AGENTS.md rule 5): a screen renders `bidFindingText`, never `f.code`. Every
 * refusal names what to do or where to set it.
 */

import { dayIn } from "@/lib/dates";
import { formatDate, formatOrgDateTime } from "@/lib/format";

import type { AdmissionState } from "./late";
import type { AlternativeStatus } from "./alternatives";
import type { Competition } from "./count";
import type { CompletenessConsequence } from "./completeness";
import type { EnvelopeChannel, EnvelopeKind, EnvelopeStatus, Finding, ReceiptSource } from "./types";

/// Where the register is acted on, as a screen names it (6.7 OD-8: the tab is "Bids and opening", its first section Received; review S-2).
export const RECEIVED_SECTION = "the Received section of Bids and opening";

export const ENVELOPE_KIND_LABEL: Readonly<Record<EnvelopeKind, string>> = {
  BID: "Bid",
  ALTERNATIVE: "Alternative bid",
  COMPANY_ESTIMATE: "Company estimate",
};

export const CHANNEL_LABEL: Readonly<Record<EnvelopeChannel, string>> = {
  COUNTER: "Over the counter",
  POST: "By post",
  COURIER: "By courier",
  BOX: "In the tender box",
};

/// What the trail says about a receipt's recording (S-1b): receivedAt is always the server's
/// stamp (OD-3), so a receipt recorded after the event says only that, never "not server-stamped".
export const SOURCE_LABEL: Readonly<Record<ReceiptSource, string>> = {
  SERVER: "Server-stamped",
  ENTERED: "Recorded after the event",
  // 6.7 (C-3 b): a bid found in the box at opening is timed by the box's lock, never a receipt time.
  BOX_AT_OPENING: "In the box when it was locked",
};

export const ENVELOPE_STATUS_LABEL: Readonly<Record<EnvelopeStatus, string>> = {
  RECEIVED: "Received",
  WITHDRAWN: "Withdrawn",
  OPENED: "Opened",
};

export const ADMISSION_LABEL: Readonly<Record<AdmissionState, string>> = {
  NOT_TABLED: "Not tabled",
  PENDING: "Pending at a sitting",
  DEFERRED: "Deferred",
  ADMITTED: "Admitted",
  NOT_ADMITTED: "Not admitted",
};

export const COMPETITION_LABEL: Readonly<Record<Competition, string>> = {
  MET: "Meets the minimum",
  BELOW_MINIMUM: "Below the minimum",
  SINGLE: "A single bid",
  MINIMUM_NOT_SET: "Minimum not set",
};

export const COMPETITION_TEXT: Readonly<Record<Competition, string>> = {
  MET: "At least the method's minimum number of bids. Shown, never blocking.",
  BELOW_MINIMUM: "Fewer bids than the method's minimum. Shown to the committee, never blocking.",
  SINGLE: "Only one bid. It proceeds, and the committee is told.",
  MINIMUM_NOT_SET: "The method's minimum number of bids is not set, so whether competition is adequate is not judged. Set it under Configuration › Invitation.",
};

export const ALTERNATIVE_LABEL: Readonly<Record<AlternativeStatus, string>> = {
  CONSIDERED: "Alternatives permitted: considered",
  NOT_CONSIDERED: "Alternatives not permitted: recorded, not considered",
  NOT_STATED: "Whether alternatives are permitted is not stated",
};

export const CONSEQUENCE_LABEL: Readonly<Record<CompletenessConsequence, string>> = {
  ELIMINATED: "An incomplete bid is eliminated",
  REPORTED: "An incomplete bid is reported to the committee",
  CONSEQUENCE_NOT_SET: "Not set: an opening cannot be finalised until it is",
};

export const RETURN_LABEL = { NOT_WITHDRAWN: "", HELD_UNOPENED: "Held unopened", RETURNED_UNOPENED: "Returned unopened" } as const;

/// The §0.1 statement the tab opens with.
export const REGISTER_STATEMENT = {
  title: "The portal records envelopes, not offers",
  body: "Nothing priced is held before opening: no price, sum, period or document from a bid is entered here, and the box and its key remain the control. Bids are not submitted electronically: the electronic tender box arrives in Phase 3, with sign-in.",
};

/// What the register cannot claim (§0.1), said on the tab.
export const REGISTER_GAPS = [
  "Reading the register is not restricted by who is signed in: that comes with the rules for a restricted exercise.",
  "No alert is sent: there is no delivery yet. Alerts are shown here.",
  "The company estimate is held plain in the database, never shown before opening; sealed storage arrives with the electronic tender box.",
];

/**
 * The register's receipt time is always the server's recording stamp (OD-3 as amended), on every
 * row, including one recorded after the event. What the officer states about an earlier receipt is
 * the officer's statement, shown as such beside it and never judged (S-1 of the 6.6 review).
 */
export const RECORDING_STAMP_LABEL = "Server's recording time";
/// The chip on an envelope recorded after the event: the stamp is still the server's; the recording came later.
export const RECORDED_LATER_LABEL = "Recorded after the event";
/// The officer's statement on an envelope recorded after the event, in the officer's own terms.
export function officerStatement(stated: string | null, reason: string | null): string {
  return `The officer's statement: received ${stated ?? "at a time not recorded"}. Why it was recorded after the event: ${reason ?? "not recorded"}.`;
}

/**
 * The checklist card (6.6 review S-5): the parts the approved documents mark mandatory, plus each
 * issued addendum. Which of them a bidder returns is not modelled yet (6.7 adds it per part, with
 * provenance); until then the card says so rather than calling the list what a bid must contain.
 */
export const CHECKLIST_TITLE = "Parts the approved documents mark mandatory";
export const CHECKLIST_RETURN_NOT_SET = "Which of these a bidder returns is not set; the check at opening waits for it.";

/// The withdrawal drawer's hint (6.6 CR-4): quote what identifies the envelope, never who the bidder is.
export const WITHDRAWAL_QUOTE_HINT = "Quote how the letter identifies the envelope (the tender's title, number and markings). Leave the company's name out; bidders are named at the opening.";
/// What the Withdrawals card's SULIT label covers: the letter and the quote taken from it (6.6 CR-4).
export const WITHDRAWAL_SULIT_LABEL = "SULIT: the letter and the quote from it";

/// An instant on the organisation's clock, to the second: lateness is judged to the second, so a receipt is shown to it.
export function receiptTime(at: Date | null, timeZone: string | null): string {
  if (!at) return "—";
  if (!timeZone) return formatOrgDateTime(at, null);
  const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZone }).format(at);
  return `${formatDate(dayIn(at, timeZone))} · ${time}`;
}

const d = (f: Finding, k: string) => f.data?.[k] ?? null;
/// A published exercise's committee, unset as frozen (CR-2): no "set it", since a later setting does not apply.
const frozenCommitteeText = (source: unknown) =>
  source === "NOT_RECORDED"
    ? "The committee that decides late admission was not recorded when this exercise's window was published, so it reads as not set; a later setting under Configuration › Invitation does not apply to it."
    : "The committee that decides late admission was not set for this exercise's method when its window was published; a later setting under Configuration › Invitation does not apply to it.";
const day = (v: unknown) => (typeof v === "string" && v ? formatDate(v) : "a day not recorded");

export function bidFindingText(f: Finding): string {
  switch (f.code) {
    // ---- the exercise
    case "TIME_ZONE_UNSET":
      return "The organisation's time zone is not set, so receipts cannot be dated. Set it under Configuration › Organisation.";
    case "CLOSING_NOT_SET":
      return "The exercise has no closing recorded, so lateness cannot be judged. The closing is written when the documents are approved for tendering.";
    case "NOT_PUBLISHED":
      return "The exercise is not advertised or invited yet: envelopes are received once it is published.";
    case "CANCELLED":
    case "EXERCISE_CANCELLED":
      return "The exercise is cancelled, so its register stands as it is.";
    case "AFTER_OPENING":
      return "The box has been opened for the opening: the register is now the opening's.";
    // ---- receipt
    case "PERSON_REQUIRED":
      return "Name the officer, an active person on record.";
    case "MARKINGS_REQUIRED":
      return "Write the markings as they appear on the envelope.";
    case "CHANNEL_NOT_FOR_OFFICER":
      return "An envelope in the tender box is registered at the opening, not here. Record envelopes handed over the counter, by post or by courier.";
    case "KIND_NOT_FOR_RECEIPT":
      return "The company estimate is lodged from its own tab (Scope and estimate › Company estimate), never received as an envelope here.";
    case "ENTERED_NOT_BEFORE_RECORDING":
      return "The stated time must be before now: an envelope received now is recorded with Record a receipt now.";
    case "BEFORE_WINDOW":
      return "The stated time is before the exercise was published, when no bid could be received.";
    case "REASON_REQUIRED":
      return "Give the reason.";
    case "PARENT_ONLY_FOR_ALTERNATIVE":
      return "Only an alternative bid names the envelope it goes with.";
    case "PARENT_NOT_A_BID":
      return "The envelope named is not a bid on this exercise.";
    case "RECORDED_AFTER_CLOSING":
      return "Recorded after the closing, so it is late. It is kept, counted apart and goes to the committee for admission.";
    case "STATED_BEFORE_CLOSING":
      return "The officer states it was received before the closing; the server recorded it after, so it is late. The committee sees both and decides.";
    // ---- withdrawal
    case "AFTER_CLOSING":
      return "The closing has passed: a withdrawal is accepted only before it.";
    case "ENVELOPE_LATE":
      return "That envelope arrived after the closing, so it cannot be withdrawn: its admission is for the committee.";
    case "ALREADY_WITHDRAWN":
      return "That envelope is already withdrawn.";
    case "NOT_A_BID":
      return "The company estimate is not a bid: it is never withdrawn, corrected or tabled for admission here.";
    case "NOT_WITHDRAWN":
      return "Only a withdrawn envelope is handed back unopened.";
    case "ALREADY_RETURNED":
      return "It was already handed back.";
    case "DAY_IN_FUTURE":
      return "The day cannot be after today.";
    case "BEFORE_WITHDRAWAL":
      return "The day cannot be before the withdrawal was received.";
    // ---- correction
    case "CORRECTION_CLOSED":
      return "The closing has passed: after it nothing on the register changes.";
    case "IMMUTABLE_FIELD":
      return "The received time, the sequence, the late flag and the kind are never corrected. Only the markings, the channel and the receiving officer are.";
    case "NOTHING_CHANGED":
      return "Nothing was changed.";
    case "WITHDRAWN":
      return "The envelope is withdrawn and stands as it was recorded.";
    // ---- box
    case "BEFORE_CLOSING":
      return "The box is locked at or after the closing, not before.";
    case "ALREADY_LOCKED":
      return "The box is already recorded as locked.";
    case "OPENED":
      return "The box has been opened for the opening.";
    // ---- late admission
    case "LATE_UNDECIDED": {
      const n = Number(d(f, "count") ?? 0);
      const lead = `${n} late ${n === 1 ? "envelope waits" : "envelopes wait"} for the committee's decision on admission.`;
      // Said on the Received section itself ("here": yes), the way to act is below, not "in the Received section" (6.7 review S-2).
      const where = d(f, "here") === "yes" ? "below" : `in ${RECEIVED_SECTION}`;
      const which = n === 1 ? "it" : "each";
      if (d(f, "committeeSet") === "no" && d(f, "asPublished")) return `${lead} ${frozenCommitteeText(d(f, "asPublished"))}`;
      return d(f, "committeeSet") === "no"
        ? `${lead} The committee that decides it is not set: set it on the sourcing method under Configuration › Invitation, then table ${which} ${where}.`
        : `${lead} Table ${which} ${where}; it is decided at the sitting, either way.`;
    }
    case "COMMITTEE_NOT_SET":
      if (d(f, "asPublished")) return frozenCommitteeText(d(f, "asPublished"));
      return "The committee that decides late admission is not set for this method. Set it under Configuration › Invitation; it is never read as a refusal.";
    case "NOT_LATE":
      return "The envelope was received in time: only a late one goes for admission.";
    case "ALREADY_TABLED":
      return d(f, "sitting") ? `Its admission is already tabled at ${d(f, "sitting")}.` : "Its admission is already tabled.";
    case "ALREADY_DECIDED":
      return "Its admission is already decided.";
    case "OTHER_COMMITTEE":
      return "That sitting is not of the committee the method names for late admission.";
    case "SITTING_CLOSED":
      return "That sitting no longer takes matters.";
    // ---- validity
    case "VALIDITY_NOT_SET":
      return `The bids' validity is not set on the window, so whether they are still valid cannot be judged. Record the days the tender documents state in ${RECEIVED_SECTION}.`;
    case "BID_VALIDITY_EXPIRED":
      return `The bids' validity expired on ${day(d(f, "expiry"))}. Record an extension, with the recommended tenderer's consent, in ${RECEIVED_SECTION}.`;
    case "VALIDITY_NOT_JUDGED":
      return d(f, "why") === "NO_CLOSING" ? "The exercise has no closing, so the bids' validity cannot be counted." : "The organisation's time zone is not set, so the bids' validity cannot be judged. Set it under Configuration › Organisation.";
    case "NOT_CLOSED":
      return "The validity runs from the closing: it is extended only after the closing.";
    case "NOT_LATER":
      return `The new expiry must be after the one that stands (${day(d(f, "current"))}).`;
    case "PARTY_REQUIRED":
      return "Name the tenderer whose consent it rests on.";
    case "NOT_RECOMMENDED":
      return "Only the recommended tenderer's consent is recorded.";
    case "CONSENT_DAY_REQUIRED":
      return "Give the day the consent was received.";
    case "CONSENT_DAY_IN_FUTURE":
      return "The consent cannot be received after today.";
    case "PENDING_EXISTS":
      return "An extension is already recorded and not yet applied: apply it, once its consent is attached, before recording another.";
    case "ALREADY_APPLIED":
      return "The extension is already applied.";
    case "CONSENT_REQUIRED":
      return "Attach the tenderer's written consent first.";
    // ---- estimate
    case "LODGEMENT_CLOSED":
      return "The closing has passed, so the estimate can no longer go into the box.";
    // ---- completeness
    case "CONSEQUENCE_NOT_SET":
      return "What follows from an incomplete bid is not set for this method. Set it under Configuration › Invitation; an opening cannot be finalised until it is.";
    // ---- window answers
    case "WINDOW_NOT_EDITABLE":
      return "The window's answers are prepared before publication and frozen once it is published.";
    case "VALIDITY_ALREADY_SET":
      return "The validity was set before publication and stands as the documents state it.";
    case "DAYS_REQUIRED":
      return "Give the days the tender documents state.";
    case "PROVENANCE_REQUIRED":
      return "Say where the days came from.";
    default:
      return "This cannot be done now.";
  }
}
