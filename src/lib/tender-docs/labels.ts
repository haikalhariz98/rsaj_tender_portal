/**
 * The words for 6.4's vocabulary and findings. Codes never reach a screen (AGENTS.md
 * rule 5): every enum value, fault and behaviour key has a label here, and each finding
 * says what to do and where.
 */

import { nameRouteLabel } from "@/lib/method/approval";
import { BEHAVIOUR_LABEL, TENDERING_STATE_LABEL } from "@/lib/method/labels";
import type { BehaviourKey } from "@/lib/method/profile";
import { DECISION_LABEL } from "@/lib/requisition/labels";
import { scopeFaultText } from "@/lib/scope/labels";
import { routeTone, stepTone, type StatusTone } from "@/lib/ui/status-tone";

import { APPENDIX_FIELD_LABEL, type AppendixField, type AppendixFault } from "./appendix";
import { conditionsFaultText, conditionsFixHref } from "./conditions-labels";
import type { BehaviourFault } from "./behaviour";
import type { ContentFault, EditFault, PartActFault, ReadinessFault, RouteFault, StartFault, SubmitFindings } from "./pack";
import type { DatesFault } from "./tendering";
import type { AppendixStatus, Finding, LadKind, PackKind, PackPartState, PartContent, PartRole, PartSource, TenderPackStatus, UpliftKind } from "./types";

export const NOT_SET = "Not set";
/// For an exercise prepared before tender documents were assembled here: nothing is missing, so it is not "Not set".
export const NOT_APPLICABLE_BEFORE_ASSEMBLY = "Not applicable: prepared before document assembly";

/// A period in months and days, the zero part left out: "2 months", "1 month 3 days", never "2 months 0 days".
export function periodText(months: number, days: number): string {
  const m = `${months} ${months === 1 ? "month" : "months"}`;
  const d = `${days} ${days === 1 ? "day" : "days"}`;
  if (months > 0 && days > 0) return `${m} ${d}`;
  return days > 0 ? d : m;
}

/// The pack is "Tender documents" everywhere. Trail rows written before that was settled name it
/// "Tender pack"; they read the same as the new ones.
export const trailLabel = (s: string) => s.replace(/\bTender pack v(\d)/g, "Tender documents v$1");

export { TENDERING_STATE_LABEL };

/// The Approval for Tendering route's status in words. Q-3, §7.3.2: a rejection returns the
/// documents for amendment, so a rejected route reads "Returned for amendment", never
/// "Refused". One label per state (UX 2): the route, the pack, the exercise and the list say
/// the same words; a route's other statuses read as an exercise route does.
export function tenderingRouteLabel(status: string, warnings: unknown): string {
  if (status === "REJECTED") return TENDERING_STATE_LABEL.RETURNED;
  if (status === "PENDING") return TENDERING_STATE_LABEL.WITH_APPROVAL;
  if (status === "APPROVED") return TENDERING_STATE_LABEL.APPROVED;
  return nameRouteLabel(status, warnings);
}

/// A returned route needs a person to amend the documents: amber, not the red of a refusal.
export function tenderingRouteTone(status: string): StatusTone {
  return status === "REJECTED" ? "warn" : routeTone(status);
}

/// A step of the route: a rejection there is the documents returned for amendment.
export function tenderingStepLabel(decision: "PENDING" | "DONE" | "REJECTED"): string {
  return decision === "REJECTED" ? TENDERING_STATE_LABEL.RETURNED : DECISION_LABEL[decision];
}
export const tenderingStepTone = (decision: string): StatusTone => (decision === "REJECTED" ? "warn" : stepTone(decision));

/// What happens when the route refuses, as the card says it (Q-3, §7.3.2): one fixed line, with
/// no configured-return or provenance wording, because the procedure gives only this exit.
export const IF_REFUSED_TEXT = "If refused: the documents come back for amendment and the exercise returns to preparation.";

/// The findings card's subtitle: how many block, how many are only to note.
export function findingsSummary(blocks: number, notes: number): string {
  const put = `${blocks} to put right`;
  const note = `${notes} to note`;
  if (blocks > 0) return notes > 0 ? `${put} · ${note}` : put;
  return notes > 0 ? `Nothing blocks submission · ${note}` : "Nothing blocks submission.";
}

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
  SUBMITTED: TENDERING_STATE_LABEL.WITH_APPROVAL,
  APPROVED: TENDERING_STATE_LABEL.APPROVED,
  RETURNED: TENDERING_STATE_LABEL.RETURNED,
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
  EXERCISE_NOT_IN_PREPARATION: () => "The tender documents change only while the exercise is in preparation. Move it into preparation first.",
};

