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
  methodRules: "Configuration › Invitation › Opening rules",
  committee: "Configuration › Committees",
  openingPolicy: "Configuration › Invitation › Opening",
  users: "Configuration › Users",
  estimate: "Configuration › Scope and estimate",
  parts: "Configuration › Tender documents",
  bidRules: "Configuration › Invitation › Bid receipt",
} as const;

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
      return "Restriction not assessed: document awaiting verification";
    default:
      return RESTRICTION_FINDING_LABEL[finding];
  }
}

export const ALTERNATIVE_LABEL: Readonly<Record<AlternativeConsideration, string>> = { CONSIDERED: "Alternative, considered", NOT_CONSIDERED: "Alternative, not considered" };

export const COPY_CHECK_LABEL: Readonly<Record<CopyCheck, string>> = {
  MATCH: "Paper copy matches the estimate",
  MISMATCH: "Paper copy differs from the estimate",
  NOT_IN_BOX: "Paper copy not in the box",
};

export const INVITED_READING_LABEL: Readonly<Record<InvitedCountReading, string>> = { PURCHASERS: "Bidders who bought the documents", INVITEES: "Bidders sent a letter of invitation" };
export const UNPURCHASED_LABEL: Readonly<Record<UnpurchasedConsequence, string>> = { ELIMINATE: "Not carried to evaluation", REPORT: "Carried, and reported to the committee" };
export const PERIOD_UNIT_LABEL: Readonly<Record<PeriodUnit, string>> = { DAYS: "days", WEEKS: "weeks", MONTHS: "months" };

export const GROUND_LABEL: Readonly<Record<Ground, string>> = {
  INCOMPLETE: "Mandatory document missing",
  NOT_PURCHASED: "No live purchase of the documents",
  NOT_INVITED: "Not on the invitee list",
  NOT_EVIDENCED: "Restriction certificate not valid on closing day",
  ALTERNATIVE_NOT_CONSIDERED: "Alternative not permitted: recorded, not considered",
  NOT_ELIGIBLE: "Not eligible on the supplier register",
};

export const REPORTED_LABEL: Readonly<Record<Reported, string>> = {
  INCOMPLETE_REPORTED: "Mandatory document missing: reported to the committee",
  NOT_PURCHASED_REPORTED: "No live purchase: reported to the committee",
  NOT_INVITED_REPORTED: "Not on the invitee list: reported to the committee",
  NOT_ELIGIBLE_REPORTED: "Not eligible on the register: reported to the committee",
};

/// What the Opening tab says once (C-2), in the information button beside its title. Not an `info` callout (0005, founder 2026-10-19).
export const OPENING_STATEMENT = {
  title: "About the opening",
  body: "Two present panel members each authorise the opening, signed in as themselves. Nobody authorises for another.",
} as const;

/// The benchmark row before disclosure (OD-2 A).
export const SEALED_UNTIL_FINALISED = "Withheld until the schedule is finalised";
/// 20c: what stands where a bidder's name would be, for a reader who is not a named opening officer, between the unseal and finalising of an online opening.
export const NAMES_AT_FINALISING = "Shown once finalised. Until then only opening officers see names";

const d = (f: Finding, k: string) => String(f.data?.[k] ?? "");
const n = (f: Finding, k: string) => Number(f.data?.[k] ?? 0);
/// fix R-6: how a verdict treated a bidder the supplier register found not eligible.
const TREATMENT: Record<string, string> = { ELIMINATE: "eliminated", REPORT: "reported to the committee", NONE: "not judged" };
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const day = (f: Finding, k: string) => (f.data?.[k] ? formatDate(String(f.data[k])) : "no day recorded");

