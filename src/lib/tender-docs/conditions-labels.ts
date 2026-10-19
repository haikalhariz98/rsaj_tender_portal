/**
 * The words for 6.4 increment 2's findings: eligibility, the notice, the restriction, the
 * regulator permit, clauses, assurance and the Tender Table Document. Codes never reach a
 * screen (AGENTS.md rule 5); each finding says what to do and where. The restriction is
 * named only in the customer's configured words, never a literal here (6.4 condition).
 */

import type { AssuranceKind, ConfirmFault } from "./assurance";
import type { ClauseConfigFault, OverrideFault } from "./clauses";
import type { ConditionsFault } from "./conditions";
import { NEED_FAULT_TEXT, type NeedFault } from "./requirement-needs";
import type { Finding } from "./types";

const d = (f: Finding, k: string) => (f.data?.[k] == null ? "" : String(f.data[k]));
const CONFIG = "under Configuration, Tender documents";
const TAB = "on the Tender documents tab";
/// Founder, 2026-10-05: the registrations, the restriction and the permit are answered under Details & compliance; Sourcing Requirements v2 (SR-05, ruling 8) moved that card from the Overview to Scope and estimate.
export const DETAILS = "on Scope and estimate, under Details & compliance";

export const ASSURANCE_KIND_LABEL: Readonly<Record<AssuranceKind, string>> = {
  NO_AMBIGUITY: "Free from ambiguity and contradiction",
  DRAWINGS_COORDINATED: "Drawings coordinated across disciplines",
};

/// The question the restriction asks, in the customer's words where they are set.
export const restrictionQuestion = (label: string | null) => (label?.trim() ? label.trim() : "Restricted tender (the restriction's wording is not set)");

