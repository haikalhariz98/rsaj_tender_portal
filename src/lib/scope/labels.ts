/**
 * Every word 6.2 puts on a screen, in a response or in a refusal. Codes, enum values and
 * rule keys never reach a screen (AGENTS.md rule 5): each has its label here. No text here
 * ever carries the estimate's figure or an amendment reason (the sealed-figure rule).
 */

import { formatDate } from "@/lib/format";
import { formatSen, type Sen } from "@/lib/money";

import type { DraftFault, FinaliseFault } from "./bq";
import type { ClassificationFault, DiscloseFault, LeadState, LodgeFault, OverrideFault, RetainFault, StartFault, VersionFault, ViewFault, VoidFault } from "./estimate";
import type { PackFault } from "./pack";
import type { BqCsvFault, ImportBlock } from "./csv";
import type { MarkVerifiedFault, PanelFault, PanelState, VerifyFault } from "./panel";
import type { PriceFault, RateScheduleStatus, ScheduleFault } from "./rates";
import type { ScopeApproval, ScopeApprovalState, ScopeCitationFault } from "./scope-matter";
import type { TakeSettingFault } from "./switches";
import type { BqItemKind, BqRateSource, BqScopedBy, BqStatus, EstimateEventKind, EstimateState, Finding } from "./types";

/// Where the scope and estimate rules are set.
export const SCOPE_CONFIG_PATH = "/configuration/scope";
const SET_IT = "Set it under Configuration, Scope and estimate.";

export const BQ_STATUS_LABEL: Readonly<Record<BqStatus, string>> = { DRAFT: "Draft", FINALISED: "Finalised", SUPERSEDED: "Superseded" };
export const SCOPED_BY_LABEL: Readonly<Record<BqScopedBy, string>> = {
  IMPLEMENTING_DEPARTMENT: "The implementing department",
  SPECIALIST_CONTRACTOR: "The specialist contractor",
  COORDINATION_MEETING: "The coordination meeting",
};
export const ITEM_KIND_LABEL: Readonly<Record<BqItemKind, string>> = { MEASURED: "Measured work", PRIME_COST_SUM: "Prime cost sum", PROVISIONAL_SUM: "Provisional sum" };
export const RATE_SOURCE_LABEL: Readonly<Record<BqRateSource, string>> = { ENTERED: "Rate entered", SCHEDULE: "Rate from the schedule" };
export const PROVISIONAL_CHIP = "Provisional";
export const PANEL_STATE_LABEL: Readonly<Record<PanelState, string>> = {
  NONE: "Not started",
  DRAFT: "Draft",
  VERIFIED: "Verified",
  SCAN_GONE: "Verified, but the scan it was verified on is no longer live",
};
export const ESTIMATE_STATE_LABEL: Readonly<Record<EstimateState, string>> = { DRAFT: "Being prepared", LODGED: "Lodged", DISCLOSED: "Disclosed at opening", VOID: "Void" };
export const EVENT_KIND_LABEL: Readonly<Record<EstimateEventKind, string>> = {
  PREPARED: "Prepared",
  AMENDED: "Amended",
  LODGED: "Lodged",
  RETAINED: "Copy retained",
  LATE_OVERRIDE: "Late estimate accepted",
  DISCLOSED: "Disclosed at opening",
  VOIDED: "Voided",
};

/// Where an estimate's figure or amendment reason would be: the same words everywhere. The figure is withheld from view and held unencrypted
/// (ruling 20cw (b), AC-63), so it is never called sealed: only a copy sealed under the exercise key is.
export const WITHHELD_TEXT = "Withheld from view, held unencrypted";
export const withheldVersion = (versionNo: number) => `Withheld from view, held unencrypted (version ${versionNo})`;

/// OD-7 and the BQ tab (OD-8).
export const FIRM_NOT_STATED = "Not stated";
export const BQ_READABLE_STATEMENT = "Rates, amounts and totals are SULIT: read only by people named on the exercise and chosen roles. Every reading is logged. Tenderers get an unpriced bill.";
export const NOT_SET = "Not set";
/// Where a configured value came from (the three-state honesty of AGENTS.md).
export const PROVENANCE_LABEL: Readonly<Record<"STATED" | "OBSERVED" | "ASSUMED", string>> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
export const NO_LIMIT = "No limit set";

/// How many people verified a panel, against the most its form allows: a count of people is not
/// "3 of 6", which reads as three of six having done it.
export const signatoriesText = (people: number, limit: number | null) => (limit == null ? `${people} · ${NO_LIMIT}` : `${people} (at most ${limit})`);
/// The lead-time reading (OD-3), shown with it.
export const LEAD_READING = "Ready when the last version is made by closing day less the lead (assumed).";

