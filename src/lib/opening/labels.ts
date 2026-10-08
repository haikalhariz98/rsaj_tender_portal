/**
 * Every word bid opening puts on a screen: enum labels and the text of every finding. Codes never
 * reach a screen (AGENTS.md rule 5): a screen renders `openingFindingText`, never `f.code`. Every
 * refusal names what to do, or where the setting is. Never a price: findings carry no figure.
 */

import { formatDate } from "@/lib/format";

import type { Ground, Reported } from "./verdict";
import type { AlternativeConsideration, ChecklistAnswer, CopyCheck, Finding, InvitedCountReading, OpeningKind, OpeningPhase, OpeningVerdict, PeriodUnit, RestrictionFinding, SaleFinding, UnpurchasedConsequence } from "./types";

/// Where each setting an opening reads is kept.
export const SETTING_AT = {
  methodRules: "Configuration › Invitation, under the method's opening rules",
  committee: "Configuration › Committees, on the committee's opening panel",
  openingPolicy: "Configuration › Invitation, under Opening",
  users: "Configuration › Users",
  estimate: "Configuration › Scope and estimate",
  parts: "Configuration › Tender documents",
  bidRules: "Configuration › Invitation, under Bid receipt, by sourcing method",
} as const;

/// The exit for an exercise whose frozen rule can never be met (6.7 C-9, review S-4).
const CANCEL_EXIT = "this exercise's exit is to cancel it, from its Invitation tab";

export const OPENING_KIND_LABEL: Readonly<Record<OpeningKind, string>> = { MAIN: "Opening", SUPPLEMENTARY: "Supplementary opening" };

export const OPENING_PHASE_LABEL: Readonly<Record<OpeningPhase, string>> = {
  AWAITING_AUTHORISATION: "Awaiting authorisation",
  IN_PROGRESS: "In progress",
  ADJOURNED: "Adjourned",
  AWAITING_REAUTHORISATION: "Resumed, awaiting authorisation",
  FINALISED: "Finalised",
};

export const OPENING_PHASE_TONE: Readonly<Record<OpeningPhase, "brand" | "warn" | "ok" | "neutral" | "info">> = {
  AWAITING_AUTHORISATION: "warn",
  IN_PROGRESS: "brand",
  ADJOURNED: "neutral",
  AWAITING_REAUTHORISATION: "warn",
  FINALISED: "ok",
};

export const CHECKLIST_ANSWER_LABEL: Readonly<Record<ChecklistAnswer, string>> = { PRESENT: "Present", ABSENT: "Absent", NOT_APPLICABLE: "Not applicable" };
export const VERDICT_LABEL: Readonly<Record<OpeningVerdict, string>> = { PASS: "Carried to evaluation", REJECT: "Not carried" };
export const VERDICT_TONE: Readonly<Record<OpeningVerdict, "ok" | "err">> = { PASS: "ok", REJECT: "err" };

export const SALE_FINDING_LABEL: Readonly<Record<SaleFinding, string>> = {
  LIVE_SALE: "Bought the documents",
  NO_LIVE_SALE: "No live purchase of the documents",
  NOT_ON_INVITEE_LIST: "Not on the approved invitee list",
};

export const RESTRICTION_FINDING_LABEL: Readonly<Record<RestrictionFinding, string>> = {
  NOT_RESTRICTED: "Not a restricted tender",
  EVIDENCED: "Restriction evidenced at the sale",
  NOT_EVIDENCED: "Restriction not evidenced",
};

export const ALTERNATIVE_LABEL: Readonly<Record<AlternativeConsideration, string>> = { CONSIDERED: "Alternative, considered", NOT_CONSIDERED: "Alternative, not considered" };

export const COPY_CHECK_LABEL: Readonly<Record<CopyCheck, string>> = {
  MATCH: "The paper copy matches the lodged estimate",
  MISMATCH: "The paper copy differs from the lodged estimate",
  NOT_IN_BOX: "The paper copy was not in the box",
};

export const INVITED_READING_LABEL: Readonly<Record<InvitedCountReading, string>> = { PURCHASERS: "Bidders who bought the documents", INVITEES: "Bidders sent a letter of invitation" };
export const UNPURCHASED_LABEL: Readonly<Record<UnpurchasedConsequence, string>> = { ELIMINATE: "Not carried to evaluation", REPORT: "Carried, and reported to the committee" };
export const PERIOD_UNIT_LABEL: Readonly<Record<PeriodUnit, string>> = { DAYS: "days", WEEKS: "weeks", MONTHS: "months" };

