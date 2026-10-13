/**
 * The opening schedule (Jadual Tawaran, FR-OPN-005, 006, 007; OD-9; C-3 c). Built from the record,
 * frozen at finalising (ADR 0008 style) and rendered from the frozen copy ever after.
 *
 * - Header: the exercise's title and reference, the tendering start and the closing, the count of
 *   tenderers invited (by the customer's reading, OD-9: purchasers or invitees; unset blocks
 *   finalising), the count of late envelopes (from the register, never typed: FR-OPN-007), and the
 *   signed paper's pages (entered).
 * - One row per offer opened, in opening order (Bil.): the bidder, its registration class and status
 *   as read, the price as read (SULIT, shown to the people the prices are open to, C-4) and the completion period.
 *   A withdrawn envelope and a late one not admitted are never rows.
 * - The company estimate's benchmark row, only once disclosed (at finalising, OD-2 A); before that it
 *   reads "Sealed until the schedule is finalised" and no figure exists here.
 * - The closing-to-lock gap, as a finding (C-3 c), and the count's competition flag (FR-BID-011).
 * - Versions (OD-5): the main opening is version 1; each supplementary opening adds its offer at the
 *   next Bil. as version n + 1, and every earlier version is kept as it was frozen.
 * Pure.
 */

import type { EnvelopeKind } from "@/lib/bids/types";
import { senToDecimalString, type Sen } from "@/lib/money";

import type { Finding, InvitedCountReading, PeriodUnit } from "./types";

/// FR-OPN-007: the late envelopes on the register, counted, never entered. Still counted once admitted.
export const lateCount = (envelopes: readonly { kind: EnvelopeKind; late: boolean }[]) => envelopes.filter((e) => e.late && e.kind !== "COMPANY_ESTIMATE").length;

export interface ScheduleRowInput {
  listingNo: number;
  bidderName: string;
  registrationClass: string;
  registrationStatus: string;
  /// Null only on the draft drawn before an online opening's finalising, where the price is still sealed (ADR 0036 D10, review S6). A frozen schedule never
  /// holds one: the finalise writes every price before it freezes (a trigger refuses to finalise with a price missing).
  price: Sen | null;
  period: { value: number; unit: PeriodUnit } | null;
  isAlternative: boolean;
  /// Its main offer's Bil., for an alternative.
  parentListingNo: number | null;
  /// The opening it was read at (1 = main).
  openingSequence: number;
}

export interface ScheduleRow {
  listingNo: number;
  bidderName: string;
  registrationClass: string;
  registrationStatus: string;
  /// Decimal string, two places (SULIT). Null: not read yet, on a draft only (review S6); a screen says `PRICE_NOT_READ_WORDS`.
  openingPrice: string | null;
  period: { value: number; unit: PeriodUnit } | null;
  isAlternative: boolean;
  parentListingNo: number | null;
}

export interface ScheduleSnapshot {
  version: number;
  header: {
    title: string;
    reference: string;
    startDay: string | null;
    /// The closing instant, ISO.
    closes: string | null;
    invitedReading: InvitedCountReading | null;
    invitedCount: number | null;
    lateCount: number;
    pages: number | null;
  };
  rows: ScheduleRow[];
  /// Sealed until disclosed: no figure. Disclosed: the configured label (null: product words) and the figure.
  benchmark: { sealed: true } | { sealed: false; label: string | null; companyEstimate: string } | { notRequired: true };
  /// C-3 c: seconds and words; null for a supplementary opening (its envelope was not in the box).
  lockGap: { seconds: number; text: string } | null;
}

export type ScheduleFault = "READING_NOT_SET";

export function jadualTawaran(i: {
  version: number;
  title: string;
  reference: string;
  startDay: string | null;
  closing: Date | null;
  invited: { reading: InvitedCountReading | null; purchasers: number; invitees: number };
  lateCount: number;
  pages: number | null;
  rows: readonly ScheduleRowInput[];
  benchmark: { sealed: true } | { sealed: false; label: string | null; value: Sen } | { notRequired: true };
  lockGap: { seconds: number; text: string } | null;
}): { schedule: ScheduleSnapshot; faults: Finding<ScheduleFault>[] } {
  const faults: Finding<ScheduleFault>[] = [];
  if (i.invited.reading == null) faults.push({ code: "READING_NOT_SET", level: "block" });
  const invitedCount = i.invited.reading == null ? null : i.invited.reading === "PURCHASERS" ? i.invited.purchasers : i.invited.invitees;
  const rows = i.rows
    .filter((r) => r.openingSequence <= i.version)
    .sort((a, b) => a.listingNo - b.listingNo)
    .map((r) => ({ listingNo: r.listingNo, bidderName: r.bidderName, registrationClass: r.registrationClass, registrationStatus: r.registrationStatus, openingPrice: r.price == null ? null : senToDecimalString(r.price), period: r.period, isAlternative: r.isAlternative, parentListingNo: r.parentListingNo }));
  const benchmark: ScheduleSnapshot["benchmark"] = "notRequired" in i.benchmark ? { notRequired: true } : i.benchmark.sealed ? { sealed: true } : { sealed: false, label: i.benchmark.label, companyEstimate: senToDecimalString(i.benchmark.value) };
  return {
    schedule: {
      version: i.version,
      header: { title: i.title, reference: i.reference, startDay: i.startDay, closes: i.closing?.toISOString() ?? null, invitedReading: i.invited.reading, invitedCount, lateCount: i.lateCount, pages: i.pages },
      rows,
      benchmark,
      lockGap: i.lockGap,
    },
    faults,
  };
}

/// The words beside the invited count (OD-9: the reading is the customer's, ASSUMED until RSAJ answers).
export const INVITED_READING_TEXT: Readonly<Record<InvitedCountReading, string>> = {
  PURCHASERS: "Counted as the bidders who bought the documents",
  INVITEES: "Counted as the bidders sent a letter of invitation",
};

/// A frozen schedule as read back (defensive about its shape); null where none is frozen.
export function scheduleFromSnapshot(raw: unknown): ScheduleSnapshot | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const s = raw as Partial<ScheduleSnapshot>;
  if (typeof s.version !== "number" || !s.header || !Array.isArray(s.rows) || !s.benchmark) return null;
  return s as ScheduleSnapshot;
}