const money = (s: Sen | null | undefined) => (s == null ? NOT_SET : formatSen(s));
export const firmValueText = (s: Sen | null) => (s == null ? FIRM_NOT_STATED : formatSen(s));
export { money as moneyOrNotSet };

export function leadTimeText(l: { state: LeadState; lastPermittedDay?: string; lastVersionDay?: string }): string {
  switch (l.state) {
    case "READY":
      return `Ready: the last version was made on ${formatDate(l.lastVersionDay!)}, on or before ${formatDate(l.lastPermittedDay!)}.`;
    case "LATE":
      return `Late: the last version was made on ${formatDate(l.lastVersionDay!)}, after ${formatDate(l.lastPermittedDay!)}.`;
    case "NOT_PREPARED":
      return `Not prepared yet. The last day for it is ${formatDate(l.lastPermittedDay!)}.`;
    case "LEAD_NOT_SET":
      return `How many days before closing the estimate is made is not set. ${SET_IT}`;
    case "CLOSING_NOT_SET":
      return "Closing not set: the closing date is recorded when the tender documents are approved.";
    case "TIME_ZONE_NOT_SET":
      return "Time zone not set. Closing day unknown.";
  }
}

/// The lead time the organisation has configured, in a sentence, so the line says how many days
/// its reading uses rather than leaving the officer to look it up.
export const leadConfiguredText = (days: number | null) =>
  days == null ? "No lead time is configured." : `The configured lead is ${days} ${days === 1 ? "day" : "days"} before the closing day.`;

/// A share as a percentage to one decimal place, half up, from the exact decimal string lib holds
/// ("6.4101" reads "6.4"; "35.0000" reads "35.0"). Display only: the exact figure stays in lib.
export function sharePercentText(exact: string): string {
  const m = /^(\d+)(?:\.(\d*))?$/.exec(exact.trim());
  if (!m) return exact;
  const frac = (m[2] ?? "").padEnd(2, "0");
  const tenths = BigInt(m[1] + frac[0]) + (frac[1] >= "5" ? 1n : 0n);
  const s = tenths.toString().padStart(2, "0");
  return `${s.slice(0, -1)}.${s.slice(-1)}%`;
}

/// What the Company estimate section's empty state says, by the method's rule for an estimate: not
/// needed (with where that came from), not set (never read as "not needed"), or needed.
export type EstimateEmpty = "NOT_NEEDED" | "RULE_NOT_SET" | "METHOD_GONE" | "NEEDED";
export function estimateEmptyState(rule: { required: boolean | null; provenance: string | null } | null, voidedBefore: boolean): { state: EstimateEmpty; title: string; body: string } {
  if (rule == null) return { state: "METHOD_GONE", title: "No company estimate yet", body: "Sourcing method no longer set. Estimate need unknown." };
  if (rule.required == null) return { state: "RULE_NOT_SET", title: "Whether one is needed is not set", body: `Whether this sourcing method needs a company estimate is not set. ${SET_IT}` };
  if (rule.required === false) {
    const how = rule.provenance ? (PROVENANCE_LABEL as Record<string, string>)[rule.provenance]?.toLowerCase() : null;
    return { state: "NOT_NEEDED", title: `Not needed for this method${how ? ` (${how})` : ""}`, body: "Method asks for no company estimate. One may still be prepared." };
  }
  return { state: "NEEDED", title: "No company estimate yet", body: voidedBefore ? "The earlier estimate was voided. A new officer prepares a fresh one from version 1." : "Prepare it before the tender documents go for approval: this sourcing method asks for one." };
}

/// Said on the Amend drawer for an estimate already lodged: the lodged copy is then behind.
export const AMEND_LODGED_NOTE = "Already lodged. Amending makes a new version to lodge again.";

/// The lead-time state as a short badge, and how seriously it reads.
export const LEAD_STATE_BADGE: Readonly<Record<LeadState, { label: string; tone: "ok" | "warn" | "err" | "neutral" }>> = {
  READY: { label: "Ready", tone: "ok" },
  LATE: { label: "Late", tone: "err" },
  NOT_PREPARED: { label: "Not prepared", tone: "warn" },
  LEAD_NOT_SET: { label: "Lead time not set", tone: "warn" },
  CLOSING_NOT_SET: { label: "Closing not set", tone: "neutral" },
  TIME_ZONE_NOT_SET: { label: "Time zone not set", tone: "warn" },
};

/// A CSV column as a sentence names it.
const CSV_COLUMN_WORDS: Readonly<Record<string, string>> = { Section: "section number", "Section title": "section title", Item: "item reference", Description: "description", Unit: "unit" };