export const GROUND_LABEL: Readonly<Record<Ground, string>> = {
  INCOMPLETE: "A mandatory document is missing, and the method eliminates an incomplete bid",
  NOT_PURCHASED: "The bidder holds no live purchase of the documents, and the method eliminates such a bid",
  NOT_INVITED: "The bidder is not on the approved invitee list, and the method eliminates such a bid",
  NOT_EVIDENCED: "The restriction's certificate was not evidenced as valid on the closing day",
  ALTERNATIVE_NOT_CONSIDERED: "An alternative bid the documents do not permit: recorded, not considered",
  NOT_ELIGIBLE: "The supplier register found the bidder not eligible when its envelope was opened, and the register's policy eliminates such a bid",
};

export const REPORTED_LABEL: Readonly<Record<Reported, string>> = {
  INCOMPLETE_REPORTED: "A mandatory document is missing: reported to the committee, which decides",
  NOT_PURCHASED_REPORTED: "No live purchase of the documents: reported to the committee",
  NOT_INVITED_REPORTED: "Not on the approved invitee list: reported to the committee",
  NOT_ELIGIBLE_REPORTED: "Found not eligible on the supplier register: reported to the committee, which decides",
};

/// The statement the Opening tab makes (C-2): what is recorded, and what it is not.
export const OPENING_STATEMENT = {
  title: "The box and its key remain the control",
  body: "Two officers authorise the opening: each present panel member signs in as themselves and gives their own password. Nobody authorises for another.",
} as const;

/// The benchmark row before disclosure (OD-2 A).
export const SEALED_UNTIL_FINALISED = "Sealed until the schedule is finalised";

const d = (f: Finding, k: string) => String(f.data?.[k] ?? "");
const n = (f: Finding, k: string) => Number(f.data?.[k] ?? 0);
/// fix R-6: how a verdict treated a bidder the supplier register found not eligible.
const TREATMENT: Record<string, string> = { ELIMINATE: "eliminated at the opening", REPORT: "reported to the committee, which decides", NONE: "not judged on that finding" };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const day = (f: Finding, k: string) => (f.data?.[k] ? formatDate(String(f.data[k])) : "a day not recorded");

