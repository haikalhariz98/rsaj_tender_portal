/**
 * The merge fields the window's instruments may name (ADR 0008 shape): the published notice
 * (FR-ADV-003), each letter of invitation (FR-ADV-002) and each addendum (FR-ADV-014). One
 * whitelist per instrument: a field of another instrument's (an invitee's address in a notice) is
 * unknown to it, reported, and never printed as written. Values are words in the template's
 * language, never codes. The registrations and their validity window are 6.4's words (OD-13: read
 * as entered), the window running from the advertisement day to the closing day (FR-DOC-005).
 *
 * The template's text is the customer's, shipped empty: none chosen, or none written, refuses
 * naming the setting ("Template text not configured"). A restricted exercise's text carries 6.4's
 * configured stamp at its head (FR-DOC-009). Pure.
 */

import { formatDay } from "@/lib/award/fields";
import { clockTimeIn, dayIn } from "@/lib/dates";
import { formatMoney, type Sen } from "@/lib/money";
import { renderWith, renderedText, type MergeWhitelist } from "@/lib/templates/merge";
import { registrationText, validityWindowText, type RequirementFacts } from "@/lib/tender-docs/eligibility";
import { stamped } from "@/lib/tender-docs/stamp";

import { HOW_TO_BUY_KEY, howToBuyText, PHYSICAL_MERGE_KEYS, type OnlinePaymentFacts, type SaleMode } from "./sale-mode";

export type Instrument = "NOTICE" | "INVITATION" | "ADDENDUM";
type Lang = "MS" | "EN";

const COMMON: readonly { key: string; labelEn: string }[] = [
  { key: "organisation.name", labelEn: "Organisation" },
  { key: "exercise.reference", labelEn: "Exercise reference" },
  { key: "exercise.title", labelEn: "Exercise title" },
  { key: "eligibility.registration", labelEn: "Registration required" },
  { key: "eligibility.window", labelEn: "Validity window" },
  { key: "window.inspectionPlace", labelEn: "Where the documents are inspected" },
  { key: "window.purchasePlace", labelEn: "Where the documents are bought" },
  { key: "window.inspectionHours", labelEn: "Inspection and purchase hours" },
  { key: "window.purchaseFrom", labelEn: "First day of sale" },
  { key: "window.purchaseClose", labelEn: "Last day of sale" },
  { key: "window.fee", labelEn: "Document fee" },
  { key: "window.feePaymentMethods", labelEn: "How the fee is paid" },
  { key: "window.siteVisit", labelEn: "Site visit" },
  { key: "window.briefing", labelEn: "Tender briefing" },
  { key: "window.submissionPlace", labelEn: "Where tenders are submitted" },
  { key: "window.closing", labelEn: "Closing date and time" },
  { key: "window.advertisedOn", labelEn: "Advertisement date" },
  // SR-10 (ruling 16): says how an online exercise's documents are bought, and promises online payment only where it is switched on. Online exercises only.
  { key: HOW_TO_BUY_KEY, labelEn: "How to buy the documents (online sales only)" },
];

export const WINDOW_MERGE_FIELDS: Readonly<Record<Instrument, readonly { key: string; labelEn: string }[]>> = {
  NOTICE: COMMON,
  INVITATION: [
    ...COMMON,
    { key: "invitee.name", labelEn: "Invitee" },
    { key: "invitee.registrationNo", labelEn: "Invitee's registration number" },
    { key: "invitee.address", labelEn: "Invitee's address" },
  ],
  ADDENDUM: [
    ...COMMON,
    { key: "addendum.number", labelEn: "Addendum number" },
    { key: "addendum.title", labelEn: "Addendum title" },
    { key: "addendum.whatChanged", labelEn: "What the addendum changes" },
    { key: "addendum.issuedOn", labelEn: "Addendum date" },
  ],
};

/// Every key any window instrument fills: a template naming one is accepted when it is saved.
export const WINDOW_FIELD_KEYS: ReadonlySet<string> = new Set(Object.values(WINDOW_MERGE_FIELDS).flatMap((fs) => fs.map((f) => f.key)));