/// A figure past its column's precision (Decimal(18, 3) quantities, Decimal(18, 2) money): fixed sentences, never the figure.
const TOO_LARGE_TEXT = "Too large: at most 16 digits before the decimal point.";
const SIZE_TEXT: Readonly<Record<string, string>> = {
  quantity: "The quantity is too large to record: at most 15 digits before the decimal point.",
  rate: "The rate is too large to record: at most 16 digits before the decimal point.",
  amount: "Amount too large: at most 16 digits before the decimal point.",
};

export type ScopeCode =
  | FinaliseFault
  | DraftFault
  | PanelFault
  | MarkVerifiedFault
  | VerifyFault
  | VersionFault
  | StartFault
  | VoidFault
  | LodgeFault
  | RetainFault
  | ClassificationFault
  | OverrideFault
  | DiscloseFault
  | ViewFault
  | PackFault
  | ScopeCitationFault
  | TakeSettingFault
  | PriceFault
  | ScheduleFault
  // The acts themselves.
  | "NO_ORGANISATION"
  | "EXERCISE_GONE"
  | "RECORD_GONE"
  | "PERSON_UNKNOWN"
  | "CHANGED"
  | "QUANTITY_INVALID"
  | "TIMED_OUT"
  | "RATE_INVALID"
  | "VALUE_INVALID"
  | "PROVENANCE_REQUIRED"
  | "CODE_TAKEN"
  | "DESCRIPTION_REQUIRED"
  | "SECTION_REQUIRED"
  | "SITTING_GONE"
  | "FILE_NOT_CSV"
  | "FILE_UNREADABLE"
  | "FILE_REFUSED"
  | "DRAFT_NOT_EMPTY"
  | "NO_DRAFT"
  | "NO_OPEN_SITTING"
  // SR-08 and SR-09: an act of a panel or an on-screen bill, on an exercise pinned off or not set.
  | "PANEL_NOT_USED"
  | "BILL_NOT_ON_SCREEN"
  | "PANEL_SWITCH_NOT_SET"
  | "BILL_SWITCH_NOT_SET_ACT"
  | "SWITCH_INVALID"
  | "NO_BILL_FILE";