const TEXT: Readonly<Record<string, (f: Finding) => string>> = {
  // ---- every act on the opened record
  FINALISED: () => "The opening is finalised: nothing on it changes. A late tender admitted afterwards is opened at a supplementary opening.",
  ADJOURNED: () => "The opening is adjourned. Resume it, and have two panel members present authorise the new sitting, before anything more is recorded.",
  NOT_UNSEALED: () => "The box is not opened yet: two panel members present must each authorise the opening first.",
  SITTING_NOT_AUTHORISED: () => "This sitting is not authorised yet: two panel members present must each authorise it before anything is recorded.",
  NOT_THIS_OPENING: () => "That offer was read at another opening of this exercise.",
  PERSON_REQUIRED: () => "Name the officer recording it (an active person).",
  REASON_REQUIRED: () => "Give the reason.",
  // ---- the panel
  COMMITTEE_NOT_SET: () => `The sourcing method does not name the committee that opens its bids. Set it under ${SETTING_AT.methodRules}.`,
  MAIN_COMMITTEE_GONE: () => "The committee that held the main opening is retired or no longer configured. A supplementary opening is held by that committee; the method's committee today does not take its place.",
  COMMITTEE_NOT_FOUND: () => `The committee the method names is not configured or is retired. Correct it under ${SETTING_AT.methodRules}.`,
  PANEL_EMPTY: () => "Pick the panel members from the committee's seats.",
  PICKED_TWICE: (f) => `${d(f, "person")} is picked twice.`,
  NOT_ON_COMMITTEE: (f) => `${d(f, "person")} does not hold a seat on the committee on the opening day.`,
  PERSON_INACTIVE: (f) => `${d(f, "person")} is not an active person.`,
  PANEL_SIZE_NOT_SET: () => `The committee's opening panel size is not set. Set it under ${SETTING_AT.committee}.`,
  PANEL_SIZE_DIFFERS: (f) => `The committee's opening panel has ${n(f, "required")} members; ${n(f, "picked")} are picked. A panel of another size needs the authority it is assigned under, the reason and who records it.`,
  PANEL_SIZE_OVERRIDDEN: (f) => `A panel of ${n(f, "picked")}, not the committee's ${n(f, "required")}, assigned under a recorded authority.`,
  OVERRIDE_AUTHORITY_REQUIRED: () => "Name the authority the panel of another size is assigned under.",
  OVERRIDE_REASON_REQUIRED: () => "Say why the panel is of another size.",
  OVERRIDE_PERSON_REQUIRED: () => "Name the officer recording the panel of another size (an active person).",
  FEWER_THAN_TWO_PRESENT: () => "At least two panel members must be present: the opening is authorised by two of them.",
  MEMBER_ABSENT: (f) => `${d(f, "person")} is recorded as absent: an absent member neither authorises, initials nor signs.`,
  EXCLUSION_RULE_NOT_SET: () => `Independence rule not set; panel not checked. Set it under ${SETTING_AT.committee}.`,
  EXCLUDED_UNIT_NOT_SET: () => `The committee's independence rule is on but names no unit. Set the unit under ${SETTING_AT.committee}.`,
  MEMBER_IN_EXCLUDED_UNIT: (f) => `${d(f, "person")} sits in the unit the committee's independence rule excludes from its opening panels.`,
  UNIT_NOT_RECORDED: (f) => (d(f, "notInStructure") === "yes" ? `${d(f, "person")}'s unit is not in the organisation's structure in force on the opening day, or a unit above it is not, so the independence rule cannot be checked. Correct the person's unit under ${SETTING_AT.users}, or the structure under Configuration › Organisation.` : `${d(f, "person")}'s unit is not recorded, so the independence rule cannot be checked. Record it under ${SETTING_AT.users}.`),
  // ---- starting
  CANCELLED: () => "The exercise is cancelled, so nothing is opened, and nothing more is recorded at its opening.",
  NOT_PUBLISHED: () => "The exercise was not published through its invitation window, so it has no opening here.",
  NO_TENDER_DOCUMENTS: () => "The exercise assembles no tender or quotation documents, so it has no opening.",
  TIME_ZONE_NOT_SET: () => "The organisation's time zone is not set, so the opening cannot be dated. Set it under Configuration › Organisation.",
  NOT_CLOSED: () => "The invitation window has not closed yet: the opening starts once it has.",
  BOX_NOT_LOCKED: () => "The tender box is not recorded as locked at or after the closing. Record the box locked on the Received section first.",
  CHANGE_PENDING: () => "A change to the invitation window is with approval: the opening waits for its decision.",
  MAIN_EXISTS: () => "The exercise's opening is already started. A late tender admitted later is opened at a supplementary opening.",
  // ---- the estimate's lead time (6.2)
  ESTIMATE_RULE_NOT_SET: () => `Whether the method needs a company estimate is not set. Set it under ${SETTING_AT.estimate}.`,
  ESTIMATE_NOT_LODGED: () => "The method needs a company estimate, and none is lodged into the box.",
  LEAD_NOT_SET: () => `The estimate's lead time before the closing is not set, so it cannot be judged. Set it under ${SETTING_AT.estimate}.`,
  CLOSING_NOT_SET: () => "The exercise has no closing recorded.",
  ESTIMATE_LATE: (f) => `The estimate's last version is dated ${day(f, "lastVersionDay")}, after the last day the lead allows (${day(f, "lastPermittedDay")}). It is opened only on an override: the office configured for it, held by the officer named, with the reason.`,
  OVERRIDE_NOT_PERMITTED: () => `No office may override a late estimate: none is configured. Set it under ${SETTING_AT.estimate}.`,
  NOT_HOLDER: () => "The officer named does not hold the office that may override a late estimate.",
  // ---- a supplementary opening
  MAIN_NOT_FINALISED: () => "The main opening is not finalised yet: an admitted late tender is opened after it.",
  DECISION_NOT_LATE_TENDER: () => "That decision is not a late tender's admission.",
  NOT_ADMITTED: () => "The committee did not admit that envelope (or has not decided): only a carried admission is opened. One not admitted stays sealed, to be returned unopened.",
  ALREADY_OPENED_FOR: () => "That admission's envelope already has its supplementary opening.",
  LATE_ENVELOPE_NOT_SEALED: () => "That envelope is not a late envelope still sealed on the register.",
  // ---- authorisations (C-2, OD-11)
  ALREADY_AUTHORISED: () => "That member has already authorised this sitting. The second authorisation must be another member's.",
  SITTING_AUTHORISED: () => "Two members have already authorised this sitting.",
  SAME_HAND: () => "The two authorisations must come from two different people acting. This one would be keyed by, or keyed for, the person behind the other authorisation of this sitting.",
  NOT_ON_PANEL: () => "That person is not on this opening's panel.",
  ABSENT: () => "That member is recorded as absent from the opening.",
  AT_OR_BEFORE_CLOSING: () => "The box is opened only after the closing, from the next second: an envelope recorded in the closing second itself is in time.",
  ALREADY_ADJOURNED: () => "The opening is already adjourned.",
  NOT_ADJOURNED: () => "The opening is not adjourned.",
  // ---- the box
  LOCK_GAP: (f) => `The box was locked ${d(f, "gap")} after the closing. Envelopes found in it are taken as in time by the lock; the committee is shown the gap.`,
  LOCKED_AT_CLOSING: () => "The box was locked in the closing second.",
  NOT_MAIN: () => "Only the main opening opens the box.",
  BOX_EMPTIED: () => "An envelope has been opened already: every envelope in the box is registered before the first is opened.",
  NOT_A_BID: () => "The company estimate is not a bid.",
  MARKINGS_REQUIRED: () => "Copy the markings on the envelope.",
  NOT_LOCKED_AFTER_CLOSING: () => "The box has no lock recorded at or after the closing.",
  // ---- withdrawals
  OPEN_REFUSED_WITHDRAWN: () => "That envelope is matched to a withdrawal: it is not opened, and is listed as withdrawn.",
  ALREADY_MATCHED: () => "That withdrawal is already matched to an envelope.",
  FINDING_RECORDED: () => "A finding is already recorded for that withdrawal.",
  NOT_A_BOX_ENVELOPE: () => "Only an envelope found in the box is matched here; one received over the counter or by post was matched when the withdrawal was recorded.",
  LATE_ENVELOPE: () => "A late envelope is never matched to a withdrawal: a withdrawal after the closing is refused.",
  ENVELOPE_NOT_RECEIVED: () => "That envelope is not unopened on the register.",
  ENVELOPE_MATCHED: () => "That envelope is already matched to another withdrawal.",
  ALREADY_FOUND: () => "A finding is already recorded for that withdrawal.",
  FINDING_REQUIRED: () => "Say what the panel found.",
  WITHDRAWAL_UNRESOLVED: (f) => `${plural(n(f, "count"), "withdrawal is", "withdrawals are")} neither matched to an envelope nor explained.`,
  // ---- findings and the checklist
  RESTRICTION_NOT_ANSWERED: () => "Whether the tender is restricted is not answered on its documents.",
  NOT_ON_CHECKLIST: () => "That item is not on the opening's checklist.",
  ANSWER_REQUIRED: () => "Choose present, absent or not applicable.",
  CHECKLIST_NOT_JUDGED: (f) => `Whether a bidder returns ${d(f, "parts")} was not set when the tender documents were approved, so completeness cannot be judged against it. Documents approved later take the setting (${SETTING_AT.parts}); these keep the answer they were approved with, so ${CANCEL_EXIT}.`,
  ANSWERS_INCOMPLETE: (f) => `${plural(n(f, "count"), "checklist item is", "checklist items are")} not answered yet.`,
  CONSEQUENCE_NOT_SET: () => `What follows from an incomplete bid was not set when the window was published, so no verdict is recorded. Windows published later take the setting (${SETTING_AT.bidRules}); it does not reach this exercise, so ${CANCEL_EXIT}.`,
  UNPURCHASED_CONSEQUENCE_NOT_SET: () => `What follows from a bid by a bidder with no live purchase (or not invited) is not set. Set it under ${SETTING_AT.methodRules}.`,
  INELIGIBLE_CONSEQUENCE_NOT_SET: () => "A bidder linked to the supplier register was found not eligible when its envelope was opened, and what follows from that is not set. Set it under Configuration › Supplier register, Standing.",
  VERDICT_UNDER_OTHER_SETTING: (f) => `Offer ${d(f, "listingNo")}'s verdict was recorded with its bidder, found not eligible on the supplier register, ${TREATMENT[d(f, "was")] ?? "judged otherwise"}; the register's setting has changed since, and finalising would freeze it as ${TREATMENT[d(f, "now")] ?? "otherwise"}. Record offer ${d(f, "listingNo")}'s verdict again under the setting as it stands.`,
  VERDICT_NO_LONGER_STANDS: (f) => {
    const list = (k: string) => d(f, k).split(",").filter(Boolean).map((g) => (GROUND_LABEL as Record<string, string>)[g]?.toLowerCase() ?? "a ground no longer named");
    const added = list("added");
    const removed = list("removed");
    const what = [...(added.length ? [`now against it: ${added.join("; ")}`] : []), ...(removed.length ? [`no longer against it: ${removed.join("; ")}`] : [])].join("; and ");
    return `Offer ${d(f, "listingNo")}'s ${d(f, "verdict") === "PASS" ? "carrying" : "rejection"} no longer stands under the rules as they read now${what ? ` (${what})` : ""}. Record offer ${d(f, "listingNo")}'s verdict again.`;
  },
  ALTERNATIVES_NOT_STATED: () => "The window does not say whether alternative bids are permitted, so no alternative is marked. It is answered on the window before publication.",
  // ---- opening an envelope
  ENVELOPE_NOT_FOUND: () => "That envelope is not on this exercise's register.",
  ESTIMATE_NOT_A_BID: () => "The company estimate's envelope is never opened as a bid: it is disclosed when the schedule is finalised.",
  ALREADY_OPENED: () => "That envelope is already opened.",
  LATE_NOT_ADMITTED: () => "A late envelope is not opened at the main opening: its admission is the committee's, and an admitted one is opened at a supplementary opening.",
  NOT_THE_ADMITTED_ENVELOPE: () => "A supplementary opening opens only the envelope its admission names.",
  PARENT_NOT_OPENED: () => "The offer it is an alternative to is not opened yet.",
  PRICE_REQUIRED: () => "Give the price as read.",
  BIDDER_REQUIRED: () => "Pick the bidder, or give its name as read.",
  REGISTRATION_REQUIRED: () => "Give the bidder's registration number as read.",
  PARTY_EXISTS: () => "A bidder with that registration number is already on the exercise: pick it from the list.",
  PERIOD_INCOMPLETE: () => "Give the completion period with its unit, or neither.",
  MAIN_NOT_OPENED: () => "Open the envelope's main offer first.",
  NOTHING_CHANGED: () => "Nothing differs from what was recorded.",
  // ---- verdicts
  VERDICT_REQUIRED: () => "Choose carried or not carried.",
  PASS_WITH_MISSING_DOCUMENT: (f) => `${d(f, "missing")} is missing, and the method eliminates an incomplete bid: it cannot be carried.`,
  PASS_WITHOUT_PURCHASE: () => "The bidder holds no live purchase of the documents, and the method eliminates such a bid: it cannot be carried.",
  PASS_NOT_INVITED: () => "The bidder is not on the approved invitee list, and the method eliminates such a bid: it cannot be carried.",
  PASS_NOT_EVIDENCED: () => "The restriction's certificate was not evidenced as valid on the closing day: the bid is not eligible.",
  PASS_ALTERNATIVE_NOT_CONSIDERED: () => "The documents do not permit alternatives: this one is recorded, never considered.",
  PASS_NOT_ELIGIBLE: () => "The supplier register found the bidder not eligible when its envelope was opened, and the register's policy eliminates such a bid: it cannot be carried.",
  REJECT_ON_COMPLETENESS_NOT_PERMITTED: () => "The method reports an incomplete bid to the committee, which decides: the opening does not reject it for that.",
  REJECT_WITHOUT_GROUND: () => "Nothing the rules make eliminatory stands against this bid: the opening carries it. Any other concern goes in the minutes for the committee.",
  // ---- the estimate's copy (C-1)
  ESTIMATE_COPY_UNEXPLAINED: (f) => `${f.data?.check === "NOT_IN_BOX" ? "The estimate's paper copy was not in the box" : "The estimate's paper copy differs from the lodged version"}, and no explanation is recorded. Evaluation and the award wait for it.`,
  NOT_FINALISED: () => "The opening is not finalised yet.",
  NOTHING_TO_EXPLAIN: () => "The paper copy matched: there is nothing to explain.",
  ALREADY_EXPLAINED: () => "The explanation is already recorded; it is never edited.",
  EXPLANATION_REQUIRED: () => "Give the explanation.",
  ESTIMATE_COPY_NOT_ANSWERED: () => "Enter the figure on the estimate's paper copy from the box, or record that it was not in the box. It is compared only once everything else is in order, when the estimate is disclosed.",
  // ---- the schedule and finalising
  READING_NOT_SET: () => `How the schedule counts the tenderers invited is not set. Set it under ${SETTING_AT.openingPolicy}.`,
  ENVELOPE_UNOPENED: (f) => `${plural(n(f, "count"), "envelope in time is", "envelopes in time are")} neither opened nor withdrawn.`,
  ADMITTED_NOT_OPENED: () => "The admitted envelope is not opened yet.",
  INITIAL_MISSING: (f) => `Offer ${n(f, "listingNo")} lacks ${d(f, "person")}'s initial.`,
  CHECKLIST_UNANSWERED: (f) => `Offer ${n(f, "listingNo")} has ${plural(n(f, "count"), "checklist item", "checklist items")} not answered.`,
  VERDICT_UNSET: (f) => `Offer ${n(f, "listingNo")} has no verdict.`,
  PAGES_NOT_SET: () => "Enter the number of pages of the signed schedule.",
  SIGNATURE_MISSING: (f) => `${d(f, "person")}'s signature on the schedule is not recorded.`,
  PAGES_POSITIVE: () => "Give the number of pages, one or more.",
  SEALED_FIGURE_ON_PAPER: () => "The signed schedule carries the company estimate's row, so its scan is attached only once the opening is finalised.",
  SIGNED_SCHEDULE_NOT_ATTACHED: (f) => `The signed schedule's scan${f.data?.supplementary ? ` of supplementary opening ${n(f, "supplementary")}` : ""} is not attached. Attach it on the Schedule section.`,
  ALREADY_RECORDED: () => "That is already recorded.",
  DAY_REQUIRED: () => "Give the day written on the paper.",
  DAY_IN_FUTURE: () => "That day has not come yet.",
  DAY_BEFORE_OPENING: () => "That day is before the opening started.",
  // ---- the award (C-7, C-8)
  OPENING_NOT_STARTED: () => "The bids have not been opened: an award follows the opening's finalised schedule. Start it on the Opening section of Bids and opening.",
  OPENING_NOT_FINALISED: () => "The opening is not finalised: an award follows the opening's finalised schedule.",
  SUPPLEMENTARY_NOT_FINALISED: (f) => `Supplementary opening ${n(f, "supplementary")} is not finalised.`,
  ADMITTED_UNOPENED: (f) => `${plural(n(f, "count"), "admitted late tender is", "admitted late tenders are")} not opened yet: each is opened at a supplementary opening before the award.`,
  AWARDEE_NOT_NAMED: () => "The award does not name the bidder from the exercise's bidders carried to evaluation.",
  AWARDEE_NOT_CARRIED: () => "The bidder the award names was not carried to evaluation at the opening.",
};

export function openingFindingText(f: Finding): string {
  const t = TEXT[f.code];
  return t ? t(f) : "This cannot be recorded as it stands.";
}

/// Every code this module returns, for the test that each has words.
export const OPENING_FINDING_CODES = Object.keys(TEXT);

/// "120 days" from a period, in words; null where none was read.
export const periodText = (p: { value: number; unit: PeriodUnit } | null) => (p ? `${p.value} ${PERIOD_UNIT_LABEL[p.unit]}` : "Not stated");

/// NFR-SIG-001: the capacity a panel member authorised or signed in, read from the seat label the opening kept at its start. An act recorded before the seat was kept has none,
/// and says so: the seat is derivable for it, but a derived value would claim a record that was never made (ADR 0034 D12, no backfill).
export const seatWords = (seatLabel: string | null | undefined): string => (seatLabel?.trim() ? `seat: ${seatLabel.trim()}` : "seat not recorded");
