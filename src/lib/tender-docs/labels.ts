/**
 * The words for 6.4's vocabulary and findings. Codes never reach a screen (AGENTS.md
 * rule 5): every enum value, fault and behaviour key has a label here, and each finding
 * says what to do and where.
 */

import { BEHAVIOUR_LABEL } from "@/lib/method/labels";
import type { BehaviourKey } from "@/lib/method/profile";
import { scopeFaultText } from "@/lib/scope/labels";

import type { AppendixFault } from "./appendix";
import type { BehaviourFault } from "./behaviour";
import type { ContentFault, EditFault, PartActFault, ReadinessFault, RouteFault, StartFault, SubmitFindings } from "./pack";
import type { DatesFault } from "./tendering";
import type { AppendixStatus, Finding, LadKind, PackKind, PackPartState, PartContent, PartRole, PartSource, TenderPackStatus, UpliftKind } from "./types";

export const NOT_SET = "Not set";

export const PACK_KIND_LABEL: Readonly<Record<PackKind, string>> = {
  TENDER: "Tender documents",
  QUOTATION: "Quotation documents",
  NONE: "No document pack",
};

export const PART_ROLE_LABEL: Readonly<Record<PartRole, string>> = {
  INVITATION: "Invitation",
  INSTRUCTIONS: "Instructions to tenderers",
  FORM_OF_TENDER: "Form of tender",
  CONDITIONS: "Conditions of contract",
  APPENDIX: "Appendix to the conditions",
  LOA_SPECIMEN: "Specimen letter of acceptance",
  BOND_FORMS: "Bond and security forms",
  SPECIFICATION: "Specification",
  BILL_OF_QUANTITIES: "Bills of quantities",
  SUMMARY_AND_RATES: "Summary of tender and schedule of rates",
  REGISTRATION_BACKGROUND: "Registration and background",
  DECLARATION: "Tenderer's declaration",
  DRAWINGS: "Drawings",
  OTHER: "Other",
};

export const PART_CONTENT_LABEL: Readonly<Record<PartContent, string>> = {
  STANDARD: "Standard",
  BESPOKE: "Bespoke",
  MIXED: "Standard and bespoke",
};

export const PART_SOURCE_LABEL: Readonly<Record<PartSource, string>> = {
  TEMPLATE: "From the template library",
  BQ_UNPRICED: "The bill of quantities, unpriced",
  APPENDIX: "The Appendix entered here",
  UPLOAD: "A file uploaded to the part",
};

export const PACK_STATUS_LABEL: Readonly<Record<TenderPackStatus, string>> = {
  DRAFT: "Draft",
  SUBMITTED: "With approval",
  APPROVED: "Approved for tendering",
  RETURNED: "Returned for amendment",
  VOID: "Void",
};

export const PART_STATE_LABEL: Readonly<Record<PackPartState, string>> = {
  NOT_STARTED: "Not ready",
  READY: "Ready",
  OMITTED: "Omitted",
};

export const LAD_KIND_LABEL: Readonly<Record<LadKind, string>> = {
  AMOUNT_PER_DAY: "An amount a day",
  PERCENT_OF_SUM_PER_DAY: "A percentage of the contract sum a day",
};

export const UPLIFT_KIND_LABEL: Readonly<Record<UpliftKind, string>> = {
  AMOUNT: "An amount",
  PERCENT: "A percentage of the contract sum",
};

export const APPENDIX_STATUS_LABEL: Readonly<Record<AppendixStatus, string>> = {
  DRAFT: "Being entered",
  COMPLETE: "Complete",
};

/// A three-state answer in words: never a null read as "no".
export const yesNoNotSet = (b: boolean | null | undefined) => (b == null ? NOT_SET : b ? "Yes" : "No");

// ------------------------------------------------------------------ findings, in words


export const TENDER_DOCS_CONFIG_PATH = "/configuration/tender-documents";
const SET_PARTS = "Set it under Configuration, Tender documents.";
const d = (f: Finding, k: string) => (f.data?.[k] == null ? "" : String(f.data[k]));