/// Refusals (0005 R1): what blocks it, then who or what clears it. A pointer to a setting is not counted.
const TEXT: Readonly<Record<string, (f: Finding) => string>> = {
  // ---- every act on the opened record
  FINALISED: () => "Finalised. Nothing on it changes. A late tender opens at a supplementary opening.",
  ADJOURNED: () => "Adjourned. Resume it and have two present members authorise first.",
  NOT_UNSEALED: (f) => (n(f, "online") === 1 ? `Not unsealed. All ${n(f, "required")} named opening officers must authorise first.` : "Not opened. Two present panel members must authorise first."),
  SITTING_NOT_AUTHORISED: (f) => (n(f, "online") === 1 ? `Sitting not authorised. All ${n(f, "required")} named officers must authorise it.` : "Sitting not authorised. Two present members must authorise it."),
  NOT_THIS_OPENING: () => "That offer was read at another opening.",
  PERSON_REQUIRED: () => "Name the officer recording it.",
  REASON_REQUIRED: () => "Give the reason.",
  // ---- the panel
  COMMITTEE_NOT_SET: () => `No opening committee named. Set it under ${SETTING_AT.methodRules}.`,
  MAIN_COMMITTEE_GONE: () => "The main opening's committee is retired. A supplementary opening needs that committee.",
  COMMITTEE_NOT_FOUND: () => `Committee not configured or retired. Correct it under ${SETTING_AT.methodRules}.`,
  PANEL_EMPTY: () => "Pick panel members from the committee's seats.",
  PICKED_TWICE: (f) => `${d(f, "person")} is picked twice.`,
  NOT_ON_COMMITTEE: (f) => `${d(f, "person")} held no committee seat on the opening day.`,
  PERSON_INACTIVE: (f) => `${d(f, "person")} is not an active person.`,
  // ---- the officers named on the exercise (SR-07, ruling 11)
  OFFICERS_SHORT: (f) => `Name ${plural(Number(d(f, "required")), "opening officer", "opening officers")}: ${Number(d(f, "named")) === 0 ? "none named" : `${Number(d(f, "named"))} named`}.`,
  OFFICERS_TOO_MANY: (f) => `${plural(Number(d(f, "required")), "officer is", "officers are")} needed, ${Number(d(f, "named"))} named. Remove one.`,
  OFFICER_IS_ADMINISTRATOR: (f) => `${d(f, "person")} is an administrator. Administrators do not open bids. Name someone else.`,
  EXERCISE_CANCELLED: () => "Cancelled. Opening officers stay as they were.",
  AFTER_CLOSING: () => "Closing has passed. Officers cannot change. If one cannot take part, the exercise must be re-tendered.",
  OPENING_STARTED: () => "Opening started. Its officers stay as they are.",
  AUTHORITY_REQUIRED: () => "Name the authority for the change.",
  PANEL_SIZE_NOT_SET: () => `Panel size not set. Set it under ${SETTING_AT.committee}.`,
  PANEL_SIZE_DIFFERS: (f) => `Committee panel is ${n(f, "required")}, ${n(f, "picked")} picked. Another size needs authority, reason and recorder.`,
  PANEL_SIZE_OVERRIDDEN: (f) => `Panel of ${n(f, "picked")}, not ${n(f, "required")}, under recorded authority.`,
  OVERRIDE_AUTHORITY_REQUIRED: () => "Name the authority for the other panel size.",
  OVERRIDE_REASON_REQUIRED: () => "Say why the panel size differs.",
  OVERRIDE_PERSON_REQUIRED: () => "Name the officer recording the other panel size.",
  FEWER_THAN_TWO_PRESENT: () => "Two panel members must be present to authorise.",
  MEMBER_ABSENT: (f) => `${d(f, "person")} is absent and cannot authorise, initial or sign.`,
  EXCLUSION_RULE_NOT_SET: () => `Independence rule not set. Panel not checked. Set it under ${SETTING_AT.committee}.`,
  EXCLUDED_UNIT_NOT_SET: () => `Independence rule names no unit. Set it under ${SETTING_AT.committee}.`,
  MEMBER_IN_EXCLUDED_UNIT: (f) => `${d(f, "person")} sits in a unit the independence rule excludes.`,
  UNIT_NOT_RECORDED: (f) => (d(f, "notInStructure") === "yes" ? `${d(f, "person")}'s unit is not in the structure in force. Correct it under ${SETTING_AT.users} or Configuration › Organisation.` : `${d(f, "person")}'s unit is not recorded. Record it under ${SETTING_AT.users}.`),
  // ---- starting
  CANCELLED: () => "Cancelled. Nothing more is opened or recorded.",
  NOT_PUBLISHED: () => "Not published through its invitation window. No opening here.",
  NO_TENDER_DOCUMENTS: () => "No tender or quotation documents. No opening.",
  TIME_ZONE_NOT_SET: () => "Time zone not set. Set it under Configuration › Organisation.",
  NOT_CLOSED: () => "The window has not closed yet.",
  BOX_NOT_LOCKED: () => "Box not recorded locked after closing. Record it on Received first.",
  KEY_NOT_LIVE: () => "No live sealing key. Bids cannot be opened.",
  ONLINE_FINALISE_ELSEWHERE: () => "Online bids finalise only under Finalising on this tab. Nothing was finalised.",
  // ---- the online finalise (step 15)
  ONLINE_FILE_CLASS_NOT_SET: () => `Class for filed bid files not set. Nothing finalised. Set it under Configuration › Documents.`,
  ONLINE_FILE_CLASS_NOT_SULIT: () => `Class for filed bid files is no longer SULIT. Nothing finalised. Correct it under Configuration › Documents.`,
  ONLINE_STORE_UNAVAILABLE: () => `Sealed files unreadable from the store. Nothing finalised. Try again.`,
  ONLINE_BID_NOT_FOUND: (f) => `Offer ${n(f, "listingNo")}'s sealed submission is missing. Nothing finalised.`,
  ONLINE_GRANT_MISSING: (f) => `Your key does not open offer ${n(f, "listingNo")}. Nothing finalised.`,
  ONLINE_GRANT_UNREADABLE: (f) => `Offer ${n(f, "listingNo")}'s sealed grant would not open. Nothing finalised.`,
  ONLINE_BYTES_MISSING: (f) => `A file of offer ${n(f, "listingNo")} is not in the store. Nothing finalised.`,
  ONLINE_FILE_UNREADABLE: (f) => `A file of offer ${n(f, "listingNo")} did not open whole. Nothing finalised.`,
  ONLINE_DIGEST_MISMATCH: (f) => `A file of offer ${n(f, "listingNo")} no longer matches its digest. Nothing finalised.`,
  ONLINE_DECLARATION_UNREADABLE: (f) => `Offer ${n(f, "listingNo")}'s declaration did not open whole. Nothing finalised.`,
  ONLINE_ESTIMATE_UNREADABLE: () => "The sealed estimate did not open whole. Nothing finalised.",
  ONLINE_STATE_CHANGED: () => "The opening changed during checks. Nothing finalised. Try again.",
  ONLINE_NOT_ALL_SIGNED: () => "Every named officer signs first. Nothing finalised.",
  ALREADY_FINALISED: () => "Already finalised.",
  ADMINISTRATOR: () => "Administrators do not open, sign for or finalise bids.",
  KEY_OFFICERS_MISMATCH: (f) => (n(f, "waiting") === 1
    ? "An officer substitution is unfinished. After closing it cannot complete: the exercise must be re-tendered."
    : n(f, "keyOfficers") === n(f, "officers")
    ? `Officers differ from those the key was split across. Each must set their share again.`
    : `Key split across ${n(f, "keyOfficers")} officers, ${n(f, "officers")} named. Each must set their share again.`),
  OFFICERS_FEWER_THAN_TWO: () => "An online opening needs two named opening officers.",
  SKEW_NOT_ELAPSED: (f) => `Closing just passed. Try again in ${plural(n(f, "seconds"), "second", "seconds")}.`,
  CHANGE_PENDING: () => "A window change awaits approval. The opening waits for it.",
  MAIN_EXISTS: () => "Opening already started. Late tenders open at a supplementary opening.",
  // ---- the estimate's lead time (6.2)
  ESTIMATE_RULE_NOT_SET: () => `Company estimate rule not set. Set it under ${SETTING_AT.estimate}.`,
  ESTIMATE_NOT_LODGED: () => "The method needs a company estimate. None lodged.",
  LEAD_NOT_SET: () => `Estimate lead time not set. Set it under ${SETTING_AT.estimate}.`,
  CLOSING_NOT_SET: () => "No closing recorded.",
  ESTIMATE_LATE: (f) => `Estimate dated ${day(f, "lastVersionDay")}, after ${day(f, "lastPermittedDay")}. Opens only on an override with a reason.`,
  OVERRIDE_NOT_PERMITTED: () => `No office may override a late estimate. Set one under ${SETTING_AT.estimate}.`,
  NOT_HOLDER: () => "That officer lacks the office that may override a late estimate.",
  // ---- the online unseal (ADR 0036 D10): a bid that does not match its own record blocks the whole unseal, and is named by its receipt's number, never by its supplier
  BID_MANIFEST_DIGEST: (f) => `Bid number ${n(f, "sequence")}'s sealed record does not match its row. Nothing opened, authorisation not recorded.`,
  BID_DECLARATION_DIGEST: (f) => `Bid number ${n(f, "sequence")}'s sealed price does not match its record. Nothing opened.`,
  BID_MANIFEST_BINDING: (f) => `Bid number ${n(f, "sequence")}'s sealed record disagrees with its row. Nothing opened.`,
  BID_PARENT: (f) => `Alternative number ${n(f, "sequence")} is linked to the wrong bid. Nothing opened.`,
  BID_FILES: (f) => `Bid number ${n(f, "sequence")}'s files differ from its sealed record. Nothing opened.`,
  BID_RECEIPT_DIGEST: (f) => `Bid number ${n(f, "sequence")}'s receipt digest does not recompute. Nothing opened.`,
  BID_NOT_IN_ROLL: (f) => `Bid number ${n(f, "sequence")} is not in the frozen list. Nothing opened.`,
  BID_ROLL_CHANGED: (f) => `Bid number ${n(f, "sequence")} no longer matches the frozen list. Nothing opened.`,
  BID_KEY: (f) => `Bid number ${n(f, "sequence")} was sealed under a key that is not live. Nothing opened.`,
  PARTY_NOT_FOUND: (f) => `Bid number ${n(f, "sequence")}'s supplier is not a bidder here. Nothing opened.`,
  PEPPER_NOT_HELD: () => "This exercise was sealed under a pepper this copy of the system does not hold, so the key cannot be unlocked here. Whoever runs the system must restore that pepper. Nothing was counted against the officer's passphrase.",
  SHARES_INCOMPLETE: () => "Released shares do not make the key: one is missing or retired. Nothing opened.",
  SHARES_MISMATCH: () => "Released shares do not recombine to the key. Nothing opened.",
  OFFICER_KEY_CHANGED: () => "Your key changed while authorising. Nothing recorded. Try again.",
  ROLL_NOT_FROZEN: () => "No frozen list of bids received. It cannot be unsealed.",
  NOT_ONLINE: () => "This exercise does not take bids online.",
  NOT_NAMED_OFFICER: () => "Only a named opening officer on this panel can authorise.",
  NOT_ON_PANEL_ONLINE: () => "Named officers differ from this panel. Nothing recorded.",
  // ---- a supplementary opening
  MAIN_NOT_FINALISED: () => "The main opening is not finalised yet.",
  DECISION_NOT_LATE_TENDER: () => "That decision is not a late tender admission.",
  NOT_ADMITTED: () => "Not admitted by the committee. The envelope stays sealed and is returned.",
  ALREADY_OPENED_FOR: () => "That envelope already has its supplementary opening.",
  LATE_ENVELOPE_NOT_SEALED: () => "Not a late envelope still sealed on the register.",
  // ---- authorisations (C-2, OD-11)
  ALREADY_AUTHORISED: () => "Already authorised. The second must be another member.",
  SITTING_AUTHORISED: (f) => (n(f, "online") === 1 ? `All ${n(f, "required")} named officers have authorised.` : "Two members have authorised."),
  SAME_HAND: () => "The two authorisations must come from two different people.",
  NOT_ON_PANEL: () => "Not on this opening's panel.",
  ABSENT: () => "Recorded absent from the opening.",
  AT_OR_BEFORE_CLOSING: () => "Opens only after the closing second. An envelope in that second is in time.",
  ALREADY_ADJOURNED: () => "Already adjourned.",
  NOT_ADJOURNED: () => "Not adjourned.",
  // ---- the box
  LOCK_GAP: (f) => `Box locked ${d(f, "gap")} after closing. Envelopes count as in time.`,
  LOCKED_AT_CLOSING: () => "Box locked in the closing second.",
  NOT_MAIN: () => "Only the main opening opens the box.",
  BOX_EMPTIED: () => "An envelope is already opened. Register every envelope first.",
  NOT_A_BID: () => "The company estimate is not a bid.",
  MARKINGS_REQUIRED: () => "Copy the markings on the envelope.",
  NOT_LOCKED_AFTER_CLOSING: () => "No lock recorded at or after closing.",
  // ---- withdrawals
  OPEN_REFUSED_WITHDRAWN: () => "Matched to a withdrawal. Not opened, listed as withdrawn.",
  ALREADY_MATCHED: () => "Withdrawal already matched to an envelope.",
  FINDING_RECORDED: () => "A finding is already recorded.",
  NOT_A_BOX_ENVELOPE: () => "Only envelopes found in the box are matched here.",
  LATE_ENVELOPE: () => "A late envelope cannot be matched to a withdrawal.",
  ENVELOPE_NOT_RECEIVED: () => "That envelope is not unopened on the register.",
  ENVELOPE_MATCHED: () => "That envelope is matched to another withdrawal.",
  ALREADY_FOUND: () => "A finding is already recorded.",
  FINDING_REQUIRED: () => "Say what the panel found.",
  WITHDRAWAL_UNRESOLVED: (f) => `${plural(n(f, "count"), "withdrawal is", "withdrawals are")} unmatched and unexplained.`,
  // ---- findings and the checklist
  RESTRICTION_NOT_ANSWERED: () => "Restricted or not: not answered on its documents.",
  RESTRICTION_EVIDENCE_TYPE_NOT_SET: () => CLOSING_FAULT_WORDS.EVIDENCE_TYPE_NOT_SET,
  RESTRICTION_CLOSING_DAY_RULE_NOT_SET: () => CLOSING_FAULT_WORDS.CLOSING_DAY_RULE_NOT_SET,
  RESTRICTION_NOT_ASSESSED: () => "Restriction not assessed. A status document awaits verification. No verdict yet.",
  NOT_ON_CHECKLIST: () => "Not on this opening's checklist.",
  ANSWER_REQUIRED: () => "Choose present, absent or not applicable.",
  CHECKLIST_NOT_JUDGED: (f) => `Whether bidders return ${d(f, "parts")} was never set. Not judged. Cancel from Tender documents › Publishing.`,
  ANSWERS_INCOMPLETE: (f) => `${plural(n(f, "count"), "checklist item is", "checklist items are")} unanswered.`,
  CONSEQUENCE_NOT_SET: () => `Incomplete-bid consequence was never set. No verdict. Cancel from Tender documents › Publishing.`,
  UNPURCHASED_CONSEQUENCE_NOT_SET: () => `Consequence for unpurchased or uninvited bids not set. Set it under ${SETTING_AT.methodRules}.`,
  INELIGIBLE_CONSEQUENCE_NOT_SET: () => "Consequence for an ineligible bidder not set. Set it under Configuration › Supplier register.",
  VERDICT_UNDER_OTHER_SETTING: (f) => `Offer ${d(f, "listingNo")}'s verdict was ${TREATMENT[d(f, "was")] ?? "judged otherwise"}, now ${TREATMENT[d(f, "now")] ?? "otherwise"}. Record it again.`,
  VERDICT_NO_LONGER_STANDS: (f) => {
    const list = (k: string) => d(f, k).split(",").filter(Boolean).map((g) => (GROUND_LABEL as Record<string, string>)[g]?.toLowerCase() ?? "a ground no longer named");
    const added = list("added");
    const removed = list("removed");
    const what = [...(added.length ? [`now against it: ${added.join("; ")}`] : []), ...(removed.length ? [`no longer against it: ${removed.join("; ")}`] : [])].join("; and ");
    return `Offer ${d(f, "listingNo")}'s ${d(f, "verdict") === "PASS" ? "carrying" : "rejection"} no longer stands${what ? ` (${what})` : ""}. Record it again.`;
  },
  ALTERNATIVES_NOT_STATED: () => "Alternatives not stated on the window. None marked. Answer it before publication.",
  // ---- opening an envelope
  ENVELOPE_NOT_FOUND: () => "Not on this exercise's register.",
  ESTIMATE_NOT_A_BID: () => "The estimate's envelope opens only when the schedule is finalised.",
  ALREADY_OPENED: () => "Already opened.",
  LATE_NOT_ADMITTED: () => "A late envelope opens only if admitted, at a supplementary opening.",
  NOT_THE_ADMITTED_ENVELOPE: () => "A supplementary opening opens only its admitted envelope.",
  PARENT_NOT_OPENED: () => "Open the main offer first.",
  PRICE_REQUIRED: () => "Give the price as read.",
  BIDDER_REQUIRED: () => "Pick the bidder, or give its name as read.",
  REGISTRATION_REQUIRED: () => "Give the registration number as read.",
  PARTY_EXISTS: () => "That registration number is already a bidder. Pick it from the list.",
  PERIOD_INCOMPLETE: () => "Give the completion period with its unit, or neither.",
  MAIN_NOT_OPENED: () => "Open the envelope's main offer first.",
  NOTHING_CHANGED: () => "Nothing differs from the record.",
  // Review S6 (ADR 0036 D10, ruling 20): an online bid's price is written only by the finalise, so before it there is no read price to correct.
  PRICE_NOT_READ: () => "Price not read yet. Online prices unseal at finalising.",
  // ---- verdicts
  VERDICT_REQUIRED: () => "Choose carried or not carried.",
  PASS_WITH_MISSING_DOCUMENT: (f) => `${d(f, "missing")} is missing. It cannot be carried.`,
  PASS_WITHOUT_PURCHASE: () => "No live purchase of the documents. It cannot be carried.",
  PASS_NOT_INVITED: () => "Not on the invitee list. It cannot be carried.",
  PASS_NOT_EVIDENCED: () => "Restriction certificate not evidenced valid on the closing day. Not eligible.",
  PASS_ALTERNATIVE_NOT_CONSIDERED: () => "Alternatives are not permitted. Recorded, never considered.",
  PASS_NOT_ELIGIBLE: () => "Not eligible on the supplier register. It cannot be carried.",
  REJECT_ON_COMPLETENESS_NOT_PERMITTED: () => "The method reports incomplete bids to the committee. No rejection here.",
  REJECT_WITHOUT_GROUND: () => "No eliminating ground stands. The opening carries it. Other concerns go in the minutes.",
  // ---- the estimate's copy (C-1)
  ESTIMATE_COPY_UNEXPLAINED: (f) => `${f.data?.check === "NOT_IN_BOX" ? "Paper copy not in the box" : "Paper copy differs from the lodged estimate"}. Unexplained. Evaluation and award wait.`,
  NOT_FINALISED: () => "Not finalised yet.",
  NOTHING_TO_EXPLAIN: () => "The paper copy matched. Nothing to explain.",
  ALREADY_EXPLAINED: () => "Already explained. It is never edited.",
  EXPLANATION_REQUIRED: () => "Give the explanation.",
  ESTIMATE_COPY_NOT_ANSWERED: (f) => f.data?.online ? "No sealed estimate copy was lodged for the officers. Nothing to compare." : "Enter the paper copy's figure, or record it not in the box.",
  // ---- the schedule and finalising
  READING_NOT_SET: () => `How invited tenderers are counted is not set. Set it under ${SETTING_AT.openingPolicy}.`,
  ENVELOPE_UNOPENED: (f) => `${plural(n(f, "count"), "envelope in time is", "envelopes in time are")} neither opened nor withdrawn.`,
  ADMITTED_NOT_OPENED: () => "The admitted envelope is not opened yet.",
  INITIAL_MISSING: (f) => `Offer ${n(f, "listingNo")} lacks ${d(f, "person")}'s initial.`,
  CHECKLIST_UNANSWERED: (f) => `Offer ${n(f, "listingNo")}: ${plural(n(f, "count"), "checklist item", "checklist items")} unanswered.`,
  VERDICT_UNSET: (f) => `Offer ${n(f, "listingNo")} has no verdict.`,
  PAGES_NOT_SET: () => "Enter the signed schedule's page count.",
  SIGNATURE_MISSING: (f) => `${d(f, "person")}'s signature is not recorded.`,
  PAGES_POSITIVE: () => "Give the page count, one or more.",
  SEALED_FIGURE_ON_PAPER: () => "The signed schedule shows the estimate. Attach its scan after finalising.",
  SIGNED_SCHEDULE_NOT_ATTACHED: (f) => `Signed schedule scan${f.data?.supplementary ? ` of supplementary opening ${n(f, "supplementary")}` : ""} not attached. Attach it on Schedule.`,
  ALREADY_RECORDED: () => "Already recorded.",
  DAY_REQUIRED: () => "Give the day written on the paper.",
  DAY_IN_FUTURE: () => "That day has not come yet.",
  DAY_BEFORE_OPENING: () => "That day is before the opening started.",
  // ---- the award (C-7, C-8)
  OPENING_NOT_STARTED: () => "Bids not opened. Start the opening on Bids and opening › Opening.",
  OPENING_NOT_FINALISED: () => "Opening not finalised. An award follows its finalised schedule.",
  SUPPLEMENTARY_NOT_FINALISED: (f) => `Supplementary opening ${n(f, "supplementary")} is not finalised.`,
  ADMITTED_UNOPENED: (f) => `${plural(n(f, "count"), "admitted late tender is", "admitted late tenders are")} unopened. Open before the award.`,
  AWARDEE_NOT_NAMED: () => "Name a bidder carried to evaluation.",
  AWARDEE_NOT_CARRIED: () => "That bidder was not carried to evaluation.",
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