const TEXT: Record<ConditionsFault, (f: Finding) => string> = {
  // FR-DOC-005
  ELIGIBILITY_NOT_SET: () => `The registrations a bidder must hold are not recorded, so the notice has no eligibility block. Add them ${DETAILS}.`,
  BODY_NOT_CONFIGURED: (f) => `${d(f, "body") || "A registration body"} is no longer configured. Remove the requirement and choose a configured body ${DETAILS}.`,
  BODY_RETIRED: (f) => `${d(f, "body")} is retired. Remove the requirement and choose a live body ${DETAILS}, or restore the body ${CONFIG}.`,
  QUALIFIERS_REQUIRED: (f) => `${d(f, "body")}: state the ${d(f, "qualifier").toLowerCase() || "qualifiers"} the scope needs ${DETAILS}.`,
  QUALIFIERS_NOT_TAKEN: (f) => `${d(f, "body")} takes nothing stated with it. Clear what is entered against it ${DETAILS}.`,
  GROUP_NOT_VALID: () => "Give the alternative group as a whole number from 1.",
  BODY_TWICE_IN_GROUP: (f) => `${d(f, "body")} is required twice in one group. Remove one ${DETAILS}.`,
  // 615-C1: the grade and codes a requirement asks for.
  ...(Object.fromEntries((Object.keys(NEED_FAULT_TEXT) as NeedFault[]).map((k) => [k, (f: Finding) => NEED_FAULT_TEXT[k]((f.data ?? {}) as Record<string, string | number | null>)])) as Record<NeedFault, (f: Finding) => string>),
  NOTICE_PART_MISSING: () => `No invitation notice to carry the eligibility block. Add an invitation part ${CONFIG}.`,
  NOTICE_LACKS_ELIGIBILITY: (f) => `Part ${d(f, "part")}: template ${d(f, "template")} does not state ${d(f, "fields")}. Add them under Configuration, Templates, or choose another template.`,
  NOTICE_NOT_CHECKED: (f) => `Part ${d(f, "part")} is an uploaded file, not read here. Check it states the registrations and validity window.`,
  // FR-DOC-009
  RESTRICTION_NOT_ANSWERED: () => `Whether the tender is restricted is not answered. Answer it ${DETAILS}.`,
  STAMP_NOT_SET: (f) => `Restricted stamp wording not set in ${d(f, "language")}. Set it ${CONFIG}.`,
  UPLOADS_NOT_STAMPED: (f) => `${d(f, "count")} uploaded ${f.data?.count === 1 ? "file is" : "files are"} not stamped here and must carry the stamp.`,
  // FR-DOC-006
  REGULATED_NOT_ANSWERED: () => `Whether the works need the regulator's permit is not answered. Answer it ${DETAILS}.`,
  PERMIT_LIST_NOT_SET: () => `The works need the regulator's permit, and no list of permit types is configured. Choose the list ${CONFIG}.`,
  PERMIT_NOT_CHOSEN: () => `The works need the regulator's permit: choose its type ${DETAILS}.`,
  PERMIT_NOT_ON_LIST: () => `The permit type chosen is no longer on the configured list. Choose another ${DETAILS}.`,
  INSTRUCTIONS_PART_MISSING: () => `No instructions part to state the permit in. Add one ${CONFIG}.`,
  PERMIT_NAME_MS_MISSING: (f) => `Part ${d(f, "part")} has Malay text, and permit type ${d(f, "permit")} has no Malay name. Add it under Configuration, Reference data, or choose another type ${DETAILS}.`,
  PERMIT_NOT_IN_INSTRUCTIONS: (f) => `Part ${d(f, "part")}: template ${d(f, "template")} does not name {{permit.type}}. Add it under Configuration, Templates, or choose another template.`,
  INSTRUCTIONS_NOT_CHECKED: (f) => `Part ${d(f, "part")} is an uploaded file, not read here. Check it states the permit and its type.`,
  PERMIT_FIELD_NOT_REGULATED: (f) => `Part ${d(f, "part")}: template ${d(f, "template")} names a permit, and the works need none. Choose another template, or correct the answer ${DETAILS}.`,
  // FR-DOC-011
  CLAUSE_MANDATORY_UNSET: (f) => `Whether every agreement must carry the clause ${d(f, "clause")} is not set. Set it ${CONFIG}, under Clauses.`,
  AGREEMENT_PART_MISSING: () => `Mandatory clauses need a conditions of contract part. Make it ready.`,
  CLAUSE_MISSING: (f) => `Part ${d(f, "part")}: template ${d(f, "template")} does not cite clause ${d(f, "clause")}. Cite it under Configuration, Templates, or record a legal endorsement ${TAB}.`,
  CLAUSE_NOT_CHECKABLE: (f) => `Part ${d(f, "part")} is an uploaded file, so clause ${d(f, "clause")} is not seen. Use a template that cites it, or record a legal endorsement ${TAB}.`,
  CLAUSE_LANGUAGE_MISSING: (f) => `Clause ${d(f, "clause")} has no ${d(f, "language")} text. Add it ${CONFIG}, under Clauses.`,
  CLAUSE_OVERRIDDEN: (f) => `The clause ${d(f, "clause")} is left out under a legal endorsement by ${d(f, "person")}: “${d(f, "reason")}”.`,
  // FR-DOC-014
  ASSURANCE_POLICY_NOT_SET: () => `Assurance confirmations not set. Set them ${CONFIG}, under Policy.`,
  ASSURANCE_MISSING: (f) => `Not yet confirmed: ${ASSURANCE_KIND_LABEL[d(f, "kind") as AssuranceKind]?.toLowerCase() ?? "an assurance"}. Record who confirmed it and when under Assurance below.`,
  ASSURANCE_NOT_REQUIRED: () => "The organisation's policy is that the assurance confirmations are not required: recorded as its decision.",
  // FR-DOC-010
  TABLE_DOCUMENT_UNSET: (f) => `Part ${d(f, "part")}: in the Tender Table Document or not is not set. Set it on the part ${CONFIG}, then Refresh from configuration.`,
  TABLE_DOCUMENT_EMPTY: () => `No part is in the Tender Table Document. Set which are ${CONFIG}, then Refresh from configuration.`,
};

export const conditionsFaultText = (f: Finding) => (TEXT as Record<string, (f: Finding) => string>)[f.code]?.(f) ?? "A condition of the tender is not met.";