const EDIT_TEXT: Record<EditFault, (f: Finding) => string> = {
  PACK_NOT_DRAFT: () => "This version of the tender documents is no longer a draft, so it stands as it was frozen. Changes are made on the next version, once it is returned for amendment.",
  EXERCISE_NOT_IN_PREPARATION: () => "The tender documents change only while the exercise is in preparation.",
};

const CONTENT_TEXT: Record<ContentFault, (f: Finding) => string> = {
  TEMPLATE_NOT_SET: (f) => `Part ${d(f, "part")} draws a library template and none is chosen. Choose one, or name it on the part under Configuration, Tender documents.`,
  TEMPLATE_BODY_EMPTY: (f) => `${f.data?.part ? `Part ${d(f, "part")}: the` : "The"} template ${d(f, "template")} has no text. Write it under Configuration, Templates.`,
  TEMPLATE_LANGUAGE_NOT_SET: (f) => `${f.data?.part ? `Part ${d(f, "part")}: the` : "The"} template ${d(f, "template")} has text in both languages and does not say which is issued first. Choose it under Configuration, Templates.`,
  TEMPLATE_UNKNOWN_FIELD: (f) => `${f.data?.part ? `Part ${d(f, "part")}: the` : "The"} template ${d(f, "template")} names ${d(f, "fields")}, which a tender document does not fill. Correct it under Configuration, Templates.`,
  BESPOKE_FROM_LIBRARY: (f) => `Part ${d(f, "part")} is prepared for this exercise, so it cannot be drawn from the template library. It is uploaded, or comes from the bill or the Appendix.`,
  BQ_PART_WITHOUT_BQ: (f) => `Part ${d(f, "part")} issues the bill of quantities unpriced, and the exercise has no finalised bill. Finalise it on the Bill of quantities tab.`,
  UPLOAD_MISSING: (f) => `Part ${d(f, "part")} has no file attached. Attach it to the part.`,
  APPENDIX_INCOMPLETE: (f) => `Part ${d(f, "part")} is the Appendix, which is not complete yet. Complete it on the Appendix page.`,
};

const PART_ACT_TEXT: Record<Exclude<PartActFault, EditFault | ContentFault>, (f: Finding) => string> = {
  ALREADY_READY: () => "This part is already marked ready.",
  ALREADY_OMITTED: () => "This part is already omitted.",
  MANDATORY_OMITTED: (f) => `Part ${d(f, "part")} is mandatory, so it cannot be omitted. Make it ready.`,
  MANDATORY_UNSET: (f) => `Whether part ${d(f, "part")} is mandatory is not set. ${SET_PARTS}`,
  OMIT_REASON_REQUIRED: (f) => `Say why part ${d(f, "part")} is omitted.`,
  NOT_A_TEMPLATE_PART: (f) => `Part ${d(f, "part")} does not draw a library template.`,
};

const READINESS_TEXT: Record<Exclude<ReadinessFault, ContentFault | "MANDATORY_UNSET" | "MANDATORY_OMITTED" | "OMIT_REASON_REQUIRED">, (f: Finding) => string> = {
  PART_NOT_READY: (f) => `Part ${d(f, "part")} is not ready. Make it ready, or omit it with the reason where it is not mandatory.`,
  DECLARATION_PART_MISSING: () => `Every tender and quotation pack binds the bidder's declaration as a mandatory part, and this pack's parts have none. Add a declaration part for this pack kind under Configuration, Tender documents.`,
  DECLARATION_NOT_MANDATORY: (f) => `The bidder's declaration (part ${d(f, "part")}) must be mandatory. ${SET_PARTS}`,
  NO_PARTS: () => "The pack has no parts.",
};

/// A part's or the pack's finding, in words.
export function partFaultText(f: Finding): string {
  const t = (EDIT_TEXT as Record<string, (f: Finding) => string>)[f.code] ?? (CONTENT_TEXT as Record<string, (f: Finding) => string>)[f.code] ?? (PART_ACT_TEXT as Record<string, (f: Finding) => string>)[f.code] ?? (READINESS_TEXT as Record<string, (f: Finding) => string>)[f.code];
  return t ? t(f) : "A check on the tender documents did not pass.";
}