/**
 * The fields an instrument may name for an exercise sold in a given way (SR-10, ruling 16). An online sale has no place, hours or payment counter, so the five fields
 * describing them are retired for it and a template naming one is reported as naming a field the portal does not fill; "how to buy the documents" exists only for an
 * online sale. With no mode (the template screen, which serves both) every field is known.
 */
export const windowWhitelist = (instrument: Instrument, mode: SaleMode | null = null): MergeWhitelist => {
  const fs = WINDOW_MERGE_FIELDS[instrument].filter((f) => (mode === "ONLINE" ? !PHYSICAL_MERGE_KEYS.has(f.key) : mode == null || f.key !== HOW_TO_BUY_KEY));
  return { has: (k) => fs.some((f) => f.key === k), label: (k) => fs.find((f) => f.key === k)?.labelEn ?? "A field" };
};

/**
 * A finding's list of merge fields, in words. A field the instrument fills reads as its label
 * ("Where the documents are inspected"), never its key; a name the template wrote that the
 * instrument does not know is shown as typed in braces, because that is what the officer must find
 * and correct in the template.
 */
export function fieldsInWords(instrument: Instrument, keys: readonly string[]): string {
  const known = WINDOW_MERGE_FIELDS[instrument];
  return keys.map((k) => known.find((f) => f.key === k)?.labelEn.toLowerCase() ?? `{{${k}}}`).join(", ");
}

export interface WindowFieldContext {
  organisationName: string;
  exerciseReference: string;
  exerciseTitle: string;
  requirements: readonly RequirementFacts[];
  /// YYYY-MM-DD, or null while not known.
  advertisementDay: string | null;
  closingAt: Date | null;
  timeZone: string | null;
  inspectionPlace: string;
  purchasePlace: string;
  inspectionHours: string;
  purchaseFromDay: string | null;
  purchaseCloseDay: string | null;
  fee: Sen | null;
  feePaymentMethods: string;
  submissionPlace: string;
  events: readonly { kind: "BRIEFING" | "SITE_VISIT"; startsAt: Date; place: string; mandatory: boolean | null; cancelled: boolean }[];
  /// Whether mandatory attendance is permitted (OD-8): an event's answer is stated only then.
  mandatoryPermitted: boolean | null;
  /// SR-10: how the documents are sold on this exercise, and the online payment the organisation has switched on (what the notice may say about paying).
  saleMode: SaleMode | null;
  onlinePayment: OnlinePaymentFacts;
}

const NONE = { EN: "None", MS: "Tiada" } as const;
const MANDATORY = { EN: "attendance is mandatory", MS: "kehadiran adalah wajib" } as const;

/// A day and its clock time in the organisation's zone: "17 November 2026, 14:30".
export function dayAndTime(at: Date | null, timeZone: string | null, lang: Lang): string {
  if (!at || !timeZone) return "";
  return `${formatDay(dayIn(at, timeZone), lang)}, ${clockTimeIn(at, timeZone)}`;
}

function eventText(c: WindowFieldContext, kind: "BRIEFING" | "SITE_VISIT", lang: Lang): string {
  const es = c.events.filter((e) => e.kind === kind && !e.cancelled);
  if (es.length === 0) return NONE[lang];
  return es.map((e) => `${dayAndTime(e.startsAt, c.timeZone, lang)}, ${e.place}${c.mandatoryPermitted === true && e.mandatory === true ? ` (${MANDATORY[lang]})` : ""}`).join("; ");
}

