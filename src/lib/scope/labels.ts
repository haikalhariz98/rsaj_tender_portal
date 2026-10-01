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

/// Where an estimate's figure or amendment reason would be: the same words everywhere.
export const SEALED_TEXT = "Sealed";
export const sealedVersion = (versionNo: number) => `Sealed (version ${versionNo})`;

/// OD-7 and the BQ tab (OD-8).
export const FIRM_NOT_STATED = "Not stated";
export const BQ_READABLE_STATEMENT = "Priced rates and totals are readable by anyone with access to the portal; the bill issued to tenderers is unpriced.";
/// The Company estimate section (OD-1, 6.2 conditions: names the Phase 3 electronic tender box).
export const ESTIMATE_SEALED_STATEMENT =
  "The figure is withheld from every screen, including this one, until the bids are opened. Nobody signs in yet, so the portal cannot stop someone reading it from the database: sealed storage arrives with the electronic tender box (Phase 3).";
/// The Scope section's readiness card (OD-4).
export const PACK_CARD_HEADING = "Checked when the documents go for approval, not yet enforced";
export const ATTESTED = "recorded on behalf of, not signed";
export const NOT_SET = "Not set";
/// Where a configured value came from (the three-state honesty of AGENTS.md).
export const PROVENANCE_LABEL: Readonly<Record<"STATED" | "OBSERVED" | "ASSUMED", string>> = { STATED: "Stated", OBSERVED: "Observed", ASSUMED: "Assumed" };
export const NO_LIMIT = "No limit set";

/// How many people verified a panel, against the most its form allows: a count of people is not
/// "3 of 6", which reads as three of six having done it.
export const signatoriesText = (people: number, limit: number | null) => (limit == null ? `${people} · ${NO_LIMIT}` : `${people} (at most ${limit})`);
/// The lead-time reading (OD-3), shown with it.
export const LEAD_READING = "Ready when the last version was made on or before the closing day less the lead (an assumed reading).";

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
      return "The organisation's time zone is not set, so the closing day is not known. Set it under Configuration, Organisation.";
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
  if (rule == null) return { state: "METHOD_GONE", title: "No company estimate yet", body: "The exercise's sourcing method is no longer configured, so whether an estimate is needed is not known. Configure it under Configuration, Reference data." };
  if (rule.required == null) return { state: "RULE_NOT_SET", title: "Whether one is needed is not set", body: `Whether this sourcing method needs a company estimate is not set. ${SET_IT}` };
  if (rule.required === false) {
    const how = rule.provenance ? (PROVENANCE_LABEL as Record<string, string>)[rule.provenance]?.toLowerCase() : null;
    return { state: "NOT_NEEDED", title: `Not needed for this method${how ? ` (${how})` : ""}`, body: "The sourcing method does not ask for a company estimate. One can still be prepared if the department wants it." };
  }
  return { state: "NEEDED", title: "No company estimate yet", body: voidedBefore ? "The earlier estimate was voided. A new officer prepares a fresh one from version 1." : "Prepare it before the tender documents go for approval: this sourcing method asks for one." };
}