const ROLE_WORDS = (role: string) => (PART_ROLE_LABEL as Record<string, string>)[role]?.toLowerCase() ?? "one role";

const START_TEXT: Record<StartFault, (f: Finding) => string> = {
  EXERCISE_NOT_IN_PREPARATION: () => "Tender documents are assembled once the exercise is in preparation. Move it into preparation first.",
  PREPARED_BEFORE_ASSEMBLY: () => "This exercise was prepared before tender document assembly existed, so it keeps the earlier path: its documents are prepared outside the portal and its award opens as before.",
  NO_PACK_FOR_METHOD: () => "This exercise's method assembles no tender documents, so there is no pack to prepare.",
  LIVE_PACK_EXISTS: () => "A version of the tender documents is already being prepared or is with approval.",
  PACK_APPROVED: () => "The tender documents are approved for tendering. A change now is an addendum (not yet available).",
  NO_PACK: () => "This exercise's method assembles no tender documents.",
  BASIS_NOT_SET: () => "The contract basis is not set, and the pack's parts follow it. Set it on the exercise's Contract type tab.",
  COMPOSITION_NOT_SET: () => `No parts are configured for this pack kind and contract basis. ${SET_PARTS}`,
  DUPLICATE_ROLE: (f) => `Two parts are configured as the ${ROLE_WORDS(d(f, "role"))} for this pack kind and basis, so which one the pack takes is unclear. Retire one under Configuration, Tender documents.`,
  NO_CONDITIONS_PART: () => `No conditions of contract part is configured for this pack kind and basis, so the pack names no standard form. ${SET_PARTS}`,
};

export const startFaultText = (f: Finding) => (START_TEXT as Record<string, (f: Finding) => string>)[f.code]?.(f) ?? "The tender documents cannot be started.";

const APPENDIX_TEXT: Record<AppendixFault | "APPENDIX_NOT_STARTED", (f: Finding) => string> = {
  FIELD_NOT_SET: (f) => `${d(f, "field")}: not set. Enter it on the Appendix page.`,
  FIELD_NOT_VALID: (f) => `${d(f, "field")}: not a percentage to six places. Correct it on the Appendix page.`,
  PC_SUM_TEXT_REQUIRED: () => "Say which prime cost sum work the contractor may tender for.",
  SECTIONS_REQUIRED: () => "Sectional completion applies: enter the sections and their liquidated damages.",
  SECTIONS_NOT_EXPECTED: () => "Sectional completion does not apply, and sections are entered. Remove them, or say it applies.",
  SECTION_LAD_NOT_SET: (f) => `Section ${d(f, "section")}: its liquidated damages are not set.`,
  VARIATION_LIMIT_NOT_SET: (f) => `${d(f, "holder")}: the variation limit is not set.`,
  DLP_MONTHS_NOT_EXPECTED: () => "The defects liability period does not apply, and months are entered. Remove them, or say it applies.",
  APPENDIX_NOT_STARTED: () => "The Appendix to the Conditions of Contract has not been entered. Enter it on the Appendix page.",
};

export const appendixFaultText = (f: Finding) => (APPENDIX_TEXT as Record<string, (f: Finding) => string>)[f.code]?.(f) ?? "The Appendix is not complete.";

