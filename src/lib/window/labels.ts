/**
 * The words for everything `src/lib/window/**` returns as a key. Codes never reach a screen
 * (AGENTS.md rule 5): each finding, state and enum has its text here, tested. A refusal names
 * what to do or where the setting is (LESSONS: a refusal is never a dead end); a date rule's
 * message cites the policy's configured source where one is recorded (NFR-USE-002).
 */

import { formatDay } from "@/lib/award/fields";
import { formatMoney } from "@/lib/money";

import type { AddendumStatus, AdvertisementDayRule, CertSighted, CheckState, ClosingChangeKind, DeliveryMethod, FeeCostKind, Finding, PartySource, SiteEventKind, WindowPath } from "./types";
import type { PolicySetting } from "./dates";
import type { TableAvailability, WindowPhase } from "./phase";
import type { ChangeRouteState } from "./change";
import type { NotifiedState } from "./addendum";

const SETTINGS = "Configuration, Invitation controls";

export const PATH_LABEL: Record<WindowPath, string> = { ADVERTISED: "Advertised", INVITED: "By invitation" };
export const FEE_COST_KIND_LABEL: Record<FeeCostKind, string> = {
  PAPER_A4: "A4 paper",
  PAPER_A3: "A3 paper",
  PAPER_A1: "A1 paper",
  PAPER_A0: "A0 paper",
  COPYING: "Copying",
  BINDING: "Binding, with the folding of drawings",
  ADMIN: "Administration",
  OTHER: "Other cost",
};
export const SITE_EVENT_KIND_LABEL: Record<SiteEventKind, string> = { BRIEFING: "Tender briefing", SITE_VISIT: "Site visit" };
export const CERT_SIGHTED_LABEL: Record<CertSighted, string> = { ORIGINAL: "Original shown", CERTIFIED_COPY: "Certified copy shown", NOT_SHOWN: "Not shown" };
export const CHECK_STATE_LABEL: Record<CheckState, string> = {
  NOT_CHECKED: "Not checked: the supplier register is not built yet",
  CLEAR: "Checked: clear",
  FAILED: "Failed",
};
export const PARTY_SOURCE_LABEL: Record<PartySource, string> = { PROPOSED_INVITEE: "Proposed for invitation", ATTENDEE: "Attended an event", PURCHASER: "Bought the documents" };
export const DAY_RULE_LABEL: Record<AdvertisementDayRule, string> = {
  LATEST_REQUIRED_CHANNEL: "The latest day among the required channels",
  NAMED_CHANNEL: "The day of one named channel",
};
export const CLOSING_CHANGE_KIND_LABEL: Record<ClosingChangeKind, string> = { CORRECTION: "Correction before publication", EXTENSION: "Extension" };
export const ADDENDUM_STATUS_LABEL: Record<AddendumStatus, string> = { DRAFT: "Draft", ISSUED: "Issued", VOID: "Voided" };
export const DELIVERY_METHOD_LABEL: Record<DeliveryMethod, string> = { REGISTERED_POST: "Registered post", COLLECTION: "Collected", BY_HAND: "By hand" };

/// One label per phase (ADR 0014): derived, never stored.
export const PHASE_LABEL: Record<WindowPhase, string> = {
  NOT_PUBLISHED: "Not yet published",
  PUBLISHED: "Published; sale not yet open",
  OPEN_FOR_PURCHASE: "Open for purchase",
  CLOSED_FOR_PURCHASE: "Closed for purchase; open for submission",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
  UNKNOWN: "Not known: the organisation's time zone or the window's days are not set",
};
export const PHASE_TONE: Record<WindowPhase, "neutral" | "info" | "brand" | "ok" | "warn"> = {
  NOT_PUBLISHED: "neutral",
  PUBLISHED: "info",
  OPEN_FOR_PURCHASE: "brand",
  CLOSED_FOR_PURCHASE: "brand",
  CLOSED: "ok",
  CANCELLED: "neutral",
  UNKNOWN: "warn",
};
/// FR-DOC-010: the Tender Table Document's availability, from the phase.
export const TABLE_AVAILABILITY_LABEL: Record<TableAvailability, string> = {
  NOT_YET: "Not yet available: available for inspection from publication to the closing",
  AVAILABLE: "Available for inspection until the closing",
  WITHDRAWN: "Withdrawn: the window has closed",
  UNKNOWN: "Not known: the organisation's time zone or the window's days are not set",
};
export const NOTIFIED_LABEL: Record<NotifiedState, string> = { NO_RECIPIENTS: "No purchasers to notify", COMPLETE: "Every recipient notified", OUTSTANDING: "Not every recipient notified yet" };
export const CHANGE_ROUTE_TEXT: Record<ChangeRouteState, string> = {
  RESOLVED: "Resolved",
  NO_METHOD_KEY: "This method is not tied to any approval rule, so nobody can be shown as approving a change to its window. Set its approval matrix method under Reference data.",
  NO_RULE: "No approval rule says who approves a change to the invitation window for this method. Add one to the approval matrix (domain for window changes), then ask again.",
  HAS_COMMITTEE_STEP: "The route for a change to the invitation window includes a committee step, which cannot yet be discharged for a window change. Change the rule so that offices decide it.",
};