/// Said on the Amend drawer for an estimate already lodged: the lodged copy is then behind.
export const AMEND_LODGED_NOTE = "This estimate is already lodged. Amending it makes a new version, and the new version has to be lodged again before the documents go for approval.";

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
const TOO_LARGE_TEXT = "The figure is too large to record: an amount holds at most 16 digits before the decimal point.";
const SIZE_TEXT: Readonly<Record<string, string>> = {
  quantity: "The quantity is too large to record: at most 15 digits before the decimal point.",
  rate: "The rate is too large to record: at most 16 digits before the decimal point.",
  amount: "Quantity times rate is too large to record: a line's amount holds at most 16 digits before the decimal point.",
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
  | "NO_OPEN_SITTING";

const TEXT: Readonly<Record<ScopeCode, string | ((d: Record<string, string | number | null>) => string)>> = {
  // bq.ts
  NOT_DRAFT: "Only a draft is changed or finalised. Start a revision to change a finalised bill.",
  EXERCISE_CANCELLED: "The exercise is cancelled, so its scope, bill and estimate are not changed.",
  NO_ITEMS: "The bill has no lines. Add its sections and lines first.",
  ITEM_INCOMPLETE: (d) => `${d.count === 1 ? "One line has" : d.count != null ? `${d.count} lines have` : "Some lines have"} no description, quantity or rate${d.first ? ` (the first is ${d.first})` : ""}. Complete ${d.count === 1 ? "it" : "them"} before finalising.`,
  SCOPED_BY_NOT_SET: "Say who scoped the work.",
  STANDARD_NOT_SET: `The measurement standard a bill follows is not set. ${SET_IT}`,
  STANDARD_UNANSWERED: "Answer whether the bill follows the measurement standard.",
  DEPARTURES_REQUIRED: "The bill does not follow the measurement standard: state its departures.",
  PREPARER_REQUIRED: "Name who prepared the bill.",
  QUALIFICATION_NOT_SET: `The qualification a bill's preparer must hold is not set. ${SET_IT}`,
  PREPARER_NOT_QUALIFIED: (d) => `The preparer does not hold ${d.qualification ?? "the configured qualification"} on ${d.on ? formatDate(String(d.on)) : "today"}. Record their qualification under Configuration, Scope and estimate (Qualifications), or name a qualified preparer.`,
  TIME_ZONE_NOT_SET: "The organisation's time zone is not set, so today is not known. Set it under Configuration, Organisation.",
  DRAFT_EXISTS: "A revision is already being drafted. Finalise it, or carry on editing it.",
  ALREADY_STARTED: "The bill is already started. Edit its draft, or start a revision of the finalised version.",
  NOTHING_FINALISED: "A revision follows a finalised version. Finalise the draft first.",
  REASON_REQUIRED: "Give the reason.",
  // panel.ts
  COLUMNS_NOT_SET: `The panel's verification columns are not set. ${SET_IT}`,
  COLUMN_UNVERIFIED: (d) => `${d.column ?? "A column"} is not verified yet. Record who verified it.`,
  OVER_SIGNATORY_LIMIT: (d) => (d.signatories != null && d.limit != null ? `${d.signatories} people verified the panel; the form allows ${d.limit}.` : "More people verified the panel than the form allows.") + " Clear a verification and record it under a person already named.",
  LIMIT_NOT_SET: `No signatory limit is set, so the number of verifiers is not checked. ${SET_IT}`,
  LISTS_NOT_SET: `The lists of contract kinds and project statuses are not set, so each is specified in words. ${SET_IT}`,
  KIND_NOT_SET: "Choose the contract kind, or specify it.",
  STATUS_NOT_SET: "Choose the project status, or specify it.",
  BQ_NOT_NAMED: "The contract basis is let on a bill of quantities: name the finalised bill the panel certifies.",
  // Two findings share this code: the panel's (names a bill that is not the finalised one) and the
  // documents' readiness (no finalised bill). Only the readiness one carries `started`.
  BQ_NOT_FINALISED: (d) =>
    d.started == null
      ? "The bill the panel names is not the finalised one. Name the finalised version."
      : d.started === 0
        ? "The bill of quantities is not started. Start and finalise it under Scope and estimate, Bill of quantities."
        : "The bill of quantities has no finalised version yet. Finalise it under Scope and estimate, Bill of quantities.",
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
  PERSON_REQUIRED: "Name the person this is recorded on behalf of.",
  SECOND_PREPARER: "An estimate has one preparer. If they cannot continue, void this estimate before it is lodged and a new officer prepares a fresh one.",
  AFTER_CLOSING: "The closing date has passed, so the estimate is not amended.",
  CLOSING_NOT_SET: "Closing not set: amendments are checked against the closing date once the tender documents are approved.",
  DISCLOSED: "The estimate was disclosed at opening, so it is not changed.",
  VOID: "This estimate is void. Prepare a fresh one.",
  LIVE_ESTIMATE_EXISTS: "This exercise already has an estimate that is not void. Amend it, or void it before it is lodged.",
  ALREADY_VOID: "This estimate is already void.",
  AFTER_LODGEMENT: "A lodged estimate is not voided: it stands as lodged and is amended only by its preparer before closing.",
  ALREADY_LODGED: "The current version is already lodged.",
  NOT_LODGED: "Lodge the estimate first.",
  PLACE_REQUIRED: "Say where the retained copy is kept.",
  ALREADY_RETAINED: "The retained copy of the lodged version is already recorded.",
  CLASSIFICATION_LOWERED: "The estimate is SULIT and is never classified lower.",
  OVERRIDE_NOT_PERMITTED: `No office may accept a late estimate: none is set. ${SET_IT}`,
  NOT_HOLDER: "That person does not hold the office that may accept a late estimate.",
  ALREADY_DISCLOSED: "The estimate is already disclosed.",
  SEALED: "The figure is sealed until the bids are opened.",
  CUSTODY_NOT_SET: `Who holds the estimate's copies is not set. ${SET_IT}`,
  NOT_IN_CUSTODY: "That person does not hold the estimate's copies.",
  // pack.ts
  BASIS_NOT_CHOSEN: "Choose the exercise's contract basis on its Contract type tab.",
  BASIS_BQ_NOT_SET: `Whether the contract basis is let on a bill of quantities is not set. ${SET_IT}`,
  BQ_REVISION_OPEN: "A revision of the bill is being drafted; the finalised version is the one that goes with the documents.",
  PANEL_NOT_VERIFIED: "The specification panel is not verified. Complete it under Scope and estimate, Scope.",
  PANEL_SCAN_GONE: "The scan of the signed form the panel was verified on has been withdrawn or taken off, so the panel no longer counts as verified. A scan attached since does not count by itself: make sure a SULIT scan of the signed form is attached, then use Mark verified on the panel to verify it again.",
  PANEL_BILL_SUPERSEDED: (d) => `The specification panel was verified on version ${d.panelVersion ?? "?"} of the bill, which is no longer the finalised one${d.current != null ? ` (version ${d.current} is)` : ""}. Edit the panel under Scope and estimate, Scope to name the current bill, then verify it again.`,
  METHOD_NOT_CONFIGURED: "The exercise's sourcing method is no longer configured. Configure it under Configuration, Reference data.",
  ESTIMATE_RULE_NOT_SET: `Whether this sourcing method needs a company estimate is not set. ${SET_IT}`,
  ESTIMATE_NOT_LODGED: "The company estimate is not lodged. Prepare and lodge it under Scope and estimate, Company estimate.",
  ESTIMATE_BEHIND: "The estimate was amended after it was lodged. Lodge the current version.",
  SCOPE_RULE_NOT_SET: `Whether this sourcing method needs its scope approved by a committee is not set. ${SET_IT}`,
  SCOPE_COMMITTEE_NOT_SET: `This sourcing method needs its scope approved by a committee, and which committee is not set. ${SET_IT}`,
  SCOPE_ACT_NOT_SET: `This sourcing method needs its scope approved by a committee, and the act the committee discharges on it is not set, so nothing is tabled and no decision reads as approval. ${SET_IT}`,
  SCOPE_NOT_APPROVED: (d) => `The scope is not approved: ${SCOPE_STATE_TEXT[(d.state as ScopeApprovalState) ?? "NOT_TABLED"] ?? SCOPE_STATE_TEXT.NOT_TABLED} See Scope and estimate, Scope.`,
  // scope-matter.ts
  SCOPE_NOT_REQUIRED: "This sourcing method does not ask for its scope to be approved by a committee, so nothing is tabled.",
  VERSION_NOT_FINALISED: "Only the finalised bill is tabled. Finalise the draft first.",
  OTHER_EXERCISE: "That bill belongs to another exercise.",
  OTHER_COMMITTEE: "That sitting is of another committee. Scope is tabled at a sitting of the committee the sourcing method names.",
  OTHER_ACT: "Scope is tabled under the act the sourcing method names, and no other. Change the act under Configuration, Scope and estimate if it is wrong.",
  SITTING_CLOSED: "That sitting is minuted or cancelled, so nothing more is tabled at it. Choose a sitting that is scheduled or in progress, or schedule one under Committees.",
  SCOPE_ALREADY_WAITING: (d) =>
    `This version is already tabled${d.sitting ? ` at ${d.sitting}` : ""} and waiting for the decision.${d.tabledUnderEarlierRule ? " It was tabled under the rule configured then; to table it under today's, withdraw it from that sitting first." : ""}`,
  SCOPE_ALREADY_APPROVED: "The scope of this version is already approved.",
  SCOPE_RETURNED: "The committee returned this version. Start a revision of the bill, finalise it, and table the new version.",
  SCOPE_ENDED: "The committee ended this matter, so this version is not tabled again. Revise the bill and table the new version, or cancel the exercise.",
  // rates.ts
  SCHEDULE_NOT_IN_FORCE: (d) => `No issue of ${d.schedule ?? "that schedule"} is in force on ${d.on ? formatDate(String(d.on)) : "today"}. Issue one under Configuration, Scope and estimate, or enter the rate.`,
  ITEM_NOT_IN_ISSUE: (d) => `Issue ${d.issue ?? ""} of ${d.schedule ?? "the schedule"} has no item ${d.item ?? "of that code"}. Choose an item of the issue in force.`,
  ISSUE_FROZEN: "This issue is issued, so it is not changed. Start a new issue of the schedule.",
  LABEL_REQUIRED: "Name the schedule.",
  ITEM_CODE_REQUIRED: "Give the item's code.",
  ITEM_DESCRIPTION_REQUIRED: "Give the item's description.",
  RATE_NEGATIVE: "A rate is not below zero.",
  ISSUE_NO_ITEMS: "The issue has no items. Add them before issuing it.",
  EFFECTIVE_REQUIRED: "Give the day the issue takes effect from.",
  EFFECTIVE_NOT_AFTER_CURRENT: (d) => `Issue ${d.issue ?? ""} took effect on ${d.current ? formatDate(String(d.current)) : "an earlier day"}. A new issue takes effect after that day.`,
  ISSUER_REQUIRED: "Name who issued it, recorded on their behalf, not signed.",
  ISSUE_DRAFT_EXISTS: "A draft issue of this schedule is already open. Carry on with it, or issue it first.",
  // the acts
  NO_ORGANISATION: "No organisation is configured. Run npm run setup first.",
  EXERCISE_GONE: "That exercise no longer exists.",
  RECORD_GONE: "That record no longer exists. Reload the page.",
  PERSON_UNKNOWN: "Choose someone on record and active.",
  CHANGED: "The record changed while this was being saved. Reload and try again.",
  QUANTITY_INVALID: "Give the quantity as a number, to three decimal places at most.",
  SECTION_NUMBER_REPEATED: (d) => `Section ${d.numbers ?? ""} is used more than once in this version. Give each section its own number, or move the lines into one section and remove the other.`,
  RATE_INVALID: "Give the rate as an amount, to the sen.",
  TIMED_OUT: "Nothing was saved: this took longer than one save is allowed, so all of it was undone. Try again; for an import, a shorter file goes through.",
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
  DRAFT_NOT_EMPTY: "The draft already has lines. Tick “Replace the draft's lines” to import over them, or remove them first.",
  NO_DRAFT: "A file is imported into a draft. Start the bill, or a revision of it, first.",
  NO_OPEN_SITTING: (d) => `No sitting of the ${d.committee ?? "committee"} is scheduled or in progress. Schedule one under Committees, then table the scope there.`,
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
  NOT_TABLED: "the finalised bill has not been tabled. Table it at a sitting of the committee.",
  PENDING: "the finalised bill is tabled and waiting for the committee's decision.",
  DEFERRED: "the committee deferred it. Table it again at a later sitting.",
  APPROVED: "approved by the committee.",
  RETURNED: "the committee returned it. Revise the bill, finalise the revision and table it.",
  ENDED: "the committee ended the matter. Revise the bill and table the new version, or cancel the exercise.",
  OUTCOME_NOT_RECORDED: "the committee did not carry it and no outcome was recorded, so it cannot be read either way. Table it again.",
};

export const SCOPE_STATE_BADGE: Readonly<Record<ScopeApprovalState, { label: string; tone: "ok" | "warn" | "err" | "neutral" | "info" }>> = {
  METHOD_NOT_CONFIGURED: { label: "Method not configured", tone: "err" },
  RULE_NOT_SET: { label: "Rule not set", tone: "warn" },
  NOT_REQUIRED: { label: "Not required", tone: "neutral" },
  COMMITTEE_NOT_SET: { label: "Committee not set", tone: "warn" },
  ACT_NOT_SET: { label: "Act not set", tone: "warn" },
  NO_FINALISED_BILL: { label: "No finalised bill", tone: "warn" },
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
export function scopeApprovalLine(a: ScopeApproval, today: string | null, formatDay: (d: Date) => string = (d) => formatDate(d)): string {
  const committee = a.decisive?.record?.committee ?? a.decisive?.committeeName ?? today;
  const v = a.versionNo != null ? `Version ${a.versionNo} of the bill` : "The bill";
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
      return `${v}: ${SCOPE_STATE_TEXT[a.state]}${where ? ` (${where})` : ""}${earlier}`;
    case "NOT_TABLED":
      return `${v}: not tabled yet. Table it at a sitting of the ${committee ?? "committee"}.${earlier}`;
    default:
      return `Scope approval: ${SCOPE_STATE_TEXT[a.state]}${earlier}`;
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
    ? " The decision stands as it was taken; the rule configured today applies to what is tabled next."
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
  STRAY_QUOTE: () => "A quote mark sits inside a cell that is not quoted. Quote the whole cell, doubling the quote inside it.",
  NO_HEADER: () => `The first row is not a header. It names the columns: ${["Section", "Section title", "Item", "Description", "Unit", "Kind", "Quantity", "Rate", "Amount", "Provisional"].join(", ")}.`,
  COLUMN_MISSING: (d) => `The header has no ${d.column ?? "required"} column.`,
  COLUMN_REPEATED: (d) => `The header names ${d.column ?? "a column"} twice.`,
  COLUMN_UNKNOWN: (d) => `The column “${d.column ?? ""}” is not one the bill reads, so it is ignored.`,
  NO_LINES: () => "The file has a header and no lines.",
  WRONG_CELL_COUNT: (d) => `This row has ${d.found ?? "a different number of"} cells; the header has ${d.expected ?? "another number"}.`,
  SECTION_REQUIRED: () => "Give the line's section number.",
  SECTION_TITLE_DIFFERS: (d) => `Section ${d.section ?? ""} is given another title${d.first ? ` on line ${d.first}` : ""}. Use one title per section.`,
  DESCRIPTION_REQUIRED: () => "Give the line's description.",
  KIND_UNKNOWN: (d) => `“${d.kind ?? ""}” is not a kind of line. Use Measured work, Prime cost sum or Provisional sum, or leave it blank for measured work.`,
  QUANTITY_INVALID: (d) => `“${d.quantity ?? ""}” is not a quantity: a number, to three decimal places at most.`,
  TOO_LARGE: (d) => SIZE_TEXT[d.field as string] ?? TOO_LARGE_TEXT,
  TEXT_TOO_LONG: (d) => `The ${CSV_COLUMN_WORDS[String(d.column)] ?? "text"} is longer than ${Number(d.max ?? 0).toLocaleString("en-GB")} characters, the most the bill takes. Shorten it in the file.`,
  FORMULA_LIKE_CELL: (d) => `${d.columns ?? "A cell"}: starts with = + - or @, which a spreadsheet may read as a formula. It is read as text here, and the file is kept exactly as received; open it with care.`,
  TOO_MANY_LINES: (d) => `The file has ${Number(d.lines ?? 0).toLocaleString("en-GB")} lines; one import takes at most ${Number(d.max ?? 0).toLocaleString("en-GB")}. Nothing was imported. Import the bill in a file of that length or less, and enter the rest of its lines on the draft.`,
  RATE_INVALID: (d) => `“${d.rate ?? ""}” is not a rate: an amount to the sen, not below zero.`,
  AMOUNT_INVALID: (d) => `“${d.amount ?? ""}” is not an amount, so it is not compared. Amounts are worked out from quantity and rate.`,
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
  `Line ${m.line}: the file says ${formatSen(m.keyed)}; quantity times rate is ${m.computed == null ? "not worked out (a quantity or rate is missing)" : formatSen(m.computed)}. The file's amount is ignored.`;

/// The Bill of quantities section's words for import and export.
export const CSV_IMPORT_NOTE = "The file is kept with this version of the bill, as received. Amounts are worked out from quantity and rate; an Amount column is only compared, and differences are listed.";
export const CSV_EXPORT_NOTE = "Built by the portal from the bill's lines only, and recorded in its history. The unpriced file has no rate or amount column.";

/// A scope matter's bill version, as the sitting names it beside the exercise's reference.
export const scopeMatterRecordNote = (v: { versionNo: number; status: BqStatus }) =>
  `version ${v.versionNo}${v.status === "SUPERSEDED" ? ", since superseded by a revision" : ""}`;