const BEHAVIOUR_TEXT: Record<BehaviourFault, (f: Finding) => string> = {
  PROFILE_NOT_RECORDED: () => "The contract type's behaviours were not recorded when the exercise was decided, so the documents cannot be checked against them.",
  BEHAVIOUR_NOT_SET: (f) => `The contract type's ${BEHAVIOUR_LABEL[d(f, "behaviour") as BehaviourKey]?.toLowerCase() ?? "behaviour"} is not set. Set it on the contract type under Configuration, Reference data.`,
  DLP_MONTHS_REQUIRED: (f) =>
    f.data?.appendix === 0
      ? "The contract type has a defects liability period, and this pack has no Appendix to state it in. Add an Appendix part for this pack kind under Configuration, Tender documents."
      : "The contract type has a defects liability period: say it applies and enter its months on the Appendix page.",
  DLP_NOT_FOR_TYPE: () => "The contract type has no defects liability period, and the Appendix states one. Say it does not apply, on the Appendix page.",
  NOMINATION_NOT_FOR_TYPE: (f) =>
    f.data?.where === "BILL" ? "The contract type allows no nomination, and the bill holds a prime cost sum. Revise the bill." : "The contract type allows no nomination, and the Appendix states prime cost sum work. Remove it on the Appendix page.",
  BOND_FORMS_REQUIRED: () => "The contract type needs securities before the work starts, so the bond forms must be bound in as a mandatory part of the Tender Table Document. Configure the part under Configuration, Tender documents.",
};

export const behaviourFaultText = (f: Finding) => (BEHAVIOUR_TEXT as Record<string, (f: Finding) => string>)[f.code]?.(f) ?? "The contract type's behaviours are not met.";

const DATES_TEXT: Record<DatesFault, string> = {
  TIME_ZONE_NOT_SET: "The organisation's time zone is not set, so no tendering date can be judged. Set it under Configuration, Organisation.",
  DATES_REQUIRED: "Give the start day, and the closing day and time.",
  DATE_NOT_VALID: "A date is not a real date.",
  CLOSING_TIME_NOT_VALID: "Give the closing time as hours and minutes, 24-hour (14:30).",
  START_IN_PAST: "The start day has passed. Give today or a later day.",
  CLOSING_NOT_AFTER_START: "The closing day must be after the start day.",
};

export const datesFaultText = (f: Finding) => DATES_TEXT[f.code as DatesFault] ?? "The tendering dates are not valid.";

const ROUTE_TEXT: Record<RouteFault, (f: Finding) => string> = {
  NO_ISSUE_IN_FORCE: () => "No approval matrix is issued and in force today, so the approval for tendering cannot be routed. Issue one under Configuration, Approval matrix.",
  ROUTE_NO_METHOD_KEY: () => "The sourcing method is not tied to any approval rule. Set its approval matrix method under Configuration, Reference data.",
  ROUTE_NO_RULE: () => "No approval for tendering rule in the approval matrix matches this method and value. Add one under Configuration, Approval matrix.",
  ROUTE_HAS_COMMITTEE_STEP: () => "The route for approval for tendering includes a committee step, and an exercise cannot yet be tabled at a sitting. Change the rule so that offices decide it.",
  ROUTE_REFUSED: (f) => d(f, "text"),
  ROUTE_ERROR: (f) => d(f, "text"),
  ROUTE_OPEN: () => "An approval for tendering route is already open on this exercise.",
};

export const routeFaultText = (f: Finding) => (ROUTE_TEXT as Record<string, (f: Finding) => string>)[f.code]?.(f) ?? "The approval for tendering cannot be routed.";

/// Every submission finding in words, by its family; the scope's are 6.2's own sentences.
export function submitFindingTexts(s: SubmitFindings): { level: Finding["level"]; text: string; family: keyof SubmitFindings; code: string }[] {
  const out: { level: Finding["level"]; text: string; family: keyof SubmitFindings; code: string }[] = [];
  const add = (family: keyof SubmitFindings, fs: readonly Finding[], text: (f: Finding) => string) => fs.forEach((f) => out.push({ level: f.level, text: text(f), family, code: f.code }));
  add("edit", s.edit, partFaultText);
  add("readiness", s.readiness, partFaultText);
  add("scope", s.scope, (f) => scopeFaultText(f));
  add("appendix", s.appendix, appendixFaultText);
  add("behaviour", s.behaviour, behaviourFaultText);
  add("dates", s.dates, datesFaultText);
  add("route", s.route, routeFaultText);
  return out;
}

/// The behaviour card's two halves: checked on the documents here, and checked after award.
export const BEHAVIOUR_AFTER_AWARD_WHERE = { CONTRACT: "Checked when the contract is formed", POST_AWARD: "Checked after award, in contract administration" } as const;
