/**
 * Work items' words (AGENTS.md rule 5: no code reaches a screen; English only; 0008 §13's word budgets). Every enum value has its words here, the short
 * type words of a reference ("RFI 12") included: they are never the enum key (WS-1, 0008 §4.4). A refusal is one sentence and names who can. Pure.
 */

import { w, type Words } from "@/lib/contract/labels";

import type { FieldFault, IncidentSeverity, InspectionResult, Lateness, MoveFault, WorkAction, WorkImpact, WorkItemType, WorkNoticeKind, WorkPriority, WorkStatus, WorkView } from "./types";

export const TYPE_WORDS: Readonly<Record<WorkItemType, Words>> = {
  RFI: w("RFI"),
  SITE_INSTRUCTION: w("Site instruction"),
  INSPECTION: w("Inspection"),
  SAFETY_INCIDENT: w("Safety incident"),
  ACTION: w("Action item"),
  DEFECT: w("Defect"),
  TASK: w("Task"),
};

/// The short word of a reference, on cards, rows and in the address (`item=RFI-12`). Letters only and unique, so `parseItemRef` can read it back.
export const TYPE_SHORT: Readonly<Record<WorkItemType, string>> = {
  RFI: "RFI",
  SITE_INSTRUCTION: "SI",
  INSPECTION: "Insp",
  SAFETY_INCIDENT: "Incident",
  ACTION: "Act",
  DEFECT: "Defect",
  TASK: "Task",
};

export const STATUS_WORDS: Readonly<Record<WorkStatus, Words>> = {
  TO_DO: w("To do"),
  IN_PROGRESS: w("In progress"),
  IN_REVIEW: w("In review"),
  DONE: w("Done"),
  CANCELLED: w("Cancelled"),
};

export const PRIORITY_WORDS: Readonly<Record<WorkPriority, Words>> = { LOW: w("Low"), NORMAL: w("Normal"), HIGH: w("High"), URGENT: w("Urgent") };

export const IMPACT_WORDS: Readonly<Record<WorkImpact, Words>> = { NONE: w("None"), COST: w("Cost"), TIME: w("Time"), COST_AND_TIME: w("Cost and time") };

export const RESULT_WORDS: Readonly<Record<InspectionResult, Words>> = { NOT_YET: w("Not yet"), PASSED: w("Passed"), FAILED: w("Failed") };

/// A failed inspection's mark on a card and a row (0008 §4.1: an NCR is not an eighth type).
export const NCR_WORD = w("NCR");

export const SEVERITY_WORDS: Readonly<Record<IncidentSeverity, Words>> = {
  NEAR_MISS: w("Near miss"),
  FIRST_AID: w("First aid"),
  MEDICAL_TREATMENT: w("Medical treatment"),
  LOST_TIME: w("Lost time"),
  DANGEROUS_OCCURRENCE: w("Dangerous occurrence"),
};

export const ACTION_WORDS: Readonly<Record<WorkAction, Words>> = {
  START: w("Start"),
  SEND_FOR_REVIEW: w("Send for review"),
  MARK_DONE: w("Mark done"),
  SEND_BACK: w("Send back"),
  CANCEL: w("Cancel"),
  REOPEN: w("Reopen"),
};

/// What an action does, after "can" in a who-can sentence.
const ACTION_VERB: Readonly<Record<WorkAction | "EDIT", string>> = {
  START: "start this",
  SEND_FOR_REVIEW: "send this for review",
  MARK_DONE: "mark this done",
  SEND_BACK: "send this back",
  CANCEL: "cancel this",
  REOPEN: "reopen this",
  EDIT: "edit this",
};

export const VIEW_WORDS: Readonly<Record<WorkView, Words>> = {
  open: w("Open"),
  mine: w("Mine"),
  late: w("Late"),
  unassigned: w("Unassigned"),
  ncr: w("Non-conformances"),
  done: w("Done"),
};

/// A view filtered to nothing (0008 §5.8): the view's own title, three words at most.
export const VIEW_EMPTY_WORDS: Readonly<Record<WorkView, Words>> = {
  open: w("Nothing open"),
  mine: w("Nothing on you"),
  late: w("Nothing late"),
  unassigned: w("Nothing unassigned"),
  ncr: w("No non-conformances"),
  done: w("Nothing done"),
};

/// The Late view with no organisation time zone (WS-19): late is not judged, and this says why.
export const LATE_NOT_JUDGED_WORDS = w("Needs the organisation's time zone.");
export const NO_WORK_WORDS = w("No work yet");
export const READ_ONLY_WORDS = w("Closed. Read only.");

/// The columns of an item, as Activity and a fault name them. A column not here is never shown (activity.ts drops it).
export const FIELD_WORDS: Readonly<Record<string, Words>> = {
  title: w("Title"),
  description: w("Description"),
  status: w("Status"),
  priority: w("Priority"),
  dueOn: w("Due"),
  location: w("Location"),
  assigneePersonId: w("Assignee"),
  answer: w("Answer"),
  impact: w("Impact"),
  inspectionResult: w("Result"),
  severity: w("Severity"),
  happenedAt: w("Happened"),
  fromDocumentId: w("From"),
  cancelReason: w("Reason"),
  comment: w("Comment"),
};

/// The words of a stored enum value in a column, for Activity; null when the column holds no enum.
export function enumValueWords(field: string, value: string): string | null {
  const maps: Readonly<Record<string, Readonly<Record<string, Words>>>> = { status: STATUS_WORDS, priority: PRIORITY_WORDS, impact: IMPACT_WORDS, inspectionResult: RESULT_WORDS, severity: SEVERITY_WORDS, type: TYPE_WORDS };
  const map = maps[field];
  if (!map) return null;
  return Object.hasOwn(map, value) ? map[value].en : null;
}

