/**
 * The move rules (plan §3.3; 0008 §4.2; WS-24): one pure function judges a status change, and the board, the list, the panel and the acts all call it.
 *
 * | From → To                                    | Who                                                              | Also needs                                   |
 * | To do → In progress                          | Assignee, raiser or lead                                         | —                                            |
 * | To do or In progress → In review             | The assignee, where the assignee is not the raiser               | RFI: an answer. Inspection: result Passed.   |
 * | To do or In progress → Done (the shortcut)   | Raiser or lead, where unassigned or the assignee is the raiser   | As for In review                             |
 * | In review → Done                             | Raiser or lead                                                   | As for In review                             |
 * | In review → In progress (send back)          | Raiser or lead                                                   | A comment, written in the same act           |
 * | To do, In progress or In review → Cancelled  | Raiser or lead                                                   | A reason                                     |
 * | Done or Cancelled → To do (reopen)           | Raiser or lead                                                   | —                                            |
 * | Anything else                                | Nobody                                                           | NOT_A_MOVE                                   |
 *
 * `WORK_ITEM` (the contract's act status) is asked first, then MOVED_ALREADY; each refuses alone. A move outside its shape (In review on a self-assigned or
 * unassigned item, the shortcut on an item someone else holds) is NOT_A_MOVE: there is nobody who may make it. Otherwise every fault is returned: who, and
 * what the move still needs. Someone who may not read the contract's stages is nobody on the item.
 */

import { TEXT_MAX, textLength } from "./bounds";
import { whoCanWords, type WhoNames } from "./labels";
import { isContractor, sameParty } from "./party";
import type { MoveFault, PrimaryActions, WorkAction, WorkActor, WorkItemFacts, WorkStatus } from "./types";

export const OPEN_STATUSES: readonly WorkStatus[] = ["TO_DO", "IN_PROGRESS", "IN_REVIEW"];
export const CLOSED_STATUSES: readonly WorkStatus[] = ["DONE", "CANCELLED"];
export const isOpen = (s: WorkStatus): boolean => OPEN_STATUSES.includes(s);

/// What the act knows beside the item: the contract's `WORK_ITEM` answer, what a dialog collected, and the row's last move (for MOVED_ALREADY's words).
export interface MoveContext {
  contractOpen: boolean;
  /// Cancel's reason.
  reason?: string;
  /// Send back's comment.
  comment?: string;
  /// Who last moved the row and when, as the audit trail says; MOVED_ALREADY names them.
  lastMove?: { by: string | null; at: string } | null;
}

/// The faults a dialog or a field clears, not a person: the board and the panel still offer a move that has only these.
export const INPUT_FAULTS: readonly MoveFault["code"][] = ["REASON_NEEDED", "COMMENT_NEEDED", "ANSWER_NEEDED", "RESULT_NOT_PASSED"];

/// The action a move is, or null where the move table has no row.
export function actionOf(from: WorkStatus, to: WorkStatus): WorkAction | null {
  if (isOpen(from) && to === "CANCELLED") return "CANCEL";
  if (!isOpen(from)) return to === "TO_DO" ? "REOPEN" : null;
  if (from === "IN_REVIEW") return to === "DONE" ? "MARK_DONE" : to === "IN_PROGRESS" ? "SEND_BACK" : null;
  if (to === "IN_REVIEW") return "SEND_FOR_REVIEW";
  if (to === "DONE") return "MARK_DONE";
  return from === "TO_DO" && to === "IN_PROGRESS" ? "START" : null;
}

/// WSEC-9: closing an RFI accepts its answer as it stands, whoever wrote it. The text to record on the audit row, or null where the close accepts none. (A column that does not
/// change writes no audit line, so the store records it as a line of its own: none -> the text.)
export const answerAcceptedBy = (action: WorkAction | null, item: Pick<WorkItemFacts, "type" | "answer">): string | null => (action === "MARK_DONE" && item.type === "RFI" && item.answer.trim() !== "" ? item.answer : null);