const TEXT: Readonly<Record<ScopeCode, string | ((d: Record<string, string | number | null>) => string)>> = {
  // bq.ts
  NOT_DRAFT: "Only a draft is changed or finalised. Start a revision to change a finalised bill.",
  EXERCISE_CANCELLED: "The exercise is cancelled, so its scope, bill and estimate are not changed.",
  PACK_FROZEN: "Documents submitted on this bill and panel. Change after a return, or by addendum.",
  NO_ITEMS: "The bill has no lines. Add its sections and lines first.",
  ITEM_INCOMPLETE: (d) => `${d.count === 1 ? "One line has" : d.count != null ? `${d.count} lines have` : "Some lines have"} no description, quantity or rate${d.first ? ` (the first is ${d.first})` : ""}. Complete ${d.count === 1 ? "it" : "them"} before finalising.`,
  SCOPED_BY_NOT_SET: "Say who scoped the work.",
  STANDARD_NOT_SET: `The measurement standard a bill follows is not set. ${SET_IT}`,
  STANDARD_UNANSWERED: "Answer whether the bill follows the measurement standard.",
  DEPARTURES_REQUIRED: "The bill does not follow the measurement standard: state its departures.",
  PREPARER_REQUIRED: "Name who prepared the bill.",
  QUALIFICATION_NOT_SET: `The qualification a bill's preparer must hold is not set. ${SET_IT}`,
  PREPARER_NOT_QUALIFIED: (d) => `Preparer lacks ${d.qualification ?? "the qualification"} on ${d.on ? formatDate(String(d.on)) : "today"}. Record it under Configuration, Scope and estimate, or name another.`,
  TIME_ZONE_NOT_SET: "Time zone not set. Today unknown.",
  DRAFT_EXISTS: "A revision is already being drafted. Finalise it, or carry on editing it.",
  ALREADY_STARTED: "The bill is already started. Edit its draft, or start a revision of the finalised version.",
  NOTHING_FINALISED: "A revision follows a finalised version. Finalise the draft first.",
  REASON_REQUIRED: "Give the reason.",
  // panel.ts
  COLUMNS_NOT_SET: `The panel's verification columns are not set. ${SET_IT}`,
  COLUMN_UNVERIFIED: (d) => `${d.column ?? "A column"} is not verified yet. Record who verified it.`,
  OVER_SIGNATORY_LIMIT: (d) => (d.signatories != null && d.limit != null ? `${d.signatories} people verified the panel; the form allows ${d.limit}.` : "More people verified the panel than the form allows.") + " Clear a verification and record it under a person already named.",
  LIMIT_NOT_SET: `No signatory limit is set, so the number of verifiers is not checked. ${SET_IT}`,
  LISTS_NOT_SET: `Contract kinds and project statuses not set. Describe in words. ${SET_IT}`,
  KIND_NOT_SET: "Choose the contract kind, or specify it.",
  STATUS_NOT_SET: "Choose the project status, or specify it.",
  BQ_NOT_NAMED: "Name the finalised bill the panel certifies.",
  // Two findings share this code: the panel's (names a bill that is not the finalised one) and the
  // documents' readiness (no finalised bill). Only the readiness one carries `started`.
  BQ_NOT_FINALISED: (d) =>
    d.started == null
      ? "The bill the panel names is not the finalised one. Name the finalised version."
      : d.started === 0
        ? "Bill of quantities not started. Start and finalise it."
        : "Bill of quantities has no finalised version. Finalise it.",
  SCAN_REQUIRED: "Attach the signed panel form, scanned and filed as SULIT, before marking the panel verified.",
  COLUMN_UNKNOWN: "That column is not configured. Choose one from the panel form.",
  ALREADY_VERIFIED: "That column is already verified. Edit the panel to clear its verifications first.",
  DAY_REQUIRED: "Give the day it was verified.",
  DAY_IN_FUTURE: "The day it was verified cannot be after today.",
  PANEL_VERIFIED: "The panel is verified. Edit it to clear its verifications before recording another.",
  PANEL_NOT_STARTED: "Save the panel's details first.",
  PANEL_ALREADY_VERIFIED: "The panel is verified, on a scan that is still attached.",
  // estimate.ts
  NOT_POSITIVE: "Give the estimate as an amount above zero, to the sen.",
  PERSON_REQUIRED: "Name the person.",
  SECOND_PREPARER: "One preparer only. If they cannot continue, void it before lodging.",
  AFTER_CLOSING: "The closing date has passed, so the estimate is not amended.",
  CLOSING_NOT_SET: "Closing not set: amendments are checked against the closing date once the tender documents are approved.",
  DISCLOSED: "The estimate was disclosed at opening, so it is not changed.",
  VOID: "This estimate is void. Prepare a fresh one.",
  LIVE_ESTIMATE_EXISTS: "An estimate already exists. Amend it, or void it before lodging.",
  ALREADY_VOID: "This estimate is already void.",
  AFTER_LODGEMENT: "Lodged estimates stand. Only the preparer amends, before closing.",
  ALREADY_LODGED: "The current version is already lodged.",
  NOT_LODGED: "Lodge the estimate first.",
  PLACE_REQUIRED: "Say where the retained copy is kept.",
  ALREADY_RETAINED: "The retained copy of the lodged version is already recorded.",
  CLASSIFICATION_LOWERED: "The estimate is SULIT and is never classified lower.",
  OVERRIDE_NOT_PERMITTED: `No office may accept a late estimate: none is set. ${SET_IT}`,
  NOT_HOLDER: "That person does not hold the office that may accept a late estimate.",
  ALREADY_DISCLOSED: "The estimate is already disclosed.",
  SEALED: "The figure is withheld from view until it is disclosed, when the opening is finalised.",
  CUSTODY_NOT_SET: `Who holds the estimate's copies is not set. ${SET_IT}`,
  NOT_IN_CUSTODY: "That person does not hold the estimate's copies.",
  // pack.ts
  BASIS_NOT_CHOSEN: "Choose the exercise's contract basis by editing the exercise.",
  BASIS_BQ_NOT_SET: `Whether the contract basis is let on a bill of quantities is not set. ${SET_IT}`,
  BQ_REVISION_OPEN: "Revision in draft. The finalised version goes with the documents.",
  SPEC_PANEL_SWITCH_NOT_SET: "Specification panel is not set. Take the organisation's setting under Scope and estimate, Scope.",
  BILL_SWITCH_NOT_SET: "Bill of quantities on screen is not set. Take the organisation's setting under Scope and estimate, Scope.",
  PANEL_NOT_VERIFIED: "The specification panel is not verified. Complete it under Scope and estimate, Scope.",
  PANEL_SCAN_GONE: "Verified scan withdrawn, so the panel is not verified. Attach a SULIT scan, then verify again.",
  PANEL_BILL_SUPERSEDED: (d) => `Panel verified on bill version ${d.panelVersion ?? "?"}, no longer the finalised one${d.current != null ? ` (version ${d.current} is)` : ""}. Name the current bill, then verify again.`,
  METHOD_NOT_CONFIGURED: "The exercise's sourcing method is no longer configured. Configure it under Configuration, Reference data.",
  ESTIMATE_RULE_NOT_SET: `Whether this sourcing method needs a company estimate is not set. ${SET_IT}`,
  ESTIMATE_NOT_LODGED: "The company estimate is not lodged. Prepare and lodge it under Scope and estimate, Company estimate.",
  ESTIMATE_BEHIND: "The estimate was amended after it was lodged. Lodge the current version.",
  SCOPE_RULE_NOT_SET: `Whether this sourcing method needs its scope approved by a committee is not set. ${SET_IT}`,
  SCOPE_COMMITTEE_NOT_SET: `Scope needs committee approval. Committee not set. ${SET_IT}`,
  SCOPE_ACT_NOT_SET: `The act the committee discharges on scope is not set, so nothing is tabled. ${SET_IT}`,
  SCOPE_NOT_APPROVED: (d) => `The scope is not approved: ${scopeStateText((d.state as ScopeApprovalState) ?? "NOT_TABLED", d.file === 1)} See Scope and estimate, Scope.`,
  // SR-08, SR-09 and the take-the-setting act
  ALREADY_SUBMITTED: "Documents submitted. Switches frozen.",
  NOTHING_TO_TAKE: "Both switches are already set on this exercise, so there is nothing to take.",
  SETTING_NOT_SET: (d) => `The organisation has not set "${d.switch ?? "this switch"}". Set it under Configuration, Scope and estimate.`,
  PANEL_NOT_USED: "No specification panel. An earlier one stays readable.",
  PANEL_SWITCH_NOT_SET: "Whether this exercise uses a specification panel is not set. Take the organisation's setting first.",
  BILL_NOT_ON_SCREEN: "Bill is an uploaded file under Tender documents. An earlier bill stays readable.",
  BILL_SWITCH_NOT_SET_ACT: "Bill of quantities mode not set. Take the organisation's setting.",
  SWITCH_INVALID: "Choose used or not used.",
  NO_BILL_FILE: "There is no bill of quantities file to table. Upload it under Tender documents first.",
  // scope-matter.ts
  SCOPE_NOT_REQUIRED: "Method needs no committee scope approval.",
  VERSION_NOT_FINALISED: "Only the finalised bill is tabled. Finalise the draft first.",
  OTHER_EXERCISE: "That bill belongs to another exercise.",
  OTHER_COMMITTEE: "Wrong committee. Table scope at the method's committee.",
  OTHER_ACT: "Scope is tabled under the method's act only.",
  SITTING_CLOSED: "Sitting is minuted or cancelled. Choose a scheduled one.",
  SCOPE_ALREADY_WAITING: (d) =>
    `This version is already tabled${d.sitting ? ` at ${d.sitting}` : ""} and waiting for the decision.${d.tabledUnderEarlierRule ? " Tabled under an earlier rule. Withdraw it to use today's." : ""}`,
  SCOPE_ALREADY_APPROVED: "The scope of this version is already approved.",
  SCOPE_RETURNED: "Committee returned this version. Revise, finalise and table it again.",
  SCOPE_ENDED: "Committee ended this matter. Revise and table a new version, or cancel.",
  // rates.ts
  SCHEDULE_NOT_IN_FORCE: (d) => `No issue of ${d.schedule ?? "that schedule"} is in force on ${d.on ? formatDate(String(d.on)) : "today"}. Enter the rate.`,
  ITEM_NOT_IN_ISSUE: (d) => `Issue ${d.issue ?? ""} of ${d.schedule ?? "the schedule"} has no item ${d.item ?? "of that code"}.`,
  ISSUE_FROZEN: "This issue is issued, so it is not changed. Start a new issue of the schedule.",
  LABEL_REQUIRED: "Name the schedule.",
  ITEM_CODE_REQUIRED: "Give the item's code.",
  ITEM_DESCRIPTION_REQUIRED: "Give the item's description.",
  RATE_NEGATIVE: "A rate is not below zero.",
  ISSUE_NO_ITEMS: "The issue has no items. Add them before issuing it.",
  EFFECTIVE_REQUIRED: "Give the day the issue takes effect from.",
  EFFECTIVE_NOT_AFTER_CURRENT: (d) => `Issue ${d.issue ?? ""} took effect on ${d.current ? formatDate(String(d.current)) : "an earlier day"}. Start the new one later.`,
  ISSUER_REQUIRED: "Name who issued it.",
  ISSUE_DRAFT_EXISTS: "A draft issue is already open. Continue it or issue it.",
  // the acts
  NO_ORGANISATION: "No organisation is configured. Run npm run setup first.",
  EXERCISE_GONE: "That exercise no longer exists.",
  RECORD_GONE: "That record no longer exists. Reload the page.",
  PERSON_UNKNOWN: "Choose someone on record and active.",
  CHANGED: "The record changed while this was being saved. Reload and try again.",
  QUANTITY_INVALID: "Give the quantity as a number, to three decimal places at most.",
  SECTION_NUMBER_REPEATED: (d) => `Section ${d.numbers ?? ""} is used more than once. Give each its own number.`,
  RATE_INVALID: "Give the rate as an amount, to the sen.",
  TIMED_OUT: "Not saved: took too long, all undone. Try again, or use a shorter file.",
  TOO_LARGE: (d) => SIZE_TEXT[d.field as string] ?? TOO_LARGE_TEXT,
  VALUE_INVALID: "Give the estimate as an amount, to the sen.",
  PROVENANCE_REQUIRED: "Say where this comes from: stated, observed or assumed.",
  CODE_TAKEN: "That code is already used.",
  DESCRIPTION_REQUIRED: "Give the line's description.",
  SECTION_REQUIRED: "Choose the section.",
  SITTING_GONE: "That sitting no longer exists. Choose another.",
  FILE_NOT_CSV: "The file stored is not a CSV file. Upload the bill as a .csv file.",
  FILE_UNREADABLE: "The stored file could not be read back. Upload it again.",
  FILE_REFUSED: "The file was not imported. Correct it and upload it again.",
  DRAFT_NOT_EMPTY: "Draft has lines. Tick “Replace the draft's lines”, or remove them.",
  NO_DRAFT: "A file is imported into a draft. Start the bill, or a revision of it, first.",
  NO_OPEN_SITTING: (d) => `No ${d.committee ?? "committee"} sitting scheduled. Schedule one under Committees.`,
};

