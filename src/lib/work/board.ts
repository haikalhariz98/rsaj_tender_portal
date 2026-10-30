/**
 * The Board's columns and each card's moves (0008 §5.3; plan §3.4). Pure: the screen maps these to `BoardCard`s for `src/components/ui/board.tsx`, which
 * offers a card only the column ids in its `moves`.
 *
 * - Four columns, To do to Done. Cancelled is never on the board (it is in the list's Done view).
 * - Done shows what closed in the last `BOARD_DONE_DAYS` days, today counted as one of them; older is "in the list". With no today (no time zone) the window
 *   cannot be judged, so Done shows every closed item, capped like any column.
 * - A column shows at most `BOARD_COLUMN_CAP` cards, in `compareItems` order, and says how many more there are.
 * - A card's moves are the columns `moveFaults` lets the reader drop it in. A move that still needs an answer or a passed result is offered (the act refuses
 *   with what is missing); one that needs a comment (send back) is not, as a drop cannot collect one: the panel's Send back does.
 */

import { dayPlus } from "@/lib/dates";

import { linkedDropColumns, linkedMoveWords } from "./defect-link";
import { isOpen, moveFaults, primaryActions } from "./move";
import { READ_ONLY_WORDS, whoCanWords, type WhoNames } from "./labels";
import type { BoardColumn, Day, MoveFault, WorkActor } from "./types";
import { compareItems, type WorkRow } from "./views";

/// Product display constants (0008 §5.3), not customer policy: what one board column shows at once.
export const BOARD_DONE_DAYS = 14;
export const BOARD_COLUMN_CAP = 50;
export const BOARD_COLUMNS: readonly BoardColumn[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW", "DONE"];

/// An item on the board: with the organisation's day it was closed, for Done's window (null while open).
export interface BoardItem extends WorkRow {
  closedOn: Day | null;
}

export interface BoardColumnOf<T extends BoardItem> {
  column: BoardColumn;
  items: T[];
  /// Every item in the column, the capped ones included.
  total: number;
  /// How many are not drawn.
  more: number;
  /// Done only: closed before the window, so never on the board; the list holds them, whatever the cap (the board's "Older" link).
  older: number;
}

/// Within the window: closed today or in the `BOARD_DONE_DAYS - 1` days before (a day after today, from another clock, still shows).
export function closedRecently(closedOn: Day | null, today: Day | null): boolean {
  if (today === null) return true;
  return closedOn !== null && closedOn > dayPlus(today, -BOARD_DONE_DAYS);
}

export function boardColumns<T extends BoardItem>(items: readonly T[], today: Day | null): BoardColumnOf<T>[] {
  return BOARD_COLUMNS.map((column) => {
    const inColumn = items.filter((i) => i.status === column);
    const all = inColumn.filter((i) => column !== "DONE" || closedRecently(i.closedOn, today)).sort(compareItems);
    const shown = all.slice(0, BOARD_COLUMN_CAP);
    return { column, items: shown, total: all.length, more: all.length - shown.length, older: inColumn.length - all.length };
  });
}

/// Faults a drop may still carry: the act refuses with them, and the card returns with the words.
const DROP_ALLOWS: readonly MoveFault["code"][] = ["ANSWER_NEEDED", "RESULT_NOT_PASSED"];

/// The columns a reader may drop a card in, and, when none, why (who can, or the contract is closed).
export function cardMoves(item: WorkRow & { linked?: boolean }, reader: WorkActor, ctx: { contractOpen: boolean; who: WhoNames }): { moves: BoardColumn[]; stuckWhy: string | null } {
  if (!ctx.contractOpen) return { moves: [], stuckWhy: READ_ONLY_WORDS.en };
  // A linked item moves with its defect line: the drop does not pre-judge who may, the defect act answers.
  if (item.linked) {
    const moves = linkedDropColumns(item.status);
    return { moves, stuckWhy: moves.length ? null : linkedMoveWords(null) };
  }
  const moves = BOARD_COLUMNS.filter((to) => to !== item.status && moveFaults(item, reader, to, item.status, { contractOpen: true }).every((f) => DROP_ALLOWS.includes(f.code)));
  if (moves.length > 0) return { moves, stuckWhy: null };
  // A closed card has no primary action to be refused: say who can reopen it.
  return { moves, stuckWhy: primaryActions(item, reader, ctx).disabled?.whoCan.en ?? (isOpen(item.status) ? null : whoCanWords("REOPEN", ctx.who).en) };
}
