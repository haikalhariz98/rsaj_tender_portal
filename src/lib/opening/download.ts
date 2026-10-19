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

/**
 * The columns of the two documents, once (SR-15 review M3). The screen, the print page and the CSV all take their headings from here, so the three cannot drift: Kelas is the register's reading
 * frozen when the offer was read, beside "Class as read" (what the officer recorded from the envelope), so neither is passed off as the other.
 */
export const SCHEDULE_COLUMNS = { listing: "Bil.", bidder: "Bidder", kelas: "Kelas (register)", classAsRead: "Class as read", status: "Status", price: "Price as read", period: "Completion period" } as const;
export const SUMMARY_COLUMNS = { listing: "Bil.", bidder: "Bidder", kelas: "Kelas (register)", price: "Price as read", period: "Completion period", label: "At the opening" } as const;

/// The cells of the Kelas columns as every output shows them.
export const kelasText = (registerClass: string | null): string => registerClass?.trim() || NO_CLASS_ON_REGISTER;
export const readText = (s: string): string => s.trim() || "—";

/// What an online bid's "Class as read" reads: nothing is typed from an online bid's envelope (20cu). A dash would read as a forgotten blank.
export const ONLINE_CLASS_AS_READ = "Not typed: an online bid";
/// The "Class as read" cell, once for the screen, the print page and the CSV, so the three cannot drift (20cu). Paper: what the officer recorded, or a dash.
export const classAsReadText = (value: string, online: boolean): string => (online ? ONLINE_CLASS_AS_READ : readText(value));

/// What an online bid's "Status as read" reads when the frozen eligibility reading holds no register standing (AC-44), the same words as Class as read.
export const ONLINE_STATUS_AS_READ = ONLINE_CLASS_AS_READ;
/**
 * The "Status as read" cell, once for the screen, the print page and the CSV (AC-44). Paper: what the officer recorded, or a dash. Online: nothing is typed, so the cell shows the supplier
 * register's standing as frozen in the opening's eligibility reading, marked as the register's ("Register: Active"), never the live register; with none frozen, "Not typed: an online bid".
 * While the row's names are held (`held`) it shows no standing at all and follows the row's hold, as before: a barred or suspended standing beside a listing number would give away the
 * eligibility verdict before finalising (sealed-bid gate).
 */
export const statusAsReadText = (i: { value: string; online: boolean; held: boolean; registerStanding: string | null }): string =>
  !i.online ? readText(i.value) : i.held ? readText("") : i.registerStanding?.trim() ? `Register: ${i.registerStanding.trim()}` : ONLINE_STATUS_AS_READ;

/// The part of the schedule section's view that a download reads.
export interface DownloadOpening {
  title: string;
  finalised: boolean;
  finalisedAt: string | null;
  /// The exercise's pinned channel is ONLINE (20cu). Required, so a new caller cannot silently print paper words on an online row.
  online: boolean;
  header: readonly { label: string; value: string }[];
  rows: readonly { listingNo: number; bidderName: string; registrationClass: string; /// The class the register held, frozen when the offer was read. Null: the register gave none.
 registerClass: string | null; registrationStatus: string; /// The register's standing frozen in the eligibility reading, as a label; null: none, or held (AC-44).
 registerStanding: string | null; /// The row's names are held from this reader (AC-44).
 statusHeld: boolean; openingPrice: Sulit<string>; period: string; alternative: string | null }[];
  benchmark: null | { sealed: true; text: string } | { sealed: false; label: string; companyEstimate: Sulit<string> };
  summary: null | { rows: readonly { listingNo: number; bidderName: string; openingPrice: Sulit<string>; label: string }[] };
}

export type DownloadRefusal = "NOT_FINALISED" | "NO_SUMMARY";
export const DOWNLOAD_REFUSAL_TEXT: Readonly<Record<DownloadRefusal, string>> = {
  NOT_FINALISED: "Not finalised yet. Download after finalising.",
  NO_SUMMARY: "No Grand Summary for this opening.",
};

const priceText = (s: Sulit<string>) => (s.state === "GRANTED" ? s.value : `SULIT · withheld: ${s.words.en}`);
const line = (cells: readonly string[]) => cells.map(quotedCsvCell).join(",");

/// The file as text (CRLF between lines), or the reason there is none.
export function openingCsv(kind: OpeningDownloadKind, o: DownloadOpening): { csv: string } | { refusal: DownloadRefusal } {
  if (!o.finalised) return { refusal: "NOT_FINALISED" };
  const out: string[] = [line([`${OPENING_DOWNLOAD_TITLE[kind]} · ${o.title}`]), line([o.finalisedAt ? `As finalised ${o.finalisedAt}: the copy frozen then.` : "The copy frozen at finalising."]), ...o.header.map((h) => line([h.label, h.value])), ""];
  if (kind === "schedule") {
    const c = SCHEDULE_COLUMNS;
    out.push(line([c.listing, c.bidder, c.kelas, c.classAsRead, c.status, c.price, c.period]));
    for (const r of o.rows) out.push(line([String(r.listingNo), r.alternative ? `${r.bidderName} (${r.alternative.toLowerCase()})` : r.bidderName, kelasText(r.registerClass), classAsReadText(r.registrationClass, o.online), statusAsReadText({ value: r.registrationStatus, online: o.online, held: r.statusHeld, registerStanding: r.registerStanding }), priceText(r.openingPrice), r.period]));
    if (o.benchmark) out.push(line(["—", o.benchmark.sealed ? "Company estimate" : o.benchmark.label, "—", "—", "—", o.benchmark.sealed ? o.benchmark.text : priceText(o.benchmark.companyEstimate), "—"]));
    return { csv: out.join("\r\n") };
  }
  if (!o.summary) return { refusal: "NO_SUMMARY" };
  const same = new Map(o.rows.map((r) => [r.listingNo, r] as const));
  const c = SUMMARY_COLUMNS;
  out.push(line([c.listing, c.bidder, c.kelas, c.price, c.period, c.label]));
  for (const r of o.summary.rows) out.push(line([String(r.listingNo), r.bidderName, kelasText(same.get(r.listingNo)?.registerClass ?? null), priceText(r.openingPrice), same.get(r.listingNo)?.period ?? "", r.label]));
  return { csv: out.join("\r\n") };
}

/// A file name that holds only letters, digits and hyphens.
export const openingDownloadName = (reference: string, kind: OpeningDownloadKind, sequence: number): string => `${reference.replace(/[^A-Za-z0-9-]+/g, "-")}-${kind === "schedule" ? "schedule-of-tenders" : "grand-summary"}-opening-${sequence}.csv`;