/// Why the import button is off (csv.ts `importBlock`), in the words shown beside it.
export const IMPORT_BLOCK_TEXT: Readonly<Record<ImportBlock, string>> = {
  FILE_REFUSED: "This file cannot be imported. Correct the problems listed above and choose it again.",
  NEEDS_REPLACE: "Turn on Replace to import into this draft.",
};

export const SCOPE_CODES = Object.keys(TEXT) as ScopeCode[];

/// The words for a finding or a bare code. Unknown codes read as a plain refusal, never as the code.
export function scopeFaultText(f: Finding | ScopeCode): string {
  const { code, data } = typeof f === "string" ? { code: f, data: undefined } : f;
  const t = (TEXT as Record<string, (typeof TEXT)[ScopeCode]>)[code];
  if (t == null) return "This was refused.";
  return typeof t === "function" ? t(data ?? {}) : t;
}

// ------------------------------------------------------------------ scope approval (increment 2)

/// What each state of scope approval says, with its way forward.
export const SCOPE_STATE_TEXT: Readonly<Record<ScopeApprovalState, string>> = {
  METHOD_NOT_CONFIGURED: "the exercise's sourcing method is no longer configured.",
  RULE_NOT_SET: `whether this sourcing method needs its scope approved is not set. ${SET_IT}`,
  NOT_REQUIRED: "this sourcing method does not ask for its scope to be approved by a committee.",
  COMMITTEE_NOT_SET: `which committee approves the scope is not set. ${SET_IT}`,
  ACT_NOT_SET: `the act the committee discharges on the scope is not set, so no decision reads as approval. ${SET_IT}`,
  NO_FINALISED_BILL: "there is no finalised bill to table yet. Finalise the bill of quantities first.",
  NO_BILL_PART: "the scope needs approval, and these tender documents have no bill of quantities part to upload the file to. Add the part under Configuration, Tender documents, or set under Configuration, Scope and estimate that this method needs no scope approval.",
  NOT_TABLED: "the finalised bill has not been tabled. Table it at a sitting of the committee.",
  PENDING: "the finalised bill is tabled and waiting for the committee's decision.",
  DEFERRED: "the committee deferred it. Table it again at a later sitting.",
  APPROVED: "approved by the committee.",
  RETURNED: "the committee returned it. Revise the bill, finalise the revision and table it.",
  ENDED: "the committee ended the matter. Revise and table a new version, or cancel.",
  OUTCOME_NOT_RECORDED: "the committee did not carry it and recorded no outcome. Table it again.",
};

