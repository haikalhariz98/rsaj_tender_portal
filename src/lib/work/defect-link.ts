/**
 * The defect link, as pure rules (workspace 3b-ii step 10; plan B-18; ADR 0047, ADR 0049 D5). A Defect item may stand for one defect line (`WorkItem.defectItemId`); the line's
 * events are the truth (ADR 0047 D1), and the item's status is WRITTEN THROUGH by every defect act so `workWhere` stays one indexed query. Nothing here reads a database.
 *
 * | Line state          | Item status | closedAt | cancelReason         |
 * | Open                | In progress | null     | (unchanged)          |
 * | Reported rectified  | In review   | null     | (unchanged)          |
 * | Made good           | Done        | the act  | (unchanged)          |
 * | Withdrawn           | Cancelled   | the act  | the withdrawal note  |
 *
 * | Item move (action)        | Defect act (staff)  | Contractor          |
 * | Mark done                 | accept              | no                  |
 * | Send back                 | return              | no                  |
 * | Cancel                    | withdraw            | no                  |
 * | Send for checking         | report rectified    | report rectified    |
 * | Reopen, Start             | none: refused       | no                  |
 */

import type { DefectAct } from "@/lib/closeout/defects";
import type { DefectState } from "@/lib/closeout/types";

import type { WorkAction, WorkStatus } from "./types";

export const defectItemStatus = (state: DefectState): WorkStatus => (state === "OPEN" ? "IN_PROGRESS" : state === "REPORTED_RECTIFIED" ? "IN_REVIEW" : state === "MADE_GOOD" ? "DONE" : "CANCELLED");

/// The state an act that the rules have allowed leaves its line in (a return reads as Open again, ADR 0047).
export const stateAfter = (act: DefectAct): DefectState => (act === "REPORT_RECTIFIED" ? "REPORTED_RECTIFIED" : act === "ACCEPT" ? "MADE_GOOD" : act === "WITHDRAW" ? "WITHDRAWN" : "OPEN");

/// The columns a defect act writes on its linked item: the status, `closedAt` (set exactly when closed: the table's CHECK) and, for a withdrawal, the note as the reason.
export function linkedItemPatch(state: DefectState, note: string, now: Date): { status: WorkStatus; closedAt: Date | null; cancelReason?: string } {
  const status = defectItemStatus(state);
  const closed = status === "DONE" || status === "CANCELLED";
  return { status, closedAt: closed ? now : null, ...(state === "WITHDRAWN" ? { cancelReason: note.trim() } : {}) };
}

/// The defect act an item move stands for, or null where the move has none. The contractor's only move is "Mark as fixed".
export function defectActOf(action: WorkAction | null, side: "STAFF" | "CONTRACTOR"): DefectAct | null {
  if (action === "SEND_FOR_REVIEW") return "REPORT_RECTIFIED";
  if (side === "CONTRACTOR") return null;
  return action === "MARK_DONE" ? "ACCEPT" : action === "SEND_BACK" ? "RETURN" : action === "CANCEL" ? "WITHDRAW" : null;
}

/// What a defect line says when an item stands for it: the title, then the description where there is one (the line's own limit is 2,000).
export const defectLineText = (title: string, description: string): string => (description.trim() ? `${title.trim()}: ${description.trim()}` : title.trim()).slice(0, 2000);

/// Why a move on a linked item that has no defect act is refused.
export const linkedMoveWords = (action: WorkAction | null): string => (action === "REOPEN" ? "This defect is closed in Close-out." : "This defect moves with its line in Close-out.");
