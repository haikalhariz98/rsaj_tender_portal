/**
 * The documents register (6.14 increment 2, `/documents`): the Library of generated documents, the copies still to
 * go out or to be acknowledged, and the routing sheets still open with their elapsed time against the target. Pure:
 * the page loads the rows; the ordering, the merge of two sources into one page, every row's state and every count
 * shown above a list are worked out here, over the whole set, never over the page on screen.
 */

import type { Sheet } from "./routing-sheet";

export const LIBRARY_PAGE = 50;
export const DISTRIBUTION_PAGE = 50;
export const SHEETS_PAGE = 50;

/// One generated document as the Library lists it: when it was frozen (a certificate's issue, an award document's freezing) and its id.
export interface Dated {
  at: Date;
  id: string;
}

/// Newest first; two frozen in one instant by their id, so the order never rests on the load order.
export const newestFirst = (a: Dated, b: Dated): number => b.at.getTime() - a.at.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/**
 * One page of two sources listed as one, newest first. Each source is handed in already sorted newest first and
 * holding at least its first `skip + take` rows, so the page is exact whatever the two sources' sizes.
 */
export function mergedPage<A extends Dated, B extends Dated>(a: readonly A[], b: readonly B[], skip: number, take: number): (A | B)[] {
  return [...a, ...b].sort(newestFirst).slice(skip, skip + take);
}

/// The page asked for, clamped to the pages there are (a page past the end shows the last).
export function pageOf(asked: string | undefined, total: number, size: number): number {
  const n = Number.parseInt(asked ?? "", 10);
  const last = Math.max(0, Math.ceil(total / size) - 1);
  return Number.isInteger(n) && n >= 1 ? Math.min(n - 1, last) : 0;
}

export interface CopyFacts {
  mandatory: boolean;
  ackRequired: boolean;
  despatchedOn: string | null;
  acknowledgedOn: string | null;
}

export type CopyState = "NOT_SENT" | "ACK_AWAITED" | "DONE";

/// Where an addressed copy stands: not sent, sent and its acknowledgement awaited, or done.
export function copyState(c: CopyFacts): CopyState {
  if (!c.despatchedOn) return "NOT_SENT";
  if (c.ackRequired && !c.acknowledgedOn) return "ACK_AWAITED";
  return "DONE";
}

/// Counted over every outstanding copy of every issued certificate.
export interface DistributionCounts {
  notSent: number;
  notSentMandatory: number;
  ackAwaited: number;
}

/// The open routing sheets, judged over all of them.
export interface SheetCounts {
  open: number;
  /// Received and not approved, already past its target.
  overTarget: number;
  /// Not judged: no target, an undecided edge, no band, or not received yet.
  notJudged: number;
}

export function sheetCounts(sheets: readonly Pick<Sheet, "verdict">[]): SheetCounts {
  let overTarget = 0;
  let notJudged = 0;
  for (const s of sheets) {
    const v = s.verdict;
    if ((v.state === "OPEN" && v.overBy > 0) || v.state === "OVER") overTarget += 1;
    if (v.state === "NOT_STARTED" || v.state === "NOT_MEASURED") notJudged += 1;
  }
  return { open: sheets.length, overTarget, notJudged };
}

/**
 * The order the open sheets are listed in: longest open first (by the day received, earliest first), sheets not yet
 * received after them, then by certificate id, so the order never rests on the load order.
 */
export function sheetOrder(a: { date1: string | null; id: string }, b: { date1: string | null; id: string }): number {
  if (a.date1 && b.date1 && a.date1 !== b.date1) return a.date1 < b.date1 ? -1 : 1;
  if (!!a.date1 !== !!b.date1) return a.date1 ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