/// SR-09: the same states where the bill is an uploaded file rather than built on screen.
const SCOPE_FILE_STATE_TEXT: Partial<Record<ScopeApprovalState, string>> = {
  NO_FINALISED_BILL: "no bill of quantities file is uploaded yet. Upload it under Tender documents.",
  NOT_TABLED: "the uploaded bill has not been tabled. Table it at a sitting.",
  PENDING: "the uploaded bill of quantities is tabled and waiting for the committee's decision.",
  RETURNED: "the committee returned it. Upload the revised file and table that version.",
  ENDED: "the committee ended the matter. Upload a revised file and table it, or cancel.",
};

/// The words for a scope state; `file`: the bill is an uploaded file (SR-09).
export const scopeStateText = (state: ScopeApprovalState, file: boolean): string => (file ? SCOPE_FILE_STATE_TEXT[state] : undefined) ?? SCOPE_STATE_TEXT[state];

export const SCOPE_STATE_BADGE: Readonly<Record<ScopeApprovalState, { label: string; tone: "ok" | "warn" | "err" | "neutral" | "info" }>> = {
  METHOD_NOT_CONFIGURED: { label: "Method not configured", tone: "err" },
  RULE_NOT_SET: { label: "Rule not set", tone: "warn" },
  NOT_REQUIRED: { label: "Not required", tone: "neutral" },
  COMMITTEE_NOT_SET: { label: "Committee not set", tone: "warn" },
  ACT_NOT_SET: { label: "Act not set", tone: "warn" },
  NO_FINALISED_BILL: { label: "No finalised bill", tone: "warn" },
  NO_BILL_PART: { label: "No bill part to approve", tone: "warn" },
  NOT_TABLED: { label: "Not tabled", tone: "warn" },
  PENDING: { label: "Waiting for the decision", tone: "info" },
  DEFERRED: { label: "Deferred", tone: "warn" },
  APPROVED: { label: "Approved", tone: "ok" },
  RETURNED: { label: "Returned", tone: "err" },
  ENDED: { label: "Ended", tone: "err" },
  OUTCOME_NOT_RECORDED: { label: "Outcome not recorded", tone: "err" },
};