/// Which card on the tab, or which configuration page, puts a finding right.
export function conditionsFixHref(code: string, exerciseId: string): string {
  const config = ["STAMP_NOT_SET", "PERMIT_LIST_NOT_SET", "CLAUSE_MANDATORY_UNSET", "CLAUSE_LANGUAGE_MISSING", "ASSURANCE_POLICY_NOT_SET", "NOTICE_PART_MISSING", "INSTRUCTIONS_PART_MISSING"];
  // The answers on a draft's parts are taken into it by the refresh on the Parts card.
  if (code === "TABLE_DOCUMENT_UNSET" || code === "TABLE_DOCUMENT_EMPTY") return `/sourcing/${exerciseId}?tab=documents#parts`;
  if (config.includes(code)) return "/configuration/tender-documents";
  if (code === "PERMIT_NAME_MS_MISSING") return "/configuration/reference-data";
  if (["NOTICE_LACKS_ELIGIBILITY", "PERMIT_NOT_IN_INSTRUCTIONS", "PERMIT_FIELD_NOT_REGULATED"].includes(code)) return `/sourcing/${exerciseId}?tab=documents#parts`;
  if (code.startsWith("ASSURANCE")) return `/sourcing/${exerciseId}?tab=documents#assurance`;
  if (code.startsWith("CLAUSE") || code === "AGREEMENT_PART_MISSING") return `/sourcing/${exerciseId}?tab=documents#clauses`;
  // The registrations, the restriction and the permit are answered under Details & compliance on Scope and estimate (SR-05, ruling 8).
  return `/sourcing/${exerciseId}?tab=scope&section=details#conditions`;
}

const CONFIRM_TEXT: Record<ConfirmFault, string> = {
  PACK_NOT_EDITABLE: "Confirmations are recorded on a draft of the tender documents, while the exercise is in preparation.",
  TIME_ZONE_NOT_SET: "The organisation's time zone is not set, so no confirmation can be dated. Set it under Configuration, Organisation.",
  ALREADY_CONFIRMED: "This is already confirmed on this version. Remove it first to record it again.",
  NOT_NEEDED: "This pack binds no drawings, so there is nothing to coordinate.",
  PERSON_REQUIRED: "Name who confirmed it.",
  PERSON_NOT_ACTIVE: "That person is no longer active. Name someone who is.",
  DAY_REQUIRED: "Give the day it was confirmed, as a real date.",
  DAY_IN_FUTURE: "The day cannot be after today.",
  DAY_BEFORE_PACK: "The day cannot be before this version of the documents was started.",
};
export const confirmFaultText = (f: Finding) => CONFIRM_TEXT[f.code as ConfirmFault] ?? "The confirmation cannot be recorded.";

const OVERRIDE_TEXT: Record<OverrideFault, string> = {
  PACK_NOT_EDITABLE: "An endorsement is recorded on a draft of the tender documents, while the exercise is in preparation.",
  CLAUSE_NOT_MANDATORY: "Only a live clause every agreement must carry is left out by an endorsement.",
  ALREADY_OVERRIDDEN: "This clause is already left out under an endorsement on this version.",
  PERSON_REQUIRED: "Name who gave the legal endorsement.",
  PERSON_NOT_ACTIVE: "That person is no longer active. Name someone who is.",
  REASON_REQUIRED: "Say why the agreement goes without the clause.",
};
export const overrideFaultText = (f: Finding) => OVERRIDE_TEXT[f.code as OverrideFault] ?? "The endorsement cannot be recorded.";

const CLAUSE_CONFIG_TEXT: Record<ClauseConfigFault, string> = {
  CODE_REQUIRED: "Give a code of lower-case letters, digits and underscores.",
  CODE_TAKEN: "That code is already in use.",
  TITLE_REQUIRED: "Give the clause's title.",
  BODY_REQUIRED: "Give the clause's English text.",
  BODY_HAS_FIELD: "A clause is printed as written: take out the double braces.",
  PROVENANCE_REQUIRED: "Say where this comes from.",
};
export const clauseConfigFaultText = (f: Finding) => CLAUSE_CONFIG_TEXT[f.code as ClauseConfigFault] ?? "The clause cannot be saved.";

export const CONDITIONS_FROZEN_TEXT = "Conditions change only before approval.";