/// The status an action takes an item to.
export const TARGET: Readonly<Record<WorkAction, WorkStatus>> = { START: "IN_PROGRESS", SEND_FOR_REVIEW: "IN_REVIEW", MARK_DONE: "DONE", SEND_BACK: "IN_PROGRESS", CANCEL: "CANCELLED", REOPEN: "TO_DO" };

/// Who the actor is on the item. The contractor is a party only as the company, only on a shared item, and is never the lead.
function rolesOf(item: WorkItemFacts, actor: WorkActor) {
  if (actor.side === "CONTRACTOR") {
    const on = actor.mayReadContract && item.sharedAt !== null;
    return { raiser: on && isContractor(item.raisedBy), assignee: on && isContractor(item.assignee), lead: false };
  }
  const on = actor.mayReadContract && actor.personId !== null;
  const me = actor.personId;
  return {
    raiser: on && item.raisedBy.kind === "PERSON" && item.raisedBy.id === me,
    assignee: on && item.assignee?.kind === "PERSON" && item.assignee.id === me,
    lead: on && me !== null && actor.leadIds.includes(me),
  };
}

/// The moves the contractor never makes (0008 §4.2): Start, Cancel, Reopen and the shortcut. It sends for checking as assignee, and accepts or asks again
/// as raiser (3b B-9).
function contractorMayAttempt(action: WorkAction, from: WorkStatus): boolean {
  return action === "SEND_FOR_REVIEW" || action === "SEND_BACK" || (action === "MARK_DONE" && from === "IN_REVIEW");
}

/// What closing needs on its type: an RFI's answer, an inspection's Passed.
function closingNeeds(item: WorkItemFacts): MoveFault[] {
  if (item.type === "RFI" && item.answer.trim() === "") return [{ code: "ANSWER_NEEDED" }];
  if (item.type === "INSPECTION" && item.inspectionResult !== "PASSED") return [{ code: "RESULT_NOT_PASSED" }];
  return [];
}

export function moveFaults(item: WorkItemFacts, actor: WorkActor, to: WorkStatus, expectedFrom: WorkStatus, ctx: MoveContext): MoveFault[] {
  if (!ctx.contractOpen) return [{ code: "CONTRACT_READ_ONLY" }];
  if (item.status !== expectedFrom) return [{ code: "MOVED_ALREADY", by: ctx.lastMove?.by ?? null, at: ctx.lastMove?.at ?? "" }];
  const from = item.status;
  const action = actionOf(from, to);
  const notAMove: MoveFault[] = [{ code: "NOT_A_MOVE", from, to }];
  if (!action) return notAMove;

  const r = rolesOf(item, actor);
  const raiserOrLead = r.raiser || r.lead;
  // The shortcut's shape: nobody else holds the item, so there is nobody to review it for.
  const selfHeld = item.assignee === null || sameParty(item.assignee, item.raisedBy);
  if (actor.side === "CONTRACTOR" && !contractorMayAttempt(action, from)) return [{ code: "NOT_FOR_CONTRACTOR" }];
  const out: MoveFault[] = [];
  switch (action) {
    case "START":
      if (!(r.assignee || raiserOrLead)) out.push({ code: "ONLY_ASSIGNEE_RAISER_OR_LEAD" });
      break;
    case "SEND_FOR_REVIEW":
      if (selfHeld) return notAMove;
      if (!r.assignee) out.push({ code: "ONLY_ASSIGNEE" });
      out.push(...closingNeeds(item));
      break;
    case "MARK_DONE":
      if (from !== "IN_REVIEW" && !selfHeld) return notAMove;
      if (!raiserOrLead) out.push({ code: "ONLY_RAISER_OR_LEAD" });
      out.push(...closingNeeds(item));
      break;
    case "SEND_BACK":
      if (!raiserOrLead) out.push({ code: "ONLY_RAISER_OR_LEAD" });
      if (!ctx.comment?.trim()) out.push({ code: "COMMENT_NEEDED" });
      else if (textLength(ctx.comment) > TEXT_MAX) out.push({ code: "TOO_LONG", field: "comment", max: TEXT_MAX });
      break;
    case "CANCEL":
      if (!raiserOrLead) out.push({ code: "ONLY_RAISER_OR_LEAD" });
      if (!ctx.reason?.trim()) out.push({ code: "REASON_NEEDED" });
      else if (textLength(ctx.reason) > TEXT_MAX) out.push({ code: "TOO_LONG", field: "cancelReason", max: TEXT_MAX });
      break;
    case "REOPEN":
      if (!raiserOrLead) out.push({ code: "ONLY_RAISER_OR_LEAD" });
      break;
  }
  return out;
}

