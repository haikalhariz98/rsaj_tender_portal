/**
 * Printed-form fidelity (6.14 increment 2, FR-CRT-001): the printed form's page count and its fields, each with the
 * form's own label pair (the label as printed, English and Malay) and what fills it. Pure.
 *
 * A printed field is either bound (FR-CRT-002: the system fills it from the certificate, its pinned baseline or its
 * routing sheet; no screen ever takes it as an input) or left for hand completion on the paper (unbound: printed
 * blank, never entered here). The labels are the customer's: the product prints its own words ("Received",
 * "Approved") and shows a form's printed label only where a field is configured for it, so no customer's wording is
 * ever the product's. Ships empty.
 *
 * A certificate's form freezes its page count and fields at the first signature with the rest of the form (OD-2 A);
 * a routing sheet freezes its printed form's labels when the sheet starts, with its type (BD-614-3).
 */

import { formatDay } from "@/lib/award/fields";
import { formatDate } from "@/lib/format";

import { ANY_CERTIFICATE_FIELD, CERTIFICATE_MERGE_FIELDS } from "./fields";
import { w, type Words } from "./labels";
import type { Finding } from "./types";

export type Lang = "EN" | "MS";

/// A routing sheet's own values a printed field may be bound to (the product's words for each).
export const SHEET_FIELDS = ["sheet.type", "sheet.received", "sheet.approved", "sheet.elapsed", "sheet.target"] as const;
export type SheetField = (typeof SHEET_FIELDS)[number];
export const SHEET_FIELD_WORDS: Readonly<Record<SheetField, Words>> = {
  "sheet.type": w("Routing sheet", "Helaian penghalaan"),
  "sheet.received": w("Received", "Diterima"),
  "sheet.approved": w("Approved", "Diluluskan"),
  "sheet.elapsed": w("Elapsed", "Tempoh berlalu"),
  "sheet.target": w("Target", "Sasaran"),
};
export const isSheetField = (k: string): k is SheetField => (SHEET_FIELDS as readonly string[]).includes(k);

/// Every value a printed field may be bound to: a certificate's bound fields and its routing sheet's.
export const PRINTABLE_FIELDS: ReadonlySet<string> = new Set([...ANY_CERTIFICATE_FIELD, ...SHEET_FIELDS]);

/// The product's words for a bound value.
export function boundFieldWords(key: string): Words {
  if (isSheetField(key)) return SHEET_FIELD_WORDS[key];
  const f = CERTIFICATE_MERGE_FIELDS.find((x) => x.key === key);
  return f ? w(f.labelEn, f.labelMs) : w("A figure", "Satu angka");
}

export interface PrintedField {
  key: string;
  labelEn: string;
  labelMs: string | null;
  /// Filled by the system from `computedKey`; false: left blank for hand completion on the paper.
  bound: boolean;
  computedKey: string | null;
  sortOrder: number;
}

const CODE = /^[a-z][a-z0-9_]*$/;
export const PAGE_COUNT_MAX = 999;

/// Why a printed field cannot be saved, against the form's others (`others` excludes the one being edited).
export function printedFieldFaults(p: PrintedField, others: readonly PrintedField[]): Finding[] {
  const out: Finding[] = [];
  const f = (code: string) => out.push({ code, level: "block" });
  if (!CODE.test(p.key)) f("PRINTED_KEY");
  if (others.some((o) => o.key === p.key)) f("PRINTED_KEY_TAKEN");
  if (!p.labelEn.trim()) f("PRINTED_LABEL");
  if (p.bound && !p.computedKey) f("PRINTED_BOUND_NEEDS_VALUE");
  if (p.bound && p.computedKey && !PRINTABLE_FIELDS.has(p.computedKey)) f("PRINTED_VALUE_UNKNOWN");
  if (!p.bound && p.computedKey) f("PRINTED_UNBOUND_HAS_VALUE");
  if (!Number.isInteger(p.sortOrder) || p.sortOrder < 0) f("PRINTED_ORDER");
  return out;
}

/// Why a page count cannot be saved: a whole number of pages from 1, or none (not recorded).
export function pageCountFaults(n: number | null): Finding[] {
  if (n == null) return [];
  return Number.isInteger(n) && n >= 1 && n <= PAGE_COUNT_MAX ? [] : [{ code: "PAGE_COUNT", level: "block", data: { max: PAGE_COUNT_MAX } }];
}

/// Whether a field's change moves what a certificate pins (its order, label pair or binding; a note does not).
export function printedFieldPinChanged(before: PrintedField | null, after: PrintedField | null): boolean {
  const pin = (p: PrintedField | null) => (p ? JSON.stringify([p.key, p.labelEn, p.labelMs, p.bound, p.computedKey, p.sortOrder]) : null);
  return pin(before) !== pin(after);
}

