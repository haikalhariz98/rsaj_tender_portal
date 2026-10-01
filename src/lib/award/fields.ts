/**
 * The merge fields a template may use (ADR 0008), and their values for an award.
 *
 * A whitelist: a template names only these, and each value is formatted here once —
 * money through `formatSen`, days as "d MMMM yyyy" in the template's language. The IC
 * number is not a merge field: it comes back on the returned page, never goes out
 * (6.11 ruling). The committee and approver blocks are the routing sheet's (FR-CTE-014),
 * read from the decision record and the route, and freeze with the document.
 */

import { formatSen, type Sen } from "@/lib/money";

import type { DocumentLanguage, PeriodUnit } from "./types";

export const MERGE_FIELDS: readonly { key: string; labelEn: string }[] = [
  { key: "organisation.name", labelEn: "Organisation" },
  { key: "award.reference", labelEn: "Award reference" },
  { key: "award.value", labelEn: "Awarded value" },
  { key: "award.issueDate", labelEn: "Date of issue" },
  { key: "award.completionPeriod", labelEn: "Completion period" },
  { key: "award.startDate", labelEn: "Start date" },
  { key: "awardee.name", labelEn: "Awardee" },
  { key: "awardee.registrationNo", labelEn: "Awardee's registration number" },
  { key: "awardee.address", labelEn: "Awardee's address" },
  { key: "exercise.reference", labelEn: "Exercise reference" },
  { key: "exercise.title", labelEn: "Exercise title" },
  { key: "requisition.reference", labelEn: "Requisition reference" },
  { key: "contract.number", labelEn: "Contract number" },
  { key: "signatory.name", labelEn: "Signatory" },
  { key: "signatory.office", labelEn: "Signatory's office, in the letter's language" },
  { key: "terms.lad", labelEn: "Liquidated damages" },
  { key: "terms.retention", labelEn: "Retention" },
  { key: "terms.retentionCap", labelEn: "Retention limit" },
  { key: "terms.dlp", labelEn: "Defects liability period" },
  { key: "bond.amount", labelEn: "Performance bond amount" },
  { key: "bond.basis", labelEn: "Performance bond basis" },
  { key: "bond.validity", labelEn: "Performance bond validity" },
  { key: "indent.number", labelEn: "Indent number" },
  { key: "indent.receivedOn", labelEn: "Indent received on" },
  { key: "indent.expiresOn", labelEn: "Indent expires on" },
  { key: "committee.name", labelEn: "Committee, in the letter's language" },
  { key: "committee.meetingReference", labelEn: "Committee sitting" },
  { key: "committee.meetingDate", labelEn: "Committee meeting date" },
  { key: "committee.outcome", labelEn: "Committee outcome" },
  { key: "committee.decisionDate", labelEn: "Committee decision date" },
  { key: "approver.office", labelEn: "Approver's office, in the letter's language" },
  { key: "approver.receivedOn", labelEn: "Date received by the approver" },
  { key: "approver.name", labelEn: "Approver" },
  { key: "approver.decidedOn", labelEn: "Date approved" },
];

export const MERGE_FIELD_KEYS: ReadonlySet<string> = new Set(MERGE_FIELDS.map((f) => f.key));
export const mergeFieldLabel = (key: string) => MERGE_FIELDS.find((f) => f.key === key)?.labelEn ?? "A field";

const MONTHS = {
  EN: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  MS: ["Januari", "Februari", "Mac", "April", "Mei", "Jun", "Julai", "Ogos", "September", "Oktober", "November", "Disember"],
} as const;

