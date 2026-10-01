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
import type { PanelFault, PanelState, VerifyFault } from "./panel";
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
  SCAN_GONE: "Verified, but its signed form is no longer attached",
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

/// The lead-time state as a short badge, and how seriously it reads.
export const LEAD_STATE_BADGE: Readonly<Record<LeadState, { label: string; tone: "ok" | "warn" | "err" | "neutral" }>> = {
  READY: { label: "Ready", tone: "ok" },
  LATE: { label: "Late", tone: "err" },
  NOT_PREPARED: { label: "Not prepared", tone: "warn" },
  LEAD_NOT_SET: { label: "Lead time not set", tone: "warn" },
  CLOSING_NOT_SET: { label: "Closing not set", tone: "neutral" },
  TIME_ZONE_NOT_SET: { label: "Time zone not set", tone: "warn" },
};

export type ScopeCode =
  | FinaliseFault
  | DraftFault
  | PanelFault
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
  // The acts themselves.
  | "NO_ORGANISATION"
  | "EXERCISE_GONE"
  | "RECORD_GONE"
  | "PERSON_UNKNOWN"
  | "CHANGED"
  | "QUANTITY_INVALID"
  | "RATE_INVALID"
  | "VALUE_INVALID"
  | "PROVENANCE_REQUIRED"
  | "CODE_TAKEN"
  | "DESCRIPTION_REQUIRED"
  | "SECTION_REQUIRED";

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
  PREPARER_NOT_QUALIFIED: (d) => `The preparer does not hold ${d.qualification ?? "the configured qualification"} on ${d.on ? formatDate(String(d.on)) : "today"}. Record their qualification under Configuration, Users and roles, or name a qualified preparer.`,
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
  BQ_NOT_FINALISED: "The bill the panel names is not the finalised one. Name the finalised version.",
  SCAN_REQUIRED: "Attach the signed panel form, scanned and filed as SULIT, before marking the panel verified.",
  COLUMN_UNKNOWN: "That column is not configured. Choose one from the panel form.",
  ALREADY_VERIFIED: "That column is already verified. Edit the panel to clear its verifications first.",
  DAY_REQUIRED: "Give the day it was verified.",
  DAY_IN_FUTURE: "The day it was verified cannot be after today.",
  PANEL_VERIFIED: "The panel is verified. Edit it to clear its verifications before recording another.",
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
  PANEL_SCAN_GONE: "The panel's signed form is no longer attached. Attach it again and verify the panel again.",
  METHOD_NOT_CONFIGURED: "The exercise's sourcing method is no longer configured. Configure it under Configuration, Reference data.",
  ESTIMATE_RULE_NOT_SET: `Whether this sourcing method needs a company estimate is not set. ${SET_IT}`,
  ESTIMATE_NOT_LODGED: "The company estimate is not lodged. Prepare and lodge it under Scope and estimate, Company estimate.",
  ESTIMATE_BEHIND: "The estimate was amended after it was lodged. Lodge the current version.",
  // the acts
  NO_ORGANISATION: "No organisation is configured. Run npm run setup first.",
  EXERCISE_GONE: "That exercise no longer exists.",
  RECORD_GONE: "That record no longer exists. Reload the page.",
  PERSON_UNKNOWN: "Choose someone on record and active.",
  CHANGED: "The record changed while this was being saved. Reload and try again.",
  QUANTITY_INVALID: "Give the quantity as a number, to three decimal places at most.",
  RATE_INVALID: "Give the rate as an amount, to the sen.",
  VALUE_INVALID: "Give the estimate as an amount, to the sen.",
  PROVENANCE_REQUIRED: "Say where this comes from: stated, observed or assumed.",
  CODE_TAKEN: "That code is already used.",
  DESCRIPTION_REQUIRED: "Give the line's description.",
  SECTION_REQUIRED: "Choose the section.",
};

export const SCOPE_CODES = Object.keys(TEXT) as ScopeCode[];

/// The words for a finding or a bare code. Unknown codes read as a plain refusal, never as the code.
export function scopeFaultText(f: Finding | ScopeCode): string {
  const { code, data } = typeof f === "string" ? { code: f, data: undefined } : f;
  const t = (TEXT as Record<string, (typeof TEXT)[ScopeCode]>)[code];
  if (t == null) return "This was refused.";
  return typeof t === "function" ? t(data ?? {}) : t;
}