/// "RFI 12": a reference as the screen shows it.
export const itemRefText = (type: WorkItemType, n: number): string => `${TYPE_SHORT[type]} ${n}`;

/// "2 days late", or null when there is nothing to say (due, no due date, or not judged: WS-19).
export function latenessWords(l: Lateness): string | null {
  return l.state === "LATE" ? `${l.days} ${l.days === 1 ? "day" : "days"} late` : null;
}

/// The people a who-can sentence names, resolved by the caller (`assignee` the raiser's own name when they hold the item). `lead` is W-4's office: its configured label ("S.O.") and the names of those in it today.
export interface WhoNames {
  raiser: string;
  assignee: string | null;
  lead: { roleLabel: string; names: readonly string[] } | null;
}

/// Who may take an action under the move table (plan §3.3) and W-3's edit rule.
export function whoCanWords(action: WorkAction | "EDIT", who: WhoNames): Words {
  // An appositive ("Hafiz, who raised it") closes with a comma before "can".
  const raiser = { text: `${who.raiser}, who raised it`, appositive: true };
  const lead = who.lead && who.lead.names.length > 0 ? { text: `the ${who.lead.roleLabel} (${who.lead.names.join(", ")})`, appositive: false } : null;
  // The raiser who holds their own item is named once, as the raiser.
  const assignee = who.assignee && who.assignee !== who.raiser ? { text: `${who.assignee}, the assignee`, appositive: true } : null;
  const people = action === "SEND_FOR_REVIEW" ? [assignee] : action === "START" || action === "EDIT" ? [assignee, raiser, lead] : [raiser, lead];
  const named = people.filter((p) => p !== null);
  const verb = ACTION_VERB[action];
  if (named.length === 0) return w(`Nobody can ${verb} now.`);
  const last = named[named.length - 1];
  const tail = last.appositive ? `${last.text},` : last.text;
  if (named.length === 1) return w(`Only ${tail} can ${verb}.`);
  return w(`${named.slice(0, -1).map((p) => `${p.text},`).join(" ")} or ${tail} can ${verb}.`);
}

const tooLongText = (field: string, max: number): string => `${FIELD_WORDS[field]?.en ?? "This"} is over ${max.toLocaleString("en")} characters.`;

/// A refused move in one sentence. `action` is the move's (move.ts `actionOf`); the who-can faults name the people of that action.
export function moveFaultText(f: MoveFault, action: WorkAction | null, who: WhoNames): string {
  switch (f.code) {
    case "CONTRACT_READ_ONLY":
      return READ_ONLY_WORDS.en;
    case "NOT_A_MOVE":
      return `This can't go from ${STATUS_WORDS[f.from].en} to ${STATUS_WORDS[f.to].en}.`;
    case "MOVED_ALREADY":
      return `${f.by ?? "Someone"} changed this a moment ago.`;
    case "ONLY_ASSIGNEE":
    case "ONLY_RAISER_OR_LEAD":
    case "ONLY_ASSIGNEE_RAISER_OR_LEAD":
      return whoCanWords(action ?? "EDIT", who).en;
    case "TOO_LONG":
      return tooLongText(f.field, f.max);
    case "ANSWER_NEEDED":
      return "Write the answer first.";
    case "RESULT_NOT_PASSED":
      return "Set the result to Passed first.";
    case "REASON_NEEDED":
      return "Give a reason.";
    case "COMMENT_NEEDED":
      return "Say what to change.";
  }
}

/// A refused field, or a refused new item, in one sentence.
export function fieldFaultText(f: FieldFault): string {
  switch (f.code) {
    case "TITLE_NEEDED":
      return "Give it a title.";
    case "TOO_LONG":
      return tooLongText(f.field, f.max);
    case "DUE_NEEDED":
      return "Pick a due date.";
    case "SEVERITY_NEEDED":
      return "Pick a severity.";
    case "HAPPENED_AT_NEEDED":
      return "Say when it happened.";
    case "NEEDS_TIME_ZONE":
      return "Set the organisation's time zone first.";
    case "COMMENT_EMPTY":
      return "Write a comment first.";
    case "HAPPENED_IN_FUTURE":
      return "That time hasn't come yet.";
    case "NOT_THIS_TYPE":
      return `This type has no ${(FIELD_WORDS[f.field]?.en ?? "such field").toLowerCase()}.`;
    case "NOT_EDITABLE":
      return f.whoCan.en;
    case "CLOSED_ITEM":
      return "Reopen it first.";
    case "ASSIGNEE_NOT_ELIGIBLE":
      return "Pick someone active who can see this contract.";
    case "DEFECT_AFTER_COMPLETION":
      return "List defects in Close-out › Defects.";
    case "OTHER_CONTRACT":
      return "That is on another contract.";
  }
}

/// A staff notice's title, by kind (WS-17). The same words as the inbox kind labels step 1 adds to `kinds.ts`.
export const NOTICE_TITLE_WORDS: Readonly<Record<WorkNoticeKind, Words>> = {
  WORK_ITEM_ASSIGNED: w("Assigned to you"),
  WORK_ITEM_TO_CHECK: w("Waiting for you to check"),
  WORK_ITEM_RETURNED: w("Sent back to you"),
  WORK_ITEM_COMMENT: w("New comment"),
};
