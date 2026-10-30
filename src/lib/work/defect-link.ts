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

import { defectState, effectiveDue, onDraftCpc, type DefectAct } from "@/lib/closeout/defects";
import type { DefectEventKind, DefectState } from "@/lib/closeout/types";
import { storedDay } from "@/lib/dates";

import { actionOf, CANDIDATES } from "./move";
import type { BoardColumn, Day, WorkAction, WorkStatus } from "./types";

/// How an item's defect line stands for the rules (`WorkItemFacts.linkedLine`): on a draft CPC's list, or recorded. `link` is the item's `defectItem` with its CPC's certificate status.
export const linkedLineOf = (link: { practicalCompletionId: string | null; practicalCompletion: { certificate: { status: string } } | null } | null): "DRAFT" | "RECORDED" | undefined =>
  link === null ? undefined : onDraftCpc(link, link.practicalCompletion?.certificate.status ?? null) ? "DRAFT" : "RECORDED";

export const defectItemStatus = (state: DefectState): WorkStatus => (state === "OPEN" ? "IN_PROGRESS" : state === "REPORTED_RECTIFIED" ? "IN_REVIEW" : state === "MADE_GOOD" ? "DONE" : "CANCELLED");

/// The note of the line's latest return, while the line is open again after it (WR-2): the line's events are its one home, and both panels read it from there.
export const returnNoteOf = (events: readonly { kind: DefectEventKind; on: Date; note: string; recordedAt: Date }[]): string | null => {
  const r = defectState(events.map((e) => ({ kind: e.kind, on: storedDay(e.on), note: e.note, at: e.recordedAt.toISOString() })));
  return r.state === "OPEN" && r.returnNote ? r.returnNote : null;
};

/// The line state a linked item's status stands for (the inverse of `defectItemStatus`; a returned line reads Open again). To Do cannot be a linked status.
export const lineStateOf = (status: WorkStatus): DefectState => (status === "IN_REVIEW" ? "REPORTED_RECTIFIED" : status === "DONE" ? "MADE_GOOD" : status === "CANCELLED" ? "WITHDRAWN" : "OPEN");

/// What a linked item's panel offers: only the moves with a defect act, whoever the reader is (the act answers who may). Send for checking or Mark done is the primary action.
export function linkedPanelActions(status: WorkStatus, contractOpen: boolean, side: "STAFF" | "CONTRACTOR" = "STAFF", draft = false): { primary: WorkAction | null; menu: WorkAction[] } {
  // WR-1: a line on a draft CPC's list is acted on once the certificate is issued, so nothing is offered (no control that is always refused).
  const offered = contractOpen && !draft ? CANDIDATES[status].filter((a) => defectActOf(a, side) !== null) : [];
  const primary = offered.find((a) => a === "SEND_FOR_REVIEW" || a === "MARK_DONE") ?? null;
  return { primary, menu: offered.filter((a) => a !== primary) };
}

/// The columns a card on a linked item may be dropped in: where a defect act stands for the drop (a send back needs a note, which a drop cannot collect). Who may is not judged here.
export const linkedDropColumns = (status: WorkStatus, draft = false): BoardColumn[] => (draft ? [] : (["IN_PROGRESS", "IN_REVIEW", "DONE"] as BoardColumn[]).filter((to) => to !== status && (["REPORT_RECTIFIED", "ACCEPT"] as (DefectAct | null)[]).includes(defectActOf(actionOf(status, to), "STAFF"))));

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

/// The day a linked item is due: the line's effective due date (an issued Schedule of Defects' rectify-by, else the line's own day), the rule `overdue` uses (WR-3).
export const linkedDueOn = (lineDueOn: Day, scheduleRectifyBy: Day | null): Day => effectiveDue(lineDueOn, scheduleRectifyBy);

/// What a defect line says when an item stands for it: the title, then the description where there is one. Never cut: the line's limit (`DEFECT_TEXT_MAX`) is judged by its cores, which refuse a longer one.
export const defectLineText = (title: string, description: string): string => (description.trim() ? `${title.trim()}: ${description.trim()}` : title.trim());

/// Why a move on a linked item that has no defect act is refused.
export const linkedMoveWords = (action: WorkAction | null): string => (action === "REOPEN" ? "This defect is closed in Close-out." : "This defect moves with its line in Close-out.");
