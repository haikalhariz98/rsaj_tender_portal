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

/** Who raised an item, who holds it, who acts (3b, ADR 0049 D2). The contractor is the company (WS-9): never an account on these. Step 2 moves
 *  `WorkItemFacts.raisedBy` and `assignee` onto it. */
export type Party = { kind: "PERSON"; id: string } | { kind: "CONTRACTOR" };

/** A comment's audience, chosen when it is written and stored (ADR 0048 D4; 3b B-2). */
export type Audience = "REPLY" | "INTERNAL";

/** The Project team's four roles (3b B-12). Mirrors the Prisma enum `ProjectTeamRole`. */
export const TEAM_ROLES = ["PROJECT_MANAGER", "SITE_ENGINEER", "CONTRACT_ADMINISTRATOR", "CONSULTANT"] as const;
export type TeamRole = (typeof TEAM_ROLES)[number];
export interface TeamMember {
  role: TeamRole;
  personId: string;
}

/** The portal's Work list (3b section 4): its three groups and each row's one button. */
export type PortalGroup = "WAITING_FOR_YOU" | "WITH_ORG" | "CLOSED";
export type PortalAction = "REPLY" | "SEND_FOR_CHECKING" | "MARK_AS_FIXED" | "ACCEPT_ANSWER" | "ASK_AGAIN" | "OPEN";
/** My work's groups (3b-ii). */
export type MyWorkGroup = "TO_CHECK" | "LATE" | "TODAY" | "THIS_WEEK" | "LATER" | "NO_DATE";
/** The formal acts shown as linked cards (3b-ii). */
export type LinkedKind = "VARIATION" | "EOT_CLAIM" | "CERTIFICATE";

/** What the move and field rules judge: read from the locked row. 3b step 2 adds the plan's section 3.2 fields and fault codes, the "contractor" view and
 *  the new notice kind: each forces words in labels.ts, so they land with the rules that use them. */
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
  | { code: "ONLY_ASSIGNEE_RAISER_OR_LEAD" } // START: the assignee may begin it too
  | { code: "ANSWER_NEEDED" } // RFI to In review or Done with no answer
  | { code: "RESULT_NOT_PASSED" } // Inspection to In review or Done unless Passed
  | { code: "REASON_NEEDED" } // Cancel
  | { code: "COMMENT_NEEDED" } // Send back
  | { code: "TOO_LONG"; field: "cancelReason" | "comment"; max: number }; // Cancel's reason, Send back's comment

export type FieldFault =
  | { code: "TITLE_NEEDED" }
  | { code: "TOO_LONG"; field: string; max: number }
  | { code: "DUE_NEEDED" } // RFI, SI
  | { code: "SEVERITY_NEEDED" }
  | { code: "HAPPENED_AT_NEEDED" }
  | { code: "NEEDS_TIME_ZONE" } // a safety incident's time is a wall clock in the organisation's zone, and none is set
  | { code: "HAPPENED_IN_FUTURE" }
  | { code: "NOT_THIS_TYPE"; field: string }
  | { code: "NOT_EDITABLE"; whoCan: Words } // W-3
  | { code: "CLOSED_ITEM" } // Done or Cancelled: reopen first
  | { code: "ASSIGNEE_NOT_ELIGIBLE" } // not in `activeIds`: inactive, another organisation's, or unable to read the case
  | { code: "COMMENT_EMPTY" }
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

// Step 2 adds "WORK_ITEM_FROM_CONTRACTOR" here (already a StaffNotice kind, src/lib/inbox/kinds.ts), with its words in labels.ts.
export type WorkNoticeKind = "WORK_ITEM_ASSIGNED" | "WORK_ITEM_TO_CHECK" | "WORK_ITEM_RETURNED" | "WORK_ITEM_COMMENT";
export interface WorkNoticeEvent {
  kind: WorkNoticeKind;
  actorId: string;
  raisedBy: string;
  assignee: string | null;
  /// The audit row's id (`writeAudit` returns it) or the comment's id.
  occurrence: string;
  /// Active people of the item's organisation who may READ the case (a notice must not link someone to a case they cannot open). The caller builds it.
  activeIds: ReadonlySet<string>;
}