/// The policy's settings, as the configuration screen names them.
export const SETTING_LABEL: Record<PolicySetting, string> = {
  minAdvertisementDays: "the minimum days from advertisement to closing",
  targetAdvertisementDays: "the target days from advertisement to closing",
  newspaperWarnDays: "the margin for a late newspaper",
  purchaseCutoffDays: "the days between the last day of sale and the closing",
  defaultClosingTime: "the default closing time",
  advertisementDayRule: "which publication day is the advertisement day",
  calendar: "the holiday calendar",
  mandatoryAttendancePermitted: "whether attendance may be made mandatory",
};

const WEEKDAY = ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const day = (d: unknown) => (typeof d === "string" && d ? formatDay(d, "EN") : "that day");
const money = (s: unknown) => (typeof s === "string" && s ? formatMoney(BigInt(s)) : "the amount");
const cite = (source: unknown) => (typeof source === "string" && source.trim() ? ` (${source.trim()})` : "");
const kindOf = (k: unknown) => (k === "BRIEFING" || k === "SITE_VISIT" ? SITE_EVENT_KIND_LABEL[k].toLowerCase() : "event");
const instrumentOf = (i: unknown) => (i === "INVITATION" ? "letter of invitation" : i === "ADDENDUM" ? "addendum" : "published notice");
const TEMPLATE_SETTING = `Choose its template, and write its text, under ${SETTINGS} and Configuration, Templates.`;