/// A day as "d MMMM yyyy" in the template's language.
export function formatDay(day: string | null, lang: DocumentLanguage): string {
  if (!day) return "";
  const [y, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[lang][m - 1]} ${y}`;
}

const UNIT = { EN: { DAYS: ["day", "days"], WEEKS: ["week", "weeks"], MONTHS: ["month", "months"] }, MS: { DAYS: ["hari", "hari"], WEEKS: ["minggu", "minggu"], MONTHS: ["bulan", "bulan"] } } as const;
export const formatPeriod = (n: number, unit: PeriodUnit, lang: DocumentLanguage) => `${n} ${UNIT[lang][unit][n === 1 ? 0 : 1]}`;

const pct = (v: string | null) => (v == null ? "" : `${v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "")}%`);
const OUTCOME = { EN: { CARRIED: "Carried", NOT_CARRIED: "Not carried", DEFERRED: "Deferred" }, MS: { CARRIED: "Diluluskan", NOT_CARRIED: "Tidak diluluskan", DEFERRED: "Ditangguhkan" } } as const;
const BASIS = {
  EN: { CONTRACT_PRICE: "of the contract price", ANNUAL_VALUE: "of the one-year value of the contract", STATED_AMOUNT: "as a stated amount" },
  MS: { CONTRACT_PRICE: "daripada harga kontrak", ANNUAL_VALUE: "daripada nilai setahun kontrak", STATED_AMOUNT: "sebagai amaun yang dinyatakan" },
} as const;

/// A name as configured in both languages. A Malay letter takes the Malay name; where
/// none is set the field is empty — missing, and issue refused — never the English one.
export interface Named {
  en: string;
  ms: string | null;
}
const inLang = (n: Named | null | undefined, L: DocumentLanguage) => (!n ? "" : L === "MS" ? (n.ms?.trim() ?? "") : n.en);

/// "Liquidated damages per …" in the letter's language; a unit not on the list is not translated.
const LAD_UNIT: Record<string, { EN: string; MS: string }> = {
  "per day": { EN: "per day", MS: "sehari" },
  "per week": { EN: "per week", MS: "seminggu" },
  "per month": { EN: "per month", MS: "sebulan" },
};
const ladUnit = (u: string, L: DocumentLanguage) => (LAD_UNIT[u.trim().toLowerCase()]?.[L] ?? (L === "EN" ? u : ""));

export interface MergeContext {
  lang: DocumentLanguage;
  organisationName: string;
  award: { reference: string; value: Sen; issueDate: string | null; completionPeriod: number; completionUnit: PeriodUnit; startDate: string | null };
  awardee: { name: string; registrationNo: string; address: string };
  exercise: { reference: string; title: string };
  requisitionReference: string;
  contractNumber: string | null;
  signatory: { name: string | null; office: Named | null };
  terms: { ladAmount: Sen | null; ladUnit: string; retentionPercent: string | null; retentionCapPercent: string | null; dlpMonths: number | null };
  bond: { amount: Sen | null; percent: string | null; basis: "CONTRACT_PRICE" | "ANNUAL_VALUE" | "STATED_AMOUNT" | null; validityMonths: number | null };
  indent: { number: string | null; receivedOn: string | null; expiresOn: string | null };
  committee: { name: Named; meetingReference: string; meetingDate: string; outcome: "CARRIED" | "NOT_CARRIED" | "DEFERRED"; decisionDate: string | null } | null;
  approver: { office: Named; receivedOn: string | null; name: string | null; decidedOn: string | null } | null;
}

export function mergeFieldsFor(c: MergeContext): Record<string, string> {
  const L = c.lang;
  const day = (d: string | null) => formatDay(d, L);
  const f: Record<string, string> = {
    "organisation.name": c.organisationName,
    "award.reference": c.award.reference,
    "award.value": formatSen(c.award.value),
    "award.issueDate": day(c.award.issueDate),
    "award.completionPeriod": formatPeriod(c.award.completionPeriod, c.award.completionUnit, L),
    "award.startDate": day(c.award.startDate),
    "awardee.name": c.awardee.name,
    "awardee.registrationNo": c.awardee.registrationNo,
    "awardee.address": c.awardee.address,
    "exercise.reference": c.exercise.reference,
    "exercise.title": c.exercise.title,
    "requisition.reference": c.requisitionReference,
    "contract.number": c.contractNumber ?? "",
    "signatory.name": c.signatory.name ?? "",
    "signatory.office": inLang(c.signatory.office, L),
    "terms.lad": c.terms.ladAmount == null || (c.terms.ladUnit && !ladUnit(c.terms.ladUnit, L)) ? "" : `${formatSen(c.terms.ladAmount)}${c.terms.ladUnit ? ` ${ladUnit(c.terms.ladUnit, L)}` : ""}`,
    "terms.retention": pct(c.terms.retentionPercent),
    "terms.retentionCap": pct(c.terms.retentionCapPercent),
    "terms.dlp": c.terms.dlpMonths == null ? "" : formatPeriod(c.terms.dlpMonths, "MONTHS", L),
    "bond.amount": c.bond.amount == null ? "" : formatSen(c.bond.amount),
    "bond.basis": c.bond.basis == null ? "" : c.bond.basis === "STATED_AMOUNT" ? BASIS[L].STATED_AMOUNT : `${pct(c.bond.percent)} ${BASIS[L][c.bond.basis]}`,
    "bond.validity": c.bond.validityMonths == null ? "" : formatPeriod(c.bond.validityMonths, "MONTHS", L),
    "indent.number": c.indent.number ?? "",
    "indent.receivedOn": day(c.indent.receivedOn),
    "indent.expiresOn": day(c.indent.expiresOn),
    "committee.name": inLang(c.committee?.name, L),
    "committee.meetingReference": c.committee?.meetingReference ?? "",
    "committee.meetingDate": day(c.committee?.meetingDate ?? null),
    "committee.outcome": c.committee ? OUTCOME[L][c.committee.outcome] : "",
    "committee.decisionDate": day(c.committee?.decisionDate ?? null),
    "approver.office": inLang(c.approver?.office, L),
    "approver.receivedOn": day(c.approver?.receivedOn ?? null),
    "approver.name": c.approver?.name ?? "",
    "approver.decidedOn": day(c.approver?.decidedOn ?? null),
  };
  return f;
}

/// Which body a template issues in: its primary language, or the only one it has.
export function templateText(t: { bodyMs: string | null; bodyEn: string | null; primaryLanguage: DocumentLanguage | null }): { language: DocumentLanguage; body: string } | { fault: "NO_TEXT" | "NO_LANGUAGE" } {
  const ms = t.bodyMs?.trim() ? t.bodyMs : null;
  const en = t.bodyEn?.trim() ? t.bodyEn : null;
  if (!ms && !en) return { fault: "NO_TEXT" };
  if (t.primaryLanguage === "MS") return ms ? { language: "MS", body: ms } : { fault: "NO_TEXT" };
  if (t.primaryLanguage === "EN") return en ? { language: "EN", body: en } : { fault: "NO_TEXT" };
  if (ms && en) return { fault: "NO_LANGUAGE" };
  return ms ? { language: "MS", body: ms } : { language: "EN", body: en! };
}