/// The common fields' values in one language. Unknown values are left empty, so the render reports them missing.
export function windowFieldValues(c: WindowFieldContext, lang: Lang): Record<string, string> {
  const closingDay = c.closingAt && c.timeZone ? dayIn(c.closingAt, c.timeZone) : null;
  return {
    "organisation.name": c.organisationName,
    "exercise.reference": c.exerciseReference,
    "exercise.title": c.exerciseTitle,
    "eligibility.registration": c.requirements.length ? registrationText(c.requirements, lang) : "",
    "eligibility.window": c.advertisementDay && closingDay ? validityWindowText(c.advertisementDay, closingDay, lang) : "",
    "window.inspectionPlace": c.inspectionPlace,
    "window.purchasePlace": c.purchasePlace,
    "window.inspectionHours": c.inspectionHours,
    "window.purchaseFrom": formatDay(c.purchaseFromDay, lang),
    "window.purchaseClose": formatDay(c.purchaseCloseDay, lang),
    "window.fee": c.fee != null ? formatMoney(c.fee) : "",
    "window.feePaymentMethods": c.feePaymentMethods,
    "window.siteVisit": eventText(c, "SITE_VISIT", lang),
    "window.briefing": eventText(c, "BRIEFING", lang),
    "window.submissionPlace": c.submissionPlace,
    "window.closing": dayAndTime(c.closingAt, c.timeZone, lang),
    "window.advertisedOn": formatDay(c.advertisementDay, lang),
    [HOW_TO_BUY_KEY]: c.saleMode === "ONLINE" ? howToBuyText(c.onlinePayment) : "",
  };
}

export const inviteeFieldValues = (p: { name: string; registrationNo: string; address: string }): Record<string, string> => ({
  "invitee.name": p.name,
  "invitee.registrationNo": p.registrationNo,
  "invitee.address": p.address,
});

export const addendumFieldValues = (a: { number: number | null; title: string; whatChanged: string; issuedOn: string | null }, lang: Lang): Record<string, string> => ({
  "addendum.number": a.number != null ? String(a.number) : "",
  "addendum.title": a.title,
  "addendum.whatChanged": a.whatChanged,
  "addendum.issuedOn": formatDay(a.issuedOn, lang),
});

export interface TemplateFacts {
  id: string;
  code: string;
  nameEn: string;
  bodyEn: string | null;
  bodyMs: string | null;
  primaryLanguage: Lang | null;
  bodyVersion: number;
}

export type TemplateState = "NOT_SET" | "NO_TEXT" | "NO_LANGUAGE" | "OK";

/// The language a template issues in: its primary, or its one body. Null with both and no primary.
export function issueLanguage(t: Pick<TemplateFacts, "bodyEn" | "bodyMs" | "primaryLanguage">): Lang | null {
  const en = !!t.bodyEn?.trim();
  const ms = !!t.bodyMs?.trim();
  if (en && ms) return t.primaryLanguage;
  return en ? "EN" : ms ? "MS" : null;
}

/**
 * A window instrument rendered from its template, stamped where the exercise is restricted. The
 * state says why nothing can be rendered; `missing` and `unknown` say what the text lacks or names
 * wrongly, and either refuses the act. Pure and deterministic.
 */
export function renderInstrument(
  instrument: Instrument,
  template: TemplateFacts | null,
  fields: (lang: Lang) => Record<string, string>,
  stamp: { EN: string | null; MS: string | null } | null,
  mode: SaleMode | null = null,
): { state: TemplateState; language: Lang | null; text: string | null; missing: string[]; unknown: string[]; stampMissing: boolean; fields: Record<string, string> } {
  const none = (state: TemplateState) => ({ state, language: null, text: null, missing: [], unknown: [], stampMissing: false, fields: {} });
  if (!template) return none("NOT_SET");
  if (!template.bodyEn?.trim() && !template.bodyMs?.trim()) return none("NO_TEXT");
  const lang = issueLanguage(template);
  if (!lang) return none("NO_LANGUAGE");
  const body = lang === "EN" ? template.bodyEn! : template.bodyMs!;
  const values = fields(lang);
  const r = renderWith(body, values, windowWhitelist(instrument, mode));
  const words = stamp ? stamp[lang] : null;
  return { state: "OK", language: lang, text: stamped(renderedText(r), words), missing: r.missing, unknown: r.unknown, stampMissing: !!stamp && !words?.trim(), fields: values };
}