const CONTENT_TEXT: Record<ContentFault, (f: Finding) => string> = {
  TEMPLATE_NOT_SET: (f) => `Part ${d(f, "part")} draws a library template and none is chosen. Choose one, or name it on the part under Configuration, Tender documents.`,
  TEMPLATE_BODY_EMPTY: (f) => `${f.data?.part ? `Part ${d(f, "part")}: the` : "The"} template ${d(f, "template")} has no text. Write it under Configuration, Templates.`,
  TEMPLATE_LANGUAGE_NOT_SET: (f) => `${f.data?.part ? `Part ${d(f, "part")}: the` : "The"} template ${d(f, "template")} has text in both languages and does not say which is issued first. Choose it under Configuration, Templates.`,
  TEMPLATE_UNKNOWN_FIELD: (f) => `${f.data?.part ? `Part ${d(f, "part")}: the` : "The"} template ${d(f, "template")} names ${d(f, "fields")}, which a tender document does not fill. Correct it under Configuration, Templates.`,
  BESPOKE_FROM_LIBRARY: (f) => `Part ${d(f, "part")} is prepared for this exercise, so it cannot be drawn from the template library. It is uploaded, or comes from the bill or the Appendix.`,
  BQ_PART_WITHOUT_BQ: (f) => `Part ${d(f, "part")} issues the bill of quantities unpriced, and the exercise has no finalised bill. Finalise it on the Bill of quantities tab.`,
  UPLOAD_MISSING: (f) => `Part ${d(f, "part")} has no file attached. Attach it to the part under Documents; it can then be marked ready.`,
  APPENDIX_INCOMPLETE: (f) => `Part ${d(f, "part")}: the Appendix is not complete yet. Complete it on the Appendix page.`,
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
  DATES_DIFFER_FROM_DOCUMENTS: "The frozen notice states the registrations' validity window from the proposed start to the proposed closing day. Record those days, or return the documents for amendment so the next version states the new ones.",
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
export function submitFindingTexts(s: SubmitFindings): { level: Finding["level"]; text: string; family: keyof SubmitFindings; code: string; finding: Finding }[] {
  const out: { level: Finding["level"]; text: string; family: keyof SubmitFindings; code: string; finding: Finding }[] = [];
  const add = (family: keyof SubmitFindings, fs: readonly Finding[], text: (f: Finding) => string) => fs.forEach((f) => out.push({ level: f.level, text: text(f), family, code: f.code, finding: f }));
  add("edit", s.edit, partFaultText);
  add("readiness", s.readiness, partFaultText);
  add("scope", s.scope, (f) => scopeFaultText(f));
  add("appendix", s.appendix, appendixFaultText);
  add("behaviour", s.behaviour, behaviourFaultText);
  add("conditions", s.conditions, conditionsFaultText);
  add("dates", s.dates, datesFaultText);
  add("route", s.route, routeFaultText);
  return out;
}

export type AppendixState = "EDITING" | "FROZEN" | "NOT_IN_PREPARATION";

/// The Appendix page's sentences by where the pack stands (UX 12): in the present while it is being
/// entered, in the past once it is frozen, and a way forward when the exercise is not yet in preparation.
export function appendixCopy(state: AppendixState, version: number) {
  switch (state) {
    case "EDITING":
      return {
        subtitle: `Version ${version} of the tender documents. Each field is entered or reads Not set.`,
        findingsTitle: "Still to enter",
        findingsSubtitle: "The tender documents cannot be submitted for approval until each is entered.",
        completeTitle: "The Appendix is complete",
        completeBody: "Every field is entered. It is frozen with the tender documents when they are submitted.",
      };
    case "FROZEN":
      return {
        subtitle: `Frozen with version ${version} of the tender documents.`,
        findingsTitle: "Not entered when it was frozen",
        findingsSubtitle: "These stand as they were. They are put right on the next version, once the documents are returned for amendment.",
        completeTitle: "The Appendix was complete when it was frozen",
        completeBody: "Every field was entered. It is changed on the next version, once the documents are returned for amendment.",
      };
    case "NOT_IN_PREPARATION":
      return {
        subtitle: `Version ${version} of the tender documents. Move the exercise into preparation first, then enter the Appendix.`,
        findingsTitle: "Still to enter",
        findingsSubtitle: "Move the exercise into preparation first. The Appendix is entered there.",
        completeTitle: "The Appendix is complete",
        completeBody: "Every field is entered.",
      };
  }
}

/// The Appendix page's cards, by the id their anchor carries (UX 3, 9): a finding about a field
/// links to the card that holds it, never to the top of the page.
export const APPENDIX_CARD = {
  officers: "officers",
  variationLimits: "variation-limits",
  primeCost: "prime-cost",
  insurance: "insurance",
  lad: "liquidated-damages",
  sectional: "sectional-completion",
  dlp: "defects-liability",
  interim: "interim-certificates",
} as const;
export type AppendixCard = (typeof APPENDIX_CARD)[keyof typeof APPENDIX_CARD];

const FIELD_CARD: Record<AppendixField, AppendixCard> = {
  ladOfficerRoleCode: APPENDIX_CARD.officers,
  eotOfficerRoleCode: APPENDIX_CARD.officers,
  terminationOfficerRoleCode: APPENDIX_CARD.officers,
  warRiskOfficerRoleCode: APPENDIX_CARD.officers,
  arbitrationOfficerRoleCode: APPENDIX_CARD.officers,
  variationLimits: APPENDIX_CARD.variationLimits,
  pcSumWorksApply: APPENDIX_CARD.primeCost,
  pcSumWorksText: APPENDIX_CARD.primeCost,
  tplMinimum: APPENDIX_CARD.insurance,
  wcMinimum: APPENDIX_CARD.insurance,
  worksInsuranceUpliftKind: APPENDIX_CARD.insurance,
  worksInsuranceUpliftAmount: APPENDIX_CARD.insurance,
  worksInsuranceUpliftPct: APPENDIX_CARD.insurance,
  insuranceExcess: APPENDIX_CARD.insurance,
  ladKind: APPENDIX_CARD.lad,
  ladAmount: APPENDIX_CARD.lad,
  ladPct: APPENDIX_CARD.lad,
  sectionalCompletion: APPENDIX_CARD.sectional,
  sections: APPENDIX_CARD.sectional,
  dlpApplies: APPENDIX_CARD.dlp,
  dlpMonths: APPENDIX_CARD.dlp,
  firstInterimMinimum: APPENDIX_CARD.interim,
  subsequentInterimMinimum: APPENDIX_CARD.interim,
  honourCertificateDays: APPENDIX_CARD.interim,
};

/// The card of the Appendix an Appendix finding is about. Findings name the field in words, so the
/// label is looked back up; a finding about no one field (or an unknown one) has no card.
export function appendixCardOf(f: Finding): AppendixCard | null {
  switch (f.code) {
    case "VARIATION_LIMIT_NOT_SET":
      return APPENDIX_CARD.variationLimits;
    case "PC_SUM_TEXT_REQUIRED":
      return APPENDIX_CARD.primeCost;
    case "SECTIONS_REQUIRED":
    case "SECTIONS_NOT_EXPECTED":
    case "SECTION_LAD_NOT_SET":
      return APPENDIX_CARD.sectional;
    case "DLP_MONTHS_NOT_EXPECTED":
      return APPENDIX_CARD.dlp;
  }
  const label = f.data?.field;
  const key = (Object.keys(APPENDIX_FIELD_LABEL) as AppendixField[]).find((k) => APPENDIX_FIELD_LABEL[k] === label);
  return key ? FIELD_CARD[key] : null;
}

/// The Appendix page, at the card a finding is about (or the page, where it names none).
export const appendixHref = (exerciseId: string, f: Finding) => {
  const card = appendixCardOf(f);
  return `/sourcing/${exerciseId}/appendix${card ? `#${card}` : ""}`;
};

const BILL_CODES = new Set(["BQ_NOT_FINALISED", "BQ_REVISION_OPEN"]);
const ESTIMATE_CODES = new Set(["ESTIMATE_RULE_NOT_SET", "ESTIMATE_NOT_LODGED", "ESTIMATE_BEHIND"]);

/// Where a submission finding is put right (UX 3): the screen and, inside it, the section or
/// card that holds the thing, so the link lands on it rather than near it.
export function findingHref(exerciseId: string, family: keyof SubmitFindings, f: Finding): string {
  const ex = `/sourcing/${exerciseId}`;
  switch (family) {
    case "edit":
      return `${ex}?tab=documents`;
    case "readiness":
      if (f.code === "BQ_PART_WITHOUT_BQ") return `${ex}?tab=scope&section=bq`;
      if (f.code === "APPENDIX_INCOMPLETE") return `${ex}/appendix`;
      return `${ex}?tab=documents#parts`;
    case "scope":
      if (f.code === "BASIS_NOT_CHOSEN") return `${ex}?tab=contract`;
      if (BILL_CODES.has(f.code)) return `${ex}?tab=scope&section=bq`;
      if (ESTIMATE_CODES.has(f.code)) return `${ex}?tab=scope&section=estimate`;
      return `${ex}?tab=scope`;
    case "appendix":
      return appendixHref(exerciseId, f);
    case "behaviour":
      if (f.code === "DLP_MONTHS_REQUIRED" && f.data?.appendix !== 0) return `${ex}/appendix#${APPENDIX_CARD.dlp}`;
      if (f.code === "DLP_NOT_FOR_TYPE") return `${ex}/appendix#${APPENDIX_CARD.dlp}`;
      if (f.code === "NOMINATION_NOT_FOR_TYPE") return f.data?.where === "BILL" ? `${ex}?tab=scope&section=bq` : `${ex}/appendix#${APPENDIX_CARD.primeCost}`;
      return "/configuration/reference-data";
    case "conditions":
      return conditionsFixHref(f.code, exerciseId);
    case "dates":
      return `${ex}?tab=documents#submit`;
    case "route":
      return "/configuration/approval-matrix";
  }
}

/// The behaviour card's two halves: checked on the documents here, and checked after award.
export const BEHAVIOUR_AFTER_AWARD_WHERE = { CONTRACT: "Checked when the contract is formed", POST_AWARD: "Checked after award, in contract administration" } as const;
