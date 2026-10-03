/**
 * A certificate's date (FR-CRT-005). Pure.
 *
 * On every form whose authorising block is marked `datesCertificate`, the certificate is dated the day of
 * that block's recorded act: the organisation's day of the act for a block of the organisation's own, the
 * day signed for an outsider's. It is derived, never keyed; until that block is recorded it is "set when
 * signed". A form with no such block dates nothing (and says so). A correction, as 6.12 OD-1 A, moves it to
 * an earlier day only, with a reason, never into the future and never before a block recorded before it.
 *
 * 6.14 inc 1 fix (M-1, R-9): a correction is made only while the certificate is being signed, so the day it
 * is issued with is the corrected one (`dateAtIssue`), in its frozen text, its fields and its issue snapshot
 * alike. Once issued the date is final (ADR 0022 §3: an issued certificate is corrected only by a later
 * certificate); a void certificate stays as it was. Nor does a correction go before the day the certificate
 * was opened, or the day its route was approved where it has one (R-10's floor, the same for a signature).
 */

import type { Block, CertificateStatus, Finding, SignedBlock } from "./types";

export type CertificateDate = { state: "DATED"; day: string; block: string } | { state: "NOT_YET"; block: string } | { state: "NO_DATING_BLOCK" };

export function certificateDateOf(blocks: readonly Block[], signed: readonly SignedBlock[]): CertificateDate {
  const dating = blocks.find((b) => b.datesCertificate);
  if (!dating) return { state: "NO_DATING_BLOCK" };
  const s = signed.find((x) => x.blockOrder === dating.blockOrder);
  return s ? { state: "DATED", day: s.signedOn, block: dating.labelEn } : { state: "NOT_YET", block: dating.labelEn };
}

export interface DateCorrection {
  /// Where the certificate stands: corrected only while it is being signed.
  status: CertificateStatus;
  /// The date as it stands. Null: not dated, so nothing to correct.
  current: string | null;
  proposed: string;
  reason: string;
  today: string;
  /// The latest day a block before the dating block was recorded: the date never goes before it.
  earliestAllowed: string | null;
  /// The organisation's day the certificate was opened: the date never goes before it.
  openedOn: string;
  /// The day its approval route was approved, where it has a routing sheet: never before it.
  approvedOn: string | null;
}

/// The statuses a certificate's date may be corrected in: only while it is being signed (before issue).
export const DATE_CORRECTABLE_IN: readonly CertificateStatus[] = ["SIGNING"];

export function dateCorrectionFaults(c: DateCorrection): Finding[] {
  const out: Finding[] = [];
  const f = (code: string, data: Record<string, string | number | null> = {}) => out.push({ code, level: "block", data });
  if (c.status === "ISSUED") {
    f("ISSUED_DATE_FINAL");
    return out;
  }
  if (c.status === "VOID") {
    f("VOID_IS_FINAL");
    return out;
  }
  if (!DATE_CORRECTABLE_IN.includes(c.status) || !c.current) {
    f("NOT_DATED");
    return out;
  }
  if (c.proposed > c.today) f("FUTURE_DATE", { day: c.proposed });
  if (c.proposed >= c.current) f("NOT_EARLIER", { day: c.current });
  if (c.earliestAllowed && c.proposed < c.earliestAllowed) f("BEFORE_EARLIER", { day: c.earliestAllowed });
  if (c.proposed < c.openedOn) f("BEFORE_OPENED", { day: c.openedOn });
  if (c.approvedOn && c.proposed < c.approvedOn) f("BEFORE_APPROVED", { day: c.approvedOn });
  if (!c.reason.trim()) f("REASON_REQUIRED");
  return out;
}

/// The latest day any block before the dating block was recorded.
export function earliestCorrectionDay(blocks: readonly Block[], signed: readonly SignedBlock[]): string | null {
  const dating = blocks.find((b) => b.datesCertificate);
  if (!dating) return null;
  return signed.filter((s) => s.blockOrder < dating.blockOrder).map((s) => s.signedOn).sort().at(-1) ?? null;
}

/**
 * The day a certificate is issued with (M-1): where the act that issues it is the dating block's own, that
 * act's day; otherwise the certificate's date as read under the lock, which carries any correction made
 * while it was being signed. Never the dating signature's day over a correction.
 */
export function dateAtIssue(datedByThisAct: string | null, storedDate: string | null): string | null {
  return datedByThisAct ?? storedDate;
}
