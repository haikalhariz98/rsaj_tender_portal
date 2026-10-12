/**
 * The two opening documents as CSV files (Sourcing Requirements v2, SR-15, ruling 24). Pure.
 *
 * "Jadual Tawaran" (the schedule of tenders) and the Grand Summary are built from the copies frozen when the opening was finalised, in the
 * opening's order, and are offered only after finalising. They hold what the print page holds, no more: the price cells are the view's, so a reader who
 * may not read the prices gets "SULIT · withheld" with the reason in words, exactly as the screen shows it (SULIT handling is unchanged), and the
 * company estimate's row is there only as the view discloses it. Titles are the print page's own labels. Kelas is the supplier register's reading frozen
 * when the offer was read (ruling 24); where the register gave none, the file says so rather than leaving a blank, and "Class as read" keeps what the officer
 * recorded from the envelope beside it, so neither is passed off as the other.
 */

import { quotedCsvCell } from "@/lib/csv-cell";
import type { Sulit } from "@/lib/auth/sulit-access";

export type OpeningDownloadKind = "schedule" | "summary";
export const OPENING_DOWNLOAD_KINDS: readonly OpeningDownloadKind[] = ["schedule", "summary"];
export const isOpeningDownloadKind = (s: string): s is OpeningDownloadKind => (OPENING_DOWNLOAD_KINDS as readonly string[]).includes(s);

/// The print page's own labels for the two documents.
export const OPENING_DOWNLOAD_TITLE: Readonly<Record<OpeningDownloadKind, string>> = { schedule: "Schedule of tenders", summary: "Grand Summary" };
export const NO_CLASS_ON_REGISTER = "No class on the register";

/// The part of the schedule section's view that a download reads.
export interface DownloadOpening {
  title: string;
  finalised: boolean;
  finalisedAt: string | null;
  header: readonly { label: string; value: string }[];
  rows: readonly { listingNo: number; bidderName: string; registrationClass: string; /// The class the register held, frozen when the offer was read. Null: the register gave none.
 registerClass: string | null; registrationStatus: string; openingPrice: Sulit<string>; period: string; alternative: string | null }[];
  benchmark: null | { sealed: true; text: string } | { sealed: false; label: string; companyEstimate: Sulit<string> };
  summary: null | { rows: readonly { listingNo: number; bidderName: string; openingPrice: Sulit<string>; label: string }[] };
}

export type DownloadRefusal = "NOT_FINALISED" | "NO_SUMMARY";
export const DOWNLOAD_REFUSAL_TEXT: Readonly<Record<DownloadRefusal, string>> = {
  NOT_FINALISED: "The opening is not finalised yet. The schedule and the Grand Summary are downloaded once it is, from the copy frozen then.",
  NO_SUMMARY: "No Grand Summary was frozen with this opening.",
};

const priceText = (s: Sulit<string>) => (s.state === "GRANTED" ? s.value : `SULIT · withheld: ${s.words.en}`);
const kelasOf = (s: string | null) => s?.trim() || NO_CLASS_ON_REGISTER;
const line = (cells: readonly string[]) => cells.map(quotedCsvCell).join(",");

/// The file as text (CRLF between lines), or the reason there is none.
export function openingCsv(kind: OpeningDownloadKind, o: DownloadOpening): { csv: string } | { refusal: DownloadRefusal } {
  if (!o.finalised) return { refusal: "NOT_FINALISED" };
  const out: string[] = [line([`${OPENING_DOWNLOAD_TITLE[kind]} · ${o.title}`]), line([o.finalisedAt ? `As finalised ${o.finalisedAt}: the copy frozen then.` : "The copy frozen at finalising."]), ...o.header.map((h) => line([h.label, h.value])), ""];
  if (kind === "schedule") {
    out.push(line(["Bil.", "Bidder", "Kelas (register)", "Class as read", "Status", "Price as read", "Completion period"]));
    for (const r of o.rows) out.push(line([String(r.listingNo), r.alternative ? `${r.bidderName} (${r.alternative.toLowerCase()})` : r.bidderName, kelasOf(r.registerClass), r.registrationClass.trim() || "—", r.registrationStatus.trim() || "—", priceText(r.openingPrice), r.period]));
    if (o.benchmark) out.push(line(["—", o.benchmark.sealed ? "Company estimate" : o.benchmark.label, "—", "—", "—", o.benchmark.sealed ? o.benchmark.text : priceText(o.benchmark.companyEstimate), "—"]));
    return { csv: out.join("\r\n") };
  }
  if (!o.summary) return { refusal: "NO_SUMMARY" };
  const same = new Map(o.rows.map((r) => [r.listingNo, r] as const));
  out.push(line(["Bil.", "Bidder", "Kelas (register)", "Price as read", "Completion period", "At the opening"]));
  for (const r of o.summary.rows) out.push(line([String(r.listingNo), r.bidderName, kelasOf(same.get(r.listingNo)?.registerClass ?? null), priceText(r.openingPrice), same.get(r.listingNo)?.period ?? "", r.label]));
  return { csv: out.join("\r\n") };
}

/// A file name that holds only letters, digits and hyphens.
export const openingDownloadName = (reference: string, kind: OpeningDownloadKind, sequence: number): string => `${reference.replace(/[^A-Za-z0-9-]+/g, "-")}-${kind === "schedule" ? "schedule-of-tenders" : "grand-summary"}-opening-${sequence}.csv`;
