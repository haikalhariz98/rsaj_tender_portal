/**
 * A certificate's date (FR-CRT-005). Pure.
 *
 * On every form whose authorising block is marked `datesCertificate`, the certificate is dated the day of
 * that block's recorded act: the organisation's day of the act for a block of the organisation's own, the
 * day signed for an outsider's. It is derived, never keyed; until that block is recorded it is "set when
 * signed". A form with no such block dates nothing (and says so). A correction, as 6.12 OD-1 A, moves it to
 * an earlier day only, with a reason, never into the future and never before a block recorded before it.
 */

import type { Block, Finding, SignedBlock } from "./types";

export type CertificateDate = { state: "DATED"; day: string; block: string } | { state: "NOT_YET"; block: string } | { state: "NO_DATING_BLOCK" };

export function certificateDateOf(blocks: readonly Block[], signed: readonly SignedBlock[]): CertificateDate {
  const dating = blocks.find((b) => b.datesCertificate);
  if (!dating) return { state: "NO_DATING_BLOCK" };
  const s = signed.find((x) => x.blockOrder === dating.blockOrder);
  return s ? { state: "DATED", day: s.signedOn, block: dating.labelEn } : { state: "NOT_YET", block: dating.labelEn };
}

export interface DateCorrection {
  /// The date as it stands. Null: not dated, so nothing to correct.
  current: string | null;
  proposed: string;
  reason: string;
  today: string;
  /// The latest day a block before the dating block was recorded: the date never goes before it.
  earliestAllowed: string | null;
}

export function dateCorrectionFaults(c: DateCorrection): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (!c.current) {
    f("NOT_DATED");
    return out;
  }
  if (c.proposed > c.today) f("FUTURE_DATE", { day: c.proposed });
  if (c.proposed >= c.current) f("NOT_EARLIER", { day: c.current });
  if (c.earliestAllowed && c.proposed < c.earliestAllowed) f("BEFORE_EARLIER", { day: c.earliestAllowed });
  if (!c.reason.trim()) f("REASON_REQUIRED");
  return out;
}

/// The latest day any block before the dating block was recorded.
export function earliestCorrectionDay(blocks: readonly Block[], signed: readonly SignedBlock[]): string | null {
  const dating = blocks.find((b) => b.datesCertificate);
  if (!dating) return null;
  return signed.filter((s) => s.blockOrder < dating.blockOrder).map((s) => s.signedOn).sort().at(-1) ?? null;
}
