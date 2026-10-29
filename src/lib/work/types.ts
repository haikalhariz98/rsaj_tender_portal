/**
 * Work items' contract (stage 3a plan §3.2; ADR 0048). Pure types only.
 *
 * The string unions mirror the Prisma enums step 1 adds (`WorkItemType`, `WorkItemStatus`, `WorkItemPriority`, `WorkItemImpact`, `InspectionResult`,
 * `IncidentSeverity`). Step 1's schema must match these values exactly; nothing here imports the generated client, so the pure rules exist before the schema.
 */

import type { Words } from "@/lib/contract/labels";

export type Day = string; // YYYY-MM-DD, the organisation's calendar day
export const WORK_ITEM_TYPES = ["RFI", "SITE_INSTRUCTION", "INSPECTION", "SAFETY_INCIDENT", "ACTION", "DEFECT", "TASK"] as const;
export type WorkItemType = (typeof WORK_ITEM_TYPES)[number];
export type WorkStatus = "TO_DO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE" | "CANCELLED";
export type WorkPriority = "LOW" | "NORMAL" | "HIGH" | "URGENT";
export type WorkImpact = "NONE" | "COST" | "TIME" | "COST_AND_TIME";
export type InspectionResult = "NOT_YET" | "PASSED" | "FAILED";
export type IncidentSeverity = "NEAR_MISS" | "FIRST_AID" | "MEDICAL_TREATMENT" | "LOST_TIME" | "DANGEROUS_OCCURRENCE";

/** What the move and field rules judge: read from the locked row. */
export interface WorkItemFacts {
  id: string;
  type: WorkItemType;
  number: number;
  status: WorkStatus;
  raisedBy: string; // Person id
  assignee: string | null; // Person id
  dueOn: Day | null;
  answer: string; // RFI only; "" elsewhere
  inspectionResult: InspectionResult | null;
}

/** Who is acting, as the rules need it. `leadIds` is W-4's set (3b: the team's). */
export interface WorkActor {
  personId: string;
  leadIds: readonly string[];
  mayReadContract: boolean;
}

export type WorkAction = "START" | "SEND_FOR_REVIEW" | "MARK_DONE" | "SEND_BACK" | "CANCEL" | "REOPEN";

export type MoveFault =
  | { code: "CONTRACT_READ_ONLY" } // WORK_ITEM refuses the contract's status
  | { code: "NOT_A_MOVE"; from: WorkStatus; to: WorkStatus }
  | { code: "MOVED_ALREADY"; by: string | null; at: string } // the row is no longer at the status the reader saw
  | { code: "ONLY_ASSIGNEE" }
  | { code: "ONLY_RAISER_OR_LEAD" }
  | { code: "ANSWER_NEEDED" } // RFI to In review or Done with no answer
  | { code: "RESULT_NOT_PASSED" } // Inspection to In review or Done unless Passed
  | { code: "REASON_NEEDED" } // Cancel
  | { code: "COMMENT_NEEDED" }; // Send back

export type FieldFault =
  | { code: "TITLE_NEEDED" }
  | { code: "TOO_LONG"; field: string; max: number }
  | { code: "DUE_NEEDED" } // RFI, SI
  | { code: "SEVERITY_NEEDED" }
  | { code: "HAPPENED_AT_NEEDED" }
  | { code: "HAPPENED_IN_FUTURE" }
  | { code: "NOT_THIS_TYPE"; field: string }
  | { code: "NOT_EDITABLE"; whoCan: Words } // W-3
  | { code: "CLOSED_ITEM" } // Done or Cancelled: reopen first
  | { code: "ASSIGNEE_INACTIVE" }
  | { code: "DEFECT_AFTER_COMPLETION" } // OQ-4 default
  | { code: "OTHER_CONTRACT" }; // a link or "From" document on another contract

export type Lateness = { state: "LATE"; days: number } | { state: "DUE" } | { state: "NO_DUE" } | { state: "NOT_JUDGED" };

export interface PrimaryActions {
  primary: WorkAction | null;
  menu: WorkAction[];
  disabled: { action: WorkAction; whoCan: Words } | null;
}

export type WorkView = "open" | "mine" | "late" | "unassigned" | "ncr" | "done";
export type BoardColumn = "TO_DO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

export type WorkNoticeKind = "WORK_ITEM_ASSIGNED" | "WORK_ITEM_TO_CHECK" | "WORK_ITEM_RETURNED" | "WORK_ITEM_COMMENT";
export interface WorkNoticeEvent {
  kind: WorkNoticeKind;
  actorId: string;
  raisedBy: string;
  assignee: string | null;
  occurrence: string; // the audit row's or the comment's id
  activeIds: ReadonlySet<string>;
}