/// In printed order: by the configured order, then the key.
export const inPrintedOrder = <T extends Pick<PrintedField, "sortOrder" | "key">>(fs: readonly T[]): T[] => [...fs].sort((a, b) => a.sortOrder - b.sortOrder || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

/// A label pair in one language: the Malay label where the form prints one, else the label as printed.
export const labelIn = (p: Pick<PrintedField, "labelEn" | "labelMs">, lang: Lang): string => (lang === "MS" ? (p.labelMs?.trim() ? p.labelMs : p.labelEn) : p.labelEn);

/// A label pair as one line: "DATE (1) · TARIKH (1)", or the one label where the form prints one.
export const labelPair = (p: Pick<PrintedField, "labelEn" | "labelMs">): string => (p.labelMs?.trim() && p.labelMs !== p.labelEn ? `${p.labelEn} · ${p.labelMs}` : p.labelEn);

export interface PrintedRow {
  key: string;
  label: string;
  labelPair: string;
  /// The value as printed; null: left for hand completion; "" where a bound value is not there to print.
  value: string | null;
  bound: boolean;
}

/// The printed fields with their values in one language, in printed order.
export function printedRows(fields: readonly PrintedField[], values: Readonly<Record<string, string>>, lang: Lang): PrintedRow[] {
  return inPrintedOrder(fields).map((p) => ({ key: p.key, label: labelIn(p, lang), labelPair: labelPair(p), bound: p.bound, value: p.bound && p.computedKey ? (values[p.computedKey] ?? "") : null }));
}

/// The printed label pair a form gives a bound value (the first field bound to it in printed order), or null.
export function printedLabelOf(fields: readonly PrintedField[], key: string): { en: string; ms: string | null } | null {
  const p = inPrintedOrder(fields).find((x) => x.bound && x.computedKey === key);
  return p ? { en: p.labelEn, ms: p.labelMs } : null;
}

/// The printed labels of a routing sheet's own values, frozen with its type when the sheet starts.
export type SheetLabels = Partial<Record<SheetField, { en: string; ms: string | null }>>;
export function sheetLabelsOf(fields: readonly PrintedField[]): SheetLabels {
  const out: SheetLabels = {};
  for (const k of SHEET_FIELDS) {
    const l = printedLabelOf(fields, k);
    if (l) out[k] = l;
  }
  return out;
}

export interface FormIdentity {
  name: string;
  formCode: string;
  revisionDate: string | null;
  pageCount: number | null;
  bodyVersion: number;
}

/**
 * The fidelity line a printed certificate carries: which form it stands next to (name, form code, revision, page
 * count) and the form's version; and, where corrections were applied to its words, how many (FR-CRT-010: the code and
 * revision stay the form's). What is not recorded is said so, never left out silently.
 */
export function fidelityLine(f: FormIdentity, correctionsApplied: number): Words {
  const en = [
    f.name,
    f.formCode || "no form code",
    // The screens' day format in English (as every other day on screen); the Malay line spells the month.
    f.revisionDate ? `revision ${formatDate(f.revisionDate)}` : "no revision date",
    f.pageCount == null ? "page count not recorded" : `${f.pageCount} ${f.pageCount === 1 ? "page" : "pages"}`,
    `form version ${f.bodyVersion}`,
    correctionsApplied ? `${correctionsApplied} ${correctionsApplied === 1 ? "typing correction" : "typing corrections"} applied, form code and revision unchanged` : null,
  ];
  const ms = [
    f.name,
    f.formCode || "tiada kod borang",
    f.revisionDate ? `semakan ${formatDay(f.revisionDate, "MS")}` : "tiada tarikh semakan",
    f.pageCount == null ? "bilangan muka surat tidak direkodkan" : `${f.pageCount} muka surat`,
    `versi borang ${f.bodyVersion}`,
    correctionsApplied ? `${correctionsApplied} pembetulan ejaan digunakan, kod borang dan semakan tidak berubah` : null,
  ];
  return w(en.filter(Boolean).join(" · "), ms.filter(Boolean).join(" · "));
}

/// The certificate page's words for the printed form (EN+MS; the screen renders `.en`).
export const PRINT_WORDS = {
  asIssued: w("Printed fields, as issued", "Medan bercetak, seperti dikeluarkan"),
  asPinned: w("Printed fields, as pinned", "Medan bercetak, seperti disematkan"),
  asNow: w("Printed fields, as the form stands now", "Medan bercetak, seperti borang kini"),
  underLabels: w("Under the printed form's own labels.", "Di bawah label borang bercetak itu sendiri."),
  byHand: w("Completed by hand on the paper", "Diisi dengan tangan di atas kertas"),
  nothingYet: w("Nothing to print yet", "Belum ada untuk dicetak"),
  noneRecorded: w("No printed fields were recorded with its issue.", "Tiada medan bercetak direkodkan bersama pengeluarannya."),
  noneOnForm: w("Its form has no printed fields.", "Borangnya tiada medan bercetak."),
  pinnedSuffix: w("as pinned", "seperti disematkan"),
  nowSuffix: w("as the form stands now", "seperti borang kini"),
  notReadyTitle: w("Its form is not ready to be signed on", "Borangnya belum sedia untuk ditandatangani"),
  notReadyTail: w("It may still be routed; nothing is signed on it until this is put right.", "Ia masih boleh dihalakan; tiada apa ditandatangani padanya sehingga ini dibetulkan."),
} as const;