/// The faults left once the inputs a dialog or a field supplies are set aside: a person or the table refuses.
export const blockingFaults = (faults: readonly MoveFault[]): MoveFault[] => faults.filter((f) => !INPUT_FAULTS.includes(f.code));

/// The actions offered on each status, in the order the panel prefers them.
export const CANDIDATES: Readonly<Record<WorkStatus, readonly WorkAction[]>> = {
  TO_DO: ["START", "SEND_FOR_REVIEW", "MARK_DONE", "CANCEL"],
  IN_PROGRESS: ["SEND_FOR_REVIEW", "MARK_DONE", "CANCEL"],
  IN_REVIEW: ["MARK_DONE", "SEND_BACK", "CANCEL"],
  DONE: ["REOPEN"],
  CANCELLED: ["REOPEN"],
};
/// Cancel, Send back and Reopen are never the one primary action (0008 §5.4): they sit in the ⋯ menu.
const PRIMARY_ELIGIBLE: readonly WorkAction[] = ["START", "SEND_FOR_REVIEW", "MARK_DONE"];

/**
 * The panel's one primary action and its ⋯ menu (0008 §5.4, WS-13), from `moveFaults`, so nothing is offered that the act would refuse for who the reader is.
 * A move that still needs an answer, a passed result, a reason or a comment is offered: the dialog or the act's refusal says what is missing. With no primary,
 * the first primary-eligible action the reader is refused by person is shown disabled, with who can.
 */
export function primaryActions(item: WorkItemFacts, reader: WorkActor, ctx: { contractOpen: boolean; who: WhoNames }): PrimaryActions {
  if (!ctx.contractOpen) return { primary: null, menu: [], disabled: null };
  const judged = CANDIDATES[item.status].map((action) => ({ action, faults: moveFaults(item, reader, TARGET[action], item.status, { contractOpen: true }) }));
  const offered = judged.filter((j) => blockingFaults(j.faults).length === 0).map((j) => j.action);
  const primary = offered.find((a) => PRIMARY_ELIGIBLE.includes(a)) ?? null;
  const menu = offered.filter((a) => a !== primary);
  const refusedByPerson = primary
    ? undefined
    : judged.find((j) => PRIMARY_ELIGIBLE.includes(j.action) && j.faults.some((f) => f.code === "ONLY_ASSIGNEE" || f.code === "ONLY_RAISER_OR_LEAD" || f.code === "ONLY_ASSIGNEE_RAISER_OR_LEAD"));
  return { primary, menu, disabled: refusedByPerson ? { action: refusedByPerson.action, whoCan: whoCanWords(refusedByPerson.action, ctx.who) } : null };
}

/// The faults the contractor clears itself: Ask again's reply, and an RFI's answer only where it holds the RFI (it writes it there, WB-6). It never sets a
/// result (B-10), and never writes the answer of an RFI it raised, so that one blocks Accept answer until staff answer again.
const contractorClears = (f: MoveFault, item: WorkItemFacts): boolean => f.code === "COMMENT_NEEDED" || (f.code === "ANSWER_NEEDED" && isContractor(item.assignee));

/// The moves the contractor may make on an item now (3b B-9): Send for checking as assignee, Accept answer (Mark done) and Ask again (Send back) as raiser.
export function contractorActions(item: WorkItemFacts, actor: WorkActor): WorkAction[] {
  if (actor.side !== "CONTRACTOR") return [];
  return CANDIDATES[item.status].filter((action) => moveFaults(item, actor, TARGET[action], item.status, { contractOpen: true }).every((f) => contractorClears(f, item)));
}
