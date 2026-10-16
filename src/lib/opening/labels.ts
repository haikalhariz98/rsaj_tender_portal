/**
 * Every word bid opening puts on a screen: enum labels and the text of every finding. Codes never
 * reach a screen (AGENTS.md rule 5): a screen renders `openingFindingText`, never `f.code`. Every
 * refusal names what to do, or where the setting is. Never a price: findings carry no figure.
 */

import { formatDate } from "@/lib/format";
import { CLOSING_FAULT_WORDS, isRestrictionReading } from "@/lib/suppliers/restriction-register";

import { FILED_FILE_WORDS } from "./filed-file";
import { MATRIX_FAULT_TEXT } from "./matrix";
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
const CANCEL_EXIT = "this exercise's exit is to cancel it, from Tender documents, under Publishing";

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
  NOT_ASSESSED: "Restriction not assessed",
};

/// The finding in words. A sale from an online purchase was read from the supplier register (ruling 17a), and the words say so, never "sighted".
export function restrictionLabel(finding: RestrictionFinding, reading: unknown): string {
  if (!isRestrictionReading(reading)) return RESTRICTION_FINDING_LABEL[finding];
  switch (finding) {
    case "EVIDENCED":
      return "Restriction verified on the supplier register";
    case "NOT_EVIDENCED":
      return "Restriction not evidenced on the supplier register";
    case "NOT_ASSESSED":
      return "Restriction not assessed: a document on the supplier register is waiting to be verified";
    default:
      return RESTRICTION_FINDING_LABEL[finding];
  }
}

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
/// 20c: what stands where a bidder's name would be, for a reader who is not a named opening officer, between the unseal and finalising of an online opening.
export const NAMES_AT_FINALISING = "Shown when the schedule is finalised: until then only the named opening officers see who bid";

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
  NOT_UNSEALED: (f) => (n(f, "online") === 1 ? `The bids are not unsealed yet: each of the ${n(f, "required")} named opening officers must authorise the opening first.` : "The box is not opened yet: two panel members present must each authorise the opening first."),
  SITTING_NOT_AUTHORISED: (f) => (n(f, "online") === 1 ? `This sitting is not authorised yet: each of the ${n(f, "required")} named opening officers must authorise it before anything is recorded.` : "This sitting is not authorised yet: two panel members present must each authorise it before anything is recorded."),
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
  // ---- the officers named on the exercise (SR-07, ruling 11)
  OFFICERS_SHORT: (f) => `Name ${plural(Number(d(f, "required")), "opening officer", "opening officers")}: ${Number(d(f, "named")) === 0 ? "none is named yet" : `${Number(d(f, "named"))} named so far`}.`,
  OFFICERS_TOO_MANY: (f) => `${plural(Number(d(f, "required")), "opening officer is", "opening officers are")} needed, and ${Number(d(f, "named"))} are named. Take one off first.`,
  OFFICER_IS_ADMINISTRATOR: (f) => `${d(f, "person")} holds an administrator account. Administration is kept apart from approvals and certification, so an administrator does not open bids. Name someone else.`,
  EXERCISE_CANCELLED: () => "The exercise is cancelled, so its opening officers stand as they were.",
  AFTER_CLOSING: () => "The closing has passed. The opening officers can no longer be changed, and the bids cannot be opened without every named officer. If one cannot take part, the exercise must be re-tendered.",
  OPENING_STARTED: () => "The opening has started, so its officers stand as they are.",
  AUTHORITY_REQUIRED: () => "Say what authority the change is made under.",
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
  KEY_NOT_LIVE: () => "This online exercise has no live sealing key, so its bids cannot be opened.",
  ONLINE_FINALISE_ELSEWHERE: () => "This exercise takes bids online, so its prices are not read here: each price is read, and the schedule finalised, only by the online finalise. Use the Finalising section of this exercise's Opening tab: each named officer signs, then one of them finalises with their own unseal passphrase. Nothing was finalised.",
  // ---- the online finalise (step 15)
  ONLINE_FILE_CLASS_NOT_SET: () => `The class that an online bid's files take when they are filed is not set, so there is nowhere to file them and nothing was finalised. Set it under Configuration › Documents, in the upload rules.`,
  ONLINE_FILE_CLASS_NOT_SULIT: () => `The class that an online bid's files take when they are filed is no longer classified as the most restricted level, so a sealed bid would be filed where people who may not read it could. Nothing was finalised. Correct the class under Configuration › Documents.`,
  ONLINE_STORE_UNAVAILABLE: () => `The sealed files could not be read from the document store just now. Nothing was finalised; try again.`,
  ONLINE_BID_NOT_FOUND: (f) => `Offer ${n(f, "listingNo")}'s sealed submission could not be found. Nothing was finalised.`,
  ONLINE_GRANT_MISSING: (f) => `Your key does not open offer ${n(f, "listingNo")}: nothing was sealed to you for it at the unseal. Nothing was finalised.`,
  ONLINE_GRANT_UNREADABLE: (f) => `What was sealed to you for offer ${n(f, "listingNo")} could not be opened. Nothing was finalised.`,
  ONLINE_BYTES_MISSING: (f) => `A file of offer ${n(f, "listingNo")} is not in the store. Nothing was finalised.`,
  ONLINE_FILE_UNREADABLE: (f) => `A file of offer ${n(f, "listingNo")} did not open whole, so it cannot be relied on. Nothing was finalised.`,
  ONLINE_DIGEST_MISMATCH: (f) => `A file of offer ${n(f, "listingNo")} no longer matches the digest it was stored under. Nothing was finalised.`,
  ONLINE_DECLARATION_UNREADABLE: (f) => `The declaration of offer ${n(f, "listingNo")} did not open whole, so its price cannot be read. Nothing was finalised.`,
  ONLINE_ESTIMATE_UNREADABLE: () => "The estimate lodged sealed did not open whole. Nothing was finalised.",
  ONLINE_STATE_CHANGED: () => "The opening changed while its files were being checked. Nothing was finalised; try again.",
  ONLINE_NOT_ALL_SIGNED: () => "Every named officer signs first. Nothing was finalised.",
  ALREADY_FINALISED: () => "This opening is already finalised.",
  ADMINISTRATOR: () => "An administrator account does not open, sign for or finalise bids.",
  KEY_OFFICERS_MISMATCH: (f) => (n(f, "waiting") === 1
    ? "A substitution of an opening officer was started and not completed: the officer who was replaced still holds their share, and it has not been handed to the officer named in their place. Once the closing has passed it can no longer be handed over, and the exercise must be re-tendered."
    : n(f, "keyOfficers") === n(f, "officers")
    ? `The officers named now are not the officers the exercise key was split across: the roster has changed since the key was made, though ${n(f, "officers")} are named in both. Every officer must set their share again before the opening can start.`
    : `The exercise key was split across ${n(f, "keyOfficers")} officers, and ${n(f, "officers")} are named now. Every officer must set their share again before the opening can start.`),
  OFFICERS_FEWER_THAN_TWO: () => "An online opening needs at least two named opening officers.",
  SKEW_NOT_ELAPSED: (f) => `The closing has only just passed. The opening starts a few seconds after it, so that no bid sent in time can still be arriving. Try again in ${plural(n(f, "seconds"), "second", "seconds")}.`,
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
  // ---- the online unseal (ADR 0036 D10): a bid that does not match its own record blocks the whole unseal, and is named by its receipt's number, never by its supplier
  BID_MANIFEST_DIGEST: (f) => `The sealed record of the bid received as number ${n(f, "sequence")} is not the one its row names. Nothing was opened, and your authorisation was not recorded.`,
  BID_DECLARATION_DIGEST: (f) => `The sealed price of the bid received as number ${n(f, "sequence")} is not the one its record names. Nothing was opened.`,
  BID_MANIFEST_BINDING: (f) => `The sealed record of the bid received as number ${n(f, "sequence")} does not agree with its row (its supplier, account, kind or replacement). Nothing was opened.`,
  BID_PARENT: (f) => `The alternative received as number ${n(f, "sequence")} is linked to a bid it was not submitted against. Nothing was opened.`,
  BID_FILES: (f) => `The files of the bid received as number ${n(f, "sequence")} are not the files its sealed record lists. Nothing was opened.`,
  BID_RECEIPT_DIGEST: (f) => `The receipt digest of the bid received as number ${n(f, "sequence")} does not recompute from its stored record. Nothing was opened.`,
  BID_NOT_IN_ROLL: (f) => `The bid received as number ${n(f, "sequence")} is not in the list frozen when the opening started. Nothing was opened.`,
  BID_ROLL_CHANGED: (f) => `The bid received as number ${n(f, "sequence")} no longer matches the list frozen when the opening started. Nothing was opened.`,
  BID_KEY: (f) => `The bid received as number ${n(f, "sequence")} was sealed under a key that is not the exercise's live key. Nothing was opened.`,
  PARTY_NOT_FOUND: (f) => `The supplier of the bid received as number ${n(f, "sequence")} is not among this exercise's bidders, so it cannot be listed. Nothing was opened.`,
  PEPPER_NOT_HELD: () => "This exercise was sealed under a pepper this copy of the system does not hold, so the key cannot be unlocked here. Whoever runs the system must restore that pepper. Nothing was counted against the officer's passphrase.",
  SHARES_INCOMPLETE: () => "The shares the officers released do not make up the exercise key: one is missing, or one belongs to a key that has since been retired. Nothing was opened.",
  SHARES_MISMATCH: () => "The shares the officers released do not recombine to the exercise key. Nothing was opened.",
  OFFICER_KEY_CHANGED: () => "Your key for this exercise was changed while you were authorising. Nothing was recorded; try again.",
  ROLL_NOT_FROZEN: () => "This opening has no frozen list of the bids received, so it cannot be unsealed.",
  NOT_ONLINE: () => "This exercise does not take bids online.",
  NOT_NAMED_OFFICER: () => "Only an opening officer named on this exercise, and on this opening's panel, authorises its unsealing.",
  NOT_ON_PANEL_ONLINE: () => "The officers named on this exercise are not the officers on this opening's panel. Nothing was recorded.",
  // ---- a supplementary opening
  MAIN_NOT_FINALISED: () => "The main opening is not finalised yet: an admitted late tender is opened after it.",
  DECISION_NOT_LATE_TENDER: () => "That decision is not a late tender's admission.",
  NOT_ADMITTED: () => "The committee did not admit that envelope (or has not decided): only a carried admission is opened. One not admitted stays sealed, to be returned unopened.",
  ALREADY_OPENED_FOR: () => "That admission's envelope already has its supplementary opening.",
  LATE_ENVELOPE_NOT_SEALED: () => "That envelope is not a late envelope still sealed on the register.",
  // ---- authorisations (C-2, OD-11)
  ALREADY_AUTHORISED: () => "That member has already authorised this sitting. The second authorisation must be another member's.",
  SITTING_AUTHORISED: (f) => (n(f, "online") === 1 ? `All ${n(f, "required")} named officers have already authorised this sitting.` : "Two members have already authorised this sitting."),
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
  RESTRICTION_EVIDENCE_TYPE_NOT_SET: () => CLOSING_FAULT_WORDS.EVIDENCE_TYPE_NOT_SET,
  RESTRICTION_CLOSING_DAY_RULE_NOT_SET: () => CLOSING_FAULT_WORDS.CLOSING_DAY_RULE_NOT_SET,
  RESTRICTION_NOT_ASSESSED: () => "This bidder bought the documents online, and a status document lodged for it on the supplier register by the closing day is waiting for an officer to verify it. The restriction is not assessed, so no verdict is recorded yet. It is read again each time you act on this offer; it ends when the document is verified or found not in order.",
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
  // Review S6 (ADR 0036 D10, ruling 20): an online bid's price is written only by the finalise, so before it there is no read price to correct.
  PRICE_NOT_READ: () => "This bid's price is not read yet: an online bid's price is unsealed when the opening is finalised, so there is nothing to correct before then.",
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
  ESTIMATE_COPY_NOT_ANSWERED: (f) => f.data?.online ? "The company estimate is lodged, but no sealed copy of it was lodged for the opening officers. Nothing can be compared, and a copy cannot be lodged after the closing." : "Enter the figure on the estimate's paper copy from the box, or record that it was not in the box. It is compared only once everything else is in order, when the estimate is disclosed.",
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
  // ---- the SR-14 matrix (wave 3c, ruling 22, 20cp, 20cv): the words live once, in matrix.ts. ADMINISTRATOR keeps its words above.
  NO_FILE_RECEIVED: () => MATRIX_FAULT_TEXT.NO_FILE_RECEIVED,
  NOT_A_NAMED_OFFICER: () => MATRIX_FAULT_TEXT.NOT_A_NAMED_OFFICER,
  NOT_OWN_ACT: () => MATRIX_FAULT_TEXT.NOT_OWN_ACT,
  COLUMN_CHANGED: () => MATRIX_FAULT_TEXT.COLUMN_CHANGED,
  COLUMN_NOT_ANSWERED: () => MATRIX_FAULT_TEXT.COLUMN_NOT_ANSWERED,
  DECISION_NOT_RECORDED: () => MATRIX_FAULT_TEXT.DECISION_NOT_RECORDED,
  // ---- the filed download after finalising (20cl): the words live once, in filed-file.ts. ADMINISTRATOR and NOT_FINALISED keep their words above.
  NOT_ON_THIS_OPENING: () => FILED_FILE_WORDS.NOT_ON_THIS_OPENING,
  NOT_AN_OPENING_CHECK_FILE: () => FILED_FILE_WORDS.NOT_AN_OPENING_CHECK_FILE,
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
