/**
 * The documents register (6.14 increment 2, `/documents`): the Library of generated documents, the copies still to
 * go out or to be acknowledged, and the routing sheets still open with their elapsed time against the target. Pure:
 * the page loads the rows (the Library's page and count in the database, code review M-3); every row's state, the
 * where-clauses of the lists and their counts, and the open sheets' order and counts are worked out here, over the
 * whole set, never over the page on screen.
 */

import type { Sheet } from "./routing-sheet";

/**
 * Code review M-2: a cancelled contract's copies and open sheets are kept as they were and never chased: they are
 * out of the outstanding lists and counts, and counted apart. The where-clauses the register reads with (one rule
 * for the lists and their counts).
 */
export function issuedCopiesWhere(organisationId: string, onCancelled: boolean, contractId?: string) {
  // `contractId` narrows the same reading to one contract's copies (the contract's Documents tab, AC-16); absent, the whole register's.
  return { organisationId, certificate: { status: "ISSUED" as const, ...(contractId ? { contractId } : {}), contract: onCancelled ? { status: "CANCELLED" as const } : { status: { not: "CANCELLED" as const } } }, recalledOn: null };
}

/// The copies still to go out or to be acknowledged: not sent, or sent and its acknowledgement awaited.
export function outstandingCopiesWhere(organisationId: string, onCancelled: boolean) {
  return { ...issuedCopiesWhere(organisationId, onCancelled), OR: [{ despatchedOn: null }, { ackRequired: true, acknowledgedOn: null }] };
}

export function openSheetsWhere(organisationId: string, onCancelled: boolean) {
  return { organisationId, status: "IN_ROUTING" as const, contract: onCancelled ? { status: "CANCELLED" as const } : { status: { not: "CANCELLED" as const } } };
}

/// LIKE patterns for a search's variants, wildcards in the words taken literally (backslash is ILIKE's escape).
export const likePatterns = (variants: readonly string[]): string[] => variants.map((v) => `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);

export const LIBRARY_PAGE = 50;
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