/// The scope card's sentence: the state, the version and where it was decided or waits.
/// `committee` is today's; a matter decided or waiting is named by its own sitting's
/// committee (62-C1), which is today's unless configuration has moved on.
export function scopeApprovalLine(a: ScopeApproval, today: string | null, formatDay: (d: Date) => string = (d) => formatDate(d), file = false): string {
  const committee = a.decisive?.record?.committee ?? a.decisive?.committeeName ?? today;
  const what = file ? "the uploaded bill of quantities" : "the bill";
  const v = a.versionNo != null ? `Version ${a.versionNo} of ${what}` : file ? "The uploaded bill of quantities" : "The bill";
  const where = a.decisive?.record ? `${a.decisive.record.meetingReference}${a.decisive.record.decisionDate ? `, ${formatDay(a.decisive.record.decisionDate)}` : ""}` : (a.decisive?.sittingReference ?? null);
  const earlier = a.earlierApprovedVersionNo != null && a.state !== "APPROVED" ? ` Version ${a.earlierApprovedVersionNo} was approved; a finalised revision is approved in its own right.` : "";
  switch (a.state) {
    case "APPROVED":
      return `${v}: approved by the ${committee ?? "committee"}${where ? ` at ${where}` : ""}.`;
    case "PENDING":
      return `${v}: tabled${where ? ` at ${where}` : ""}, waiting for the ${committee ?? "committee"}'s decision.${earlier}`;
    case "RETURNED":
    case "ENDED":
    case "OUTCOME_NOT_RECORDED":
    case "DEFERRED":
      return `${v}: ${scopeStateText(a.state, file)}${where ? ` (${where})` : ""}${earlier}`;
    case "NOT_TABLED":
      return `${v}: not tabled yet. Table it at a sitting of the ${committee ?? "committee"}.${earlier}`;
    default:
      return `Scope approval: ${scopeStateText(a.state, file)}${earlier}`;
  }
}

/**
 * The scope card's warning where configuration has moved on since the deciding matter was
 * tabled (62-C1): both rules named, in words. A decision stands as taken under the rule it
 * was tabled under; a matter still waiting is decided under it too, or withdrawn and tabled
 * again under today's. `tabled` and `now` are "<act> by the <committee>" phrases, `now`
 * null where today's committee or act is not set.
 */
export function scopeRuleMovedNote(i: { decided: boolean; tabled: string; now: string | null; sitting: string | null }): string {
  const then = `This matter was tabled under the rule configured then: ${i.tabled}.`;
  const now = i.now ? ` Configuration now says: ${i.now}.` : " Configuration now leaves the committee or its act not set.";
  const exit = i.decided
    ? " The decision stands. Today's rule applies to what is tabled next."
    : ` It is decided under the rule it was tabled under. To table the bill under today's rule instead, withdraw it${i.sitting ? ` from ${i.sitting}` : ""} and table it again.`;
  return then + now + exit;
}

/// "<act> by the <committee>", for naming a rule in words (never codes).
export const scopeRuleWords = (actWords: string | null, committee: string | null) =>
  actWords && committee ? `${actWords} by the ${committee}` : null;