/// The text of a window finding. Every code any window rule returns has its own words here.
export function windowFindingText(f: Finding): string {
  const d = f.data ?? {};
  switch (f.code) {
    // ---- the clock and the organisation
    case "TIME_ZONE_UNSET":
      return "The organisation's time zone is not set, so no day can be judged. Set it under Configuration, Organisation.";

    // ---- the advertisement day and channels (FR-ADV-001, OD-3)
    case "RULE_NOT_SET":
      return `Not set: ${SETTING_LABEL[d.setting as PolicySetting] ?? "a rule of the window"}. Set it under ${SETTINGS}.`;
    case "CHANNELS_NOT_SET":
      return `No publication channel is required for an advertised exercise, so none can be advertised. Add the channels and say which are required under ${SETTINGS}.`;
    case "CHANNEL_REQUIREMENT_NOT_SET":
      return `Whether ${d.channel ?? "a channel"} is required for an advertised exercise is not set. Say so under ${SETTINGS}.`;
    case "CHANNEL_MISSING":
      return `Not yet published through ${d.channel ?? "a required channel"}: an advertised exercise is published through every required channel. Record its publication.`;
    case "NAMED_CHANNEL_NOT_REQUIRED":
      return `The advertisement day is taken from ${d.channel ? `${d.channel}` : "a named channel"}, which is not a required channel. Name a required channel, or change the rule, under ${SETTINGS}.`;
    case "PUBLICATION_IN_FUTURE":
      return `The publication through ${d.channel ?? "a channel"} is recorded on ${day(d.day)}, after today. Record a publication once it has appeared.`;
    case "PUBLIC_CHANNEL_ON_INVITED":
      return "An exercise by invitation is not published on any public channel. Remove the publications recorded for it.";

    // ---- the closing (FR-ADV-004–007, OD-7)
    case "CALENDAR_NOT_SET":
      return `No holiday calendar is chosen, so a closing date cannot be checked against weekends and public holidays. Choose one under ${SETTINGS}.`;
    case "WEEKEND_NOT_SET":
      return `The weekend days of ${d.calendar ?? "the holiday calendar"} are not set. Set them under ${SETTINGS}.`;
    case "CALENDAR_NOT_MAINTAINED":
      return `The public holidays of ${d.year ?? "the closing's year"} in ${d.calendar ?? "the holiday calendar"} are not maintained in full, so the closing date cannot be checked. Complete that year under ${SETTINGS}.`;
    case "CLOSING_ON_WEEKEND":
      return `The closing date must not fall on a weekend or a public holiday${cite(d.source)}: ${day(d.day)} is a ${WEEKDAY[Number(d.weekday)] ?? "weekend day"}. Choose another closing date.`;
    case "PUBLIC_HOLIDAY":
      return `The closing date must not fall on a weekend or a public holiday${cite(d.source)}: ${day(d.day)} is ${d.holiday ?? "a public holiday"} in ${d.calendar ?? "the holiday calendar"}. Choose another closing date.`;
    case "CLOSING_TOO_SOON":
      return `The closing date must be at least ${d.min} days after the advertisement date${cite(d.source)}: it is ${d.days} days after ${day(d.advertisedOn)}. Move the closing later.`;
    case "BELOW_TARGET":
      return `The closing date is ${d.days} days after the advertisement date, below the target of ${d.target} days.`;
    case "NEAR_NEWSPAPER_DAY":
      return `The closing date is close to the newspaper's day: a newspaper later than expected by ${Number(d.margin) + 1} day${Number(d.margin) + 1 === 1 ? "" : "s"} would breach the minimum (margin set: ${d.warn} days).`;
    case "ADVERTISEMENT_DAY_NOT_KNOWN":
      return "The advertisement date is not known yet, so the days to the closing are checked at publication.";
    case "TIME_NOT_DEFAULT":
      return `The closing time ${d.time} is not the default ${d.default}. Give the reason for another time, or correct the closing.`;
    case "TIME_DIFFERS":
      return `The closing time ${d.time} differs from the default ${d.default}: ${d.reason}`;
    case "PURCHASE_CLOSE_NOT_SET":
      return "The last day the documents are sold is not set. Set it on the window.";
    case "PURCHASE_CUTOFF_TOO_LATE":
      return `The last day of sale must be at least ${d.cutoff} days before the closing date${cite(d.source)}: ${day(d.day)} is too late for a closing on ${day(d.closingDay)}.`;
    case "PURCHASE_CLOSE_IN_PAST":
      return `The last day of sale, ${day(d.day)}, has passed.`;

    // ---- the notice's items (FR-ADV-003) and publication
    case "NOT_APPROVED_FOR_TENDERING":
      return "The exercise is published only once its tender documents are approved for tendering, with the start and closing recorded.";
    case "NO_TENDER_DOCUMENTS":
      return "This exercise assembles no tender or quotation documents, so it has no invitation window.";
    case "PATH_NOT_SET":
      return "The sourcing method does not say whether it is advertised or goes to named invitees (it says both, or neither). Set it on the method under Reference data.";
    case "PATH_CHANGED":
      return `The method now says the exercise is ${d.now === "INVITED" ? "by invitation" : "advertised"}, but its window was prepared ${d.was === "INVITED" ? "by invitation" : "for advertisement"}. Correct the method, or cancel and replace the exercise.`;
    case "RESTRICTION_NOT_ANSWERED":
      return "Whether the tender is restricted is not answered. Answer it on the Tender documents tab.";
    case "STAMP_NOT_SET":
      return "The tender is restricted, but the stamp's words are not set in the language the text is issued in. Set them under Configuration, Tender documents.";
    case "ELIGIBILITY_MISSING":
      return "The registrations a contractor must hold are not stated (the notice's item a). State them on the Tender documents tab.";
    case "INSPECTION_PLACE_MISSING":
      return "Where the Tender Table Document is inspected is not stated (item b).";
    case "PURCHASE_PLACE_MISSING":
      return "Where the documents are bought is not stated (item b).";
    case "INSPECTION_HOURS_MISSING":
      return "The hours of inspection and purchase are not stated (item c).";
    case "PURCHASE_FROM_NOT_SET":
      return "The first day the documents are sold is not set (item c).";
    case "PURCHASE_DAYS_OUT_OF_ORDER":
      return "The first day of sale is after the last.";
    case "PURCHASE_FROM_BEFORE_ADVERTISEMENT":
      return `The documents cannot be sold before the advertisement: the first day of sale, ${day(d.day)}, is before ${day(d.advertisedOn)}.`;
    case "PAYMENT_METHODS_MISSING":
      return "How the fee is paid is not stated (item d).";
    case "SUBMISSION_PLACE_MISSING":
      return "Where tenders are submitted is not stated (item g).";
    case "CLOSING_NOT_SET":
      return "The closing is not recorded. It is recorded when the tender documents are approved for tendering.";
    case "BEFORE_TENDERING_START":
      return `The exercise would be published on ${day(d.day)}, before tendering starts on ${day(d.start)}. Publish on or after the start.`;
    case "TEMPLATE_NOT_SET":
      return `No template is chosen for the ${instrumentOf(d.instrument)}. ${TEMPLATE_SETTING}`;
    case "TEMPLATE_TEXT_NOT_SET":
      return `Template text not configured for the ${instrumentOf(d.instrument)}. ${TEMPLATE_SETTING}`;
    case "TEMPLATE_LANGUAGE_NOT_SET":
      return `The ${instrumentOf(d.instrument)}'s template has text in both languages and does not say which is issued. Say so under Configuration, Templates.`;
    case "TEMPLATE_INCOMPLETE":
      return `The text names fields with nothing recorded for them: ${d.fields}. Record them, or change the template.`;
    case "TEMPLATE_UNKNOWN_FIELD":
      return `The text names fields the portal does not fill here: ${d.fields}. Correct the template under Configuration, Templates.`;

    // ---- the fee (FR-ADV-008, OD-6)
    case "FEE_NOT_SET":
      return "The document fee is not set (item d).";
    case "REGIME_NOT_DETERMINED":
      return "The exercise's band is not determined, so its fee floor cannot be read. Save the exercise's classification again.";
    case "FLOOR_NOT_SET":
      return `No fee floor is set for the ${d.regime ?? "exercise's"} band. Set it under ${SETTINGS}.`;
    case "BELOW_FLOOR":
      return `The fee ${money(d.fee)} is below the floor of ${money(d.floor)} for this band. Raise the fee.`;
    case "FEE_BELOW_COST":
      return `The fee ${money(d.fee)} is below its cost basis of ${money(d.basis)}.`;
    case "QUANTITY_NOT_VALID":
      return "The quantity must be a number above zero, to at most three decimal places.";
    case "UNIT_COST_WITHOUT_QUANTITY":
      return "A unit cost needs a quantity; for a lump sum give only the amount.";
    case "AMOUNT_REQUIRED":
      return "Give the quantity and the unit cost, or the amount.";

    // ---- invitees and the name (FR-ADV-002, FR-MTD-008, OD-4)
    case "NAME_NOT_REQUESTED":
      return "The invitee list's approval has not been asked for. Request the name's approval on the Name approval tab.";
    case "NAME_NOT_APPROVED":
      return "The invitee list's approval is still in progress.";
    case "NAME_REJECTED":
      return "The invitee list's approval was refused. Change the list and ask again.";
    case "LIST_NOT_RECORDED":
      return "The approved name route holds no invitee list (it was approved before lists were recorded), so it approves no list. Request the name's approval again with the list.";
    case "LIST_CHANGED":
      return `The invitee list has changed since it was approved (${d.added ?? 0} added, ${d.removed ?? 0} removed). Request the name's approval again.`;
    case "NO_INVITEES":
      return "No contractor is proposed for invitation. Add the invitees.";
    case "LIST_FROZEN":
      return "The letters of invitation are issued, so the list stands. To invite others, cancel the exercise and open a replacement.";
    case "EXERCISE_NOT_OPEN":
      return "The exercise is cancelled, so its list stands as it was.";
    case "DUPLICATE":
      return "That registration number is already on the exercise.";
    case "NOT_A_PROPOSED_INVITEE":
      return "That contractor is not on the proposed list.";
    case "PARTY_HAS_RECORDS":
      return "That contractor has a letter, a sale or an attendance recorded, so it stays on the exercise.";
    case "NAME_REQUIRED":
      return "Give the contractor's name.";
    case "REGISTRATION_REQUIRED":
      return "Give the contractor's registration number.";
    case "NOT_INVITED_PATH":
      return "This exercise is advertised, not by invitation: its contractors come by buying the documents.";

    // ---- citing a committee decision on a name route (OD-12)
    case "NOT_THIS_EXERCISE":
      return "That matter was not tabled against this exercise.";
    case "NOT_A_NAME_MATTER":
      return "That matter is not the approval of the name, tabled as an exercise matter.";
    case "OTHER_COMMITTEE":
      return "That matter was before another committee.";
    case "OTHER_ACT":
      return "That matter was tabled for a different act from the one this step asks.";
    case "ALREADY_CITED":
      return "That decision already discharges another step: one decision discharges one step.";
    case "DECIDED_BEFORE_ROUTE":
      return "The committee decided that matter before the name was sent for approval.";

    // ---- events (FR-ADV-013, OD-8)
    case "EVENT_TIME_MISSING":
      return `The ${kindOf(d.kind)} has no day and time.`;
    case "EVENT_PLACE_MISSING":
      return `The ${kindOf(d.kind)} has no place.`;
    case "EVENT_AFTER_CLOSING":
      return `The ${kindOf(d.kind)} is at or after the closing.`;
    case "MANDATORY_NOT_PERMITTED":
      return `The ${kindOf(d.kind)} is marked mandatory, but mandatory attendance is ${d.permitted === "no" ? "not permitted" : "not set"}. Mark it not mandatory, or set the policy under ${SETTINGS}.`;
    case "MANDATORY_NOT_ANSWERED":
      return `Whether attendance at the ${kindOf(d.kind)} is mandatory is not answered. Answer it.`;
    case "MANDATORY_NOT_OFFERED":
      return `Not mandatory: mandatory attendance ${d.permitted === "no" ? "is not permitted" : "not set"}.`;
    case "ATTENDANCE_REQUIRED":
      return `Attendance at the ${kindOf(d.kind)} held on ${day(d.heldOn)} is mandatory, and this contractor is not on its attendance register.`;
    case "EVENT_NOT_HELD":
      return `Attendance at the ${kindOf(d.kind)} is mandatory, and it is not recorded as held yet. Record it held, with its attendance, first.`;
    case "ALREADY_HELD":
      return "The event is already recorded as held.";
    case "EVENT_CANCELLED":
      return "The event was cancelled.";
    case "HELD_BEFORE_START":
      return "An event is not held before the day it was scheduled for.";
    case "HELD_IN_FUTURE":
      return "The day it was held cannot be after today.";

    // ---- sales (FR-ADV-009–012, OD-9, OD-11)
    case "SALE_CLOSED":
      return d.phase === "NOT_PUBLISHED" || d.phase === "PUBLISHED" ? "The documents are not on sale yet: the sale opens on its first day, once the exercise is published." : d.phase === "UNKNOWN" ? "Whether the documents are on sale cannot be told: the organisation's time zone or the window's days are not set." : "The documents are no longer on sale.";
    case "CERT_NOT_SHOWN":
      return "The tender is restricted: the original or a certified copy of the purchaser's status certificate must be shown.";
    case "CERT_EXPIRY_NOT_RECORDED":
      return "Record the day the status certificate shown is valid until.";
    case "CERT_EXPIRED":
      return `The status certificate shown expired on ${day(d.validUntil)}.`;
    case "CERT_EXPIRES_BEFORE_CLOSING":
      return `The status certificate shown expires on ${day(d.validUntil)}, before the closing on ${day(d.closingDay)}.`;
    case "AUTHORITY_NOT_SIGHTED":
      return "The representative's proof of authority to receive the documents must be sighted.";
    case "REGISTRATION_NOT_CHECKED":
      return "Registration not checked: the supplier register is not built yet. Carried with the sale to the opening and the evaluation.";
    case "SUSPENSION_NOT_CHECKED":
      return "Suspension not checked: the supplier register is not built yet. Carried with the sale to the opening and the evaluation.";
    case "REGISTRATION_FAILED":
      return "The contractor's registration is recorded as cancelled, so the documents are not sold.";
    case "SUSPENDED":
      return "The contractor is recorded as suspended, so the documents are not sold.";
    case "ALREADY_SOLD":
      return "This contractor has already bought the documents.";
    case "RECEIPT_DUPLICATE":
    case "TAKEN":
      return "That receipt number is already recorded on another sale.";
    case "RECEIPT_NOT_RECORDED":
      return "No finance receipt number yet: the sale is listed for reconciliation until one is recorded.";
    case "COLLECTOR_REQUIRED":
      return "Give the name of whoever collected the documents.";
    case "PAYMENT_METHOD_REQUIRED":
      return "Say how the fee was paid.";
    case "NUMBER_REQUIRED":
      return "Give the receipt number.";
    case "FORMAT":
      return "The number does not match the finance system's receipt format.";
    case "FUTURE_DATE":
      return "The day cannot be after today.";
    case "ALREADY_VOID":
      return "The sale is already voided.";
    case "WINDOW_CLOSED":
      return "The window has closed, so the sale stands.";
    case "EXERCISE_CANCELLED":
      return "The exercise is cancelled, so its records stand.";
    case "REASON_REQUIRED":
      return "Give the reason.";

    // ---- addenda (FR-ADV-014)
    case "NOT_DRAFT":
      return "Only a draft addendum changes.";
    case "NOT_PUBLISHED":
      return "The exercise is not published, so this is not open yet.";
    case "AFTER_CLOSING":
      return "The window has closed, so no addendum is issued.";
    case "TITLE_REQUIRED":
      return "Give the addendum's title.";
    case "WHAT_CHANGED_REQUIRED":
      return "Say what the addendum changes.";
    case "SIGNED_COPY_REQUIRED":
      return "Attach the signed addendum before issuing it.";
    case "NO_RECIPIENTS":
      return "No purchasers to notify yet: a later purchaser receives it with the documents.";
    case "METHOD_REQUIRED":
      return "Say how it was sent.";
    case "DESPATCH_IN_FUTURE":
      return "The day sent cannot be after today.";
    case "ACK_BEFORE_DESPATCH":
      return "The day acknowledged cannot be before the day sent.";
    case "ACK_IN_FUTURE":
      return "The day acknowledged cannot be after today.";
    case "WITH_DOCUMENTS":
      return "This copy was given with the documents.";

    // ---- changes and cancellation (FR-ADV-015, 016, OD-5)
    case "ALREADY_PUBLISHED":
      return "The exercise is published: the closing now moves only by an extension.";
    case "CLOSING_PASSED":
      return "The closing has passed, so it can no longer be moved.";
    case "NOT_LATER":
      return "An extension moves the closing later.";
    case "UNCHANGED":
      return "The new closing and last day of sale are the same as now.";
    case "CHANGE_PENDING":
      return "A change to the window is already with approval. Wait for its decision.";
    case "NEW_CLOSING_NOT_VALID":
      return "Give the new closing day and time.";
    case "AUTHORITY_NOT_RECORDED":
      return "The change's approval is not recorded, so it is not applied.";
    case "REFUND_NOT_ANSWERED":
      return "Say whether the document fees are refunded.";
    case "AWARD_STANDS":
      return `${d.award ? `Award ${d.award}` : "An award"} stands on this exercise. Cancel the award first, from its own record.`;
    case "PUBLISH_NOT_READY":
      return "The invitation is not ready to publish: see what the Invitation tab says blocks it.";
    default:
      return UNWORDED;
  }
}

/// What a code with no words of its own reads as. A test holds that no code the rules return reaches it.
export const UNWORDED = "This cannot be done now.";

/// The days a closing is expressed in, for a screen: "17 Nov 2026, 14:30".
export { dayAndTime } from "./fields";