export const RATE_SCHEDULE_STATUS_LABEL: Readonly<Record<RateScheduleStatus, string>> = { DRAFT: "Draft", ISSUED: "Issued", SUPERSEDED: "Superseded" };

// ------------------------------------------------------------------ CSV (increment 2, OD-5)

const CSV_TEXT: Readonly<Record<BqCsvFault, (d: Record<string, string | number | null>) => string>> = {
  NOT_UTF8: () => "The file is not UTF-8 text. Save it from the spreadsheet as “CSV UTF-8”.",
  EMPTY_FILE: () => "The file is empty.",
  UNTERMINATED_QUOTE: () => "A quoted cell is never closed.",
  STRAY_QUOTE: () => "A quote mark sits in an unquoted cell. Quote the whole cell.",
  NO_HEADER: () => `First row is not a header. Columns: ${["Section", "Section title", "Item", "Description", "Unit", "Kind", "Quantity", "Rate", "Amount", "Provisional"].join(", ")}.`,
  COLUMN_MISSING: (d) => `The header has no ${d.column ?? "required"} column.`,
  COLUMN_REPEATED: (d) => `The header names ${d.column ?? "a column"} twice.`,
  COLUMN_UNKNOWN: (d) => `The column “${d.column ?? ""}” is not one the bill reads, so it is ignored.`,
  NO_LINES: () => "The file has a header and no lines.",
  WRONG_CELL_COUNT: (d) => `This row has ${d.found ?? "a different number of"} cells; the header has ${d.expected ?? "another number"}.`,
  SECTION_REQUIRED: () => "Give the line's section number.",
  SECTION_TITLE_DIFFERS: (d) => `Section ${d.section ?? ""} is given another title${d.first ? ` on line ${d.first}` : ""}. Use one title per section.`,
  DESCRIPTION_REQUIRED: () => "Give the line's description.",
  KIND_UNKNOWN: (d) => `“${d.kind ?? ""}” is not a line kind. Use Measured work, Prime cost sum or Provisional sum.`,
  QUANTITY_INVALID: (d) => `“${d.quantity ?? ""}” is not a quantity: a number, to three decimal places at most.`,
  TOO_LARGE: (d) => SIZE_TEXT[d.field as string] ?? TOO_LARGE_TEXT,
  TEXT_TOO_LONG: (d) => `${CSV_COLUMN_WORDS[String(d.column)] ?? "Text"} exceeds ${Number(d.max ?? 0).toLocaleString("en-GB")} characters. Shorten it.`,
  FORMULA_LIKE_CELL: (d) => `${d.columns ?? "A cell"}: starts with = + - or @, which a spreadsheet may read as a formula. Read as text here.`,
  TOO_MANY_LINES: (d) => `${Number(d.lines ?? 0).toLocaleString("en-GB")} lines; one import takes at most ${Number(d.max ?? 0).toLocaleString("en-GB")}. Nothing imported.`,
  RATE_INVALID: (d) => `“${d.rate ?? ""}” is not a rate: an amount to the sen, not below zero.`,
  AMOUNT_INVALID: (d) => `“${d.amount ?? ""}” is not an amount. Not compared.`,
  PROVISIONAL_UNKNOWN: (d) => `“${d.provisional ?? ""}” is not Yes or No.`,
  PROVISIONAL_NOT_MEASURED: () => "Only measured work is marked provisional. Prime cost and provisional sums are their own kinds.",
};

export const CSV_FAULT_CODES = Object.keys(CSV_TEXT) as BqCsvFault[];

/// A CSV finding in words, with the line it is on.
export function csvFaultText(f: Finding & { line?: number }): string {
  const t = (CSV_TEXT as Record<string, (d: Record<string, string | number | null>) => string>)[f.code];
  const words = t ? t(f.data ?? {}) : "This line was refused.";
  return f.line != null ? `Line ${f.line}: ${words}` : words;
}

/// A typed amount that is not the one worked out: reported and ignored.
export const keyedMismatchText = (m: { line: number; keyed: Sen; computed: Sen | null }) =>
  `Line ${m.line}: file says ${formatSen(m.keyed)}; quantity times rate is ${m.computed == null ? "not worked out" : formatSen(m.computed)}. File amount ignored.`;

/// The Bill of quantities section's words for import and export.
export const CSV_IMPORT_NOTE = "Kept as received. An Amount column is only compared.";
export const CSV_EXPORT_NOTE = "Built from the lines. No rate or amount column.";

/// A scope matter's bill version, as the sitting names it beside the exercise's reference.
export const scopeMatterRecordNote = (v: { versionNo: number; status: BqStatus }) =>
  `version ${v.versionNo}${v.status === "SUPERSEDED" ? ", since superseded by a revision" : ""}`;
