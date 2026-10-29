# Phase 3, stage 3a — Work items: the engine, the List and the Board (staff only): build plan

**Status:** Proposed, 2026-10-29. Written by the solution architect against `7995094a` on `build-all-modules`, with the close-out
stage D screens still uncommitted in the tree. The product owner rules on the open questions in §8 before step 1. A question left
unanswered takes its stated default, and that default is logged.

**Inputs:**
- Design note 0008, as amended on 2026-10-29 (`docs/notes/design/0008-project-workspace.md`; §0 lists every ruling).
- The product owner's rulings WS-1 to WS-24 (`docs/notes/plans/rulings/workspace-po-rulings.md`, binding).
- The roadmap, phase 3 (`plans/roadmap-2026-10-27.md`).
- ADR 0042 and its plan (`plans/project-workspace-simple-plan.md`), which 3a builds beside and does not replace.
- `closeout-plan.md` §7, the defect seam.

**Records:**
- ADR 0048 (`docs/notes/architecture/0048-work-items.md`) records the decisions that are hard to reverse: one table, fixed types
  and statuses, numbers under the contract lock, a comment's audience stored at write, no watchers, the `WORK_ITEM` act-status row.
- Bound by ADR 0011 (store), ADR 0034 (actors, act slots, audit), ADR 0037 (case reading), ADR 0042 (documents) and ADR 0047
  (defect lines).

**Founder direction applied:**
- Simple and SaaS-grade, "like jira, clickup, procore… easy to use".
- No sprints, no story points, no custom workflows.
- English only, desktop only, minimal words (note 0005).
- Dropdowns wherever the values are known.
- Every screen has one primary action.

**What 3a is, in one line.** On an executed contract, staff raise, number, assign, move, comment on, attach to and link seven
fixed kinds of work item. The items are seen as a List or a Board on one address-held filter, and each opens in a side panel.
Staff are told in the inbox. Nothing reaches the contractor in 3a.

## 0. What exists, and what 3a uses (grep at `7995094a`)

| Need | Where | 3a's use |
|---|---|---|
| Contract lock | `withLockedContract`, `src/lib/contract/repo.ts:74`; lock-order scan `src/lib/contract/lock-order.test.ts` (`CONTRACT_ACT_FILES`) | Every item act. The numbering rule depends on it (WS-1). |
| Act × status | `ACT_STATUS`, `src/lib/contract/act-status.ts` (`executed(...)` at `:98`; `PROJECT_WORKSPACE: executed(PC, MGC, FCI, T)` at `:120`); pin fixture and scans | A new row, `WORK_ITEM` (§2 W-2). |
| A staff act's pattern | `src/lib/project-docs/store.ts` (cores inside the caller's lock; `writeAudit`, `diffFields`, `act.write`, `writeNotices`; refusal throws and rolls back); actions `src/app/projects/[id]/document-actions.ts` | Copied, not shared: `src/lib/work/store.ts`, `src/app/projects/[id]/work-actions.ts`. |
| S.O. in force on a day | `soOfficeOn`, `src/lib/supervision/load.ts:76` (holders and acting holders) | The 3a lead (§2 W-4). |
| Organisation's today | `organisationToday`, `organisationTimeZone`, `src/lib/org-time.ts`; `Organisation.timeZone` is nullable | Lateness. Not judged when null (WS-19). |
| Staff notices | `StaffNotice` (unique on recipient, kind, subject, occurrence); `STAFF_NOTICE_KINDS`, `src/lib/inbox/kinds.ts`; `writeNotices`, `src/lib/inbox/store.ts:22`; drafts in `src/lib/inbox/notices.ts` | Four new kinds (§3.2). |
| Date-based notices | **No background runner exists.** `dlpSweep` (`src/lib/closeout/view.ts:100`) is called when `/inbox` is read (`src/app/inbox/page.tsx:42`); the award clocks are raised when the case is read (`raiseCaseClockNotices`) | WS-17's condition: OQ-5. |
| Audit | `writeAudit`, `loadAudit`, `src/lib/audit/record.ts`; `AuditEntry`; labels `src/lib/audit/entity-labels.ts`; the case History reads entries whose `entityLabel` starts `Contract {number} ·` (`contractHistory`, `src/lib/contract/load.ts:358`) | The item's Activity. Whether items show in History is OQ-6. |
| Case tabs | `CASE_TABS`, `HISTORY_TAB`, `caseTabToStep`, `src/lib/contract/case-tabs.ts` (**uncommitted edits in the tree**); dispatch in `src/app/projects/[id]/page.tsx` (`:312-314` builds the strip) | `work` becomes case-level, like History. |
| Lists | `DataList` server mode, `src/components/data-list.tsx` (`ServerMode` `:44`; `toolbarLead` / `toolbarFilters` slots; search box `:625-640`); `ListFacets`, `src/components/list-facets.tsx`; `listHref`, `src/lib/list-query.ts`; cell kinds `src/lib/ui/list-cells.ts` | The List view. A new `select` cell kind (§5 step 4). |
| Drawer | `src/components/ui/drawer.tsx` (scrim and modal panel only) | A non-modal side-panel variant. |
| Store and attachments | `DocumentAttachment` owners, `STAGED_FOR_*` (`src/lib/documents/staged-for.ts`), the staging route `src/app/api/documents/route.ts`, the owner plumbing listed in `project-workspace-simple-plan.md` §2.3, `DocumentStorePolicy.projectDocumentClassId` | One new owner, `workItemId`, and one new purpose, `WORK_ITEM_FILE`. |
| Project documents | `ProjectDocument` (ADR 0042) | An item may link one. An Action's "From" is one. |
| Defect lines | `DefectItem`, `DefectEvent`, and the acts in `src/app/projects/[id]/closeout-actions.ts` (`reportDefect`, `acceptDefect`, `returnDefect`, `reportDefectRectified`, `addCpcDefect`) | **Not wired in 3a** (OQ-4). |
| Demo | `npm run demo:load` (`prisma/demo.ts load`), with modules `prisma/demo-*.ts` | `prisma/demo-work.ts` (new). |

## 1. Scope

| In 3a | Not in 3a (where it goes) |
|---|---|
| `WorkItem` with the seven types, the five statuses, priority, due day, location, and the type's own fields (§3.1) | Sharing, the "{contractor}" assignee, Reply / Internal note, the portal list: **3b** (WS-14, WS-15) |
| Numbers per contract and type, under the contract lock (WS-1) | My work (`/my-work`): **3b** |
| The move rules, one pure function, with a table test (WS-24) | The Project team card, the four roles and default assignees: **3b** (WS-3) |
| Comments (every one internal), attachments through the store, links item↔item and item→project document | Linked cards for variations, EOT claims and certificates: **3b** |
| The Work tab, case-level, in the Project and Close-out strips | The defect link and the Defects folds: **3b** (WS-5, rulings' open line; OQ-4) |
| **List** (server mode, quick-add row, inline selects) and **Board** (drag, status-menu button, arrow keys) on one toolbar and address (WS-15, WS-12) | Due tomorrow / Late notices: **only if OQ-5 is answered yes** (step 7) |
| The side panel: non-modal, address-held, one primary action from a pure function, disabled actions that name who can (WS-13) | RFI and SI response days, prefilled due dates: not built (§7) |
| Activity: comments and audit rows, All / Comments, no grouping (WS-18) | Bulk actions, per-column quick add, a remembered view, the Contract acts toggle (WS-16); single-letter keys (WS-12) |
| Four staff notice kinds (WS-17) | "Raise item" from a diary entry, an observation or a meeting record (§7, OQ-9) |
| Demo data on two contracts (WS-22) | The Overview stat row: **4b** |

## 2. Decisions (W-1 to W-12)

**W-1. One `WorkItem` table** (ADR 0048 D1).
- A type's own fields are columns, null outside their type by CHECK.
- No per-type tables, no stored overdue, no watcher table (WS-17, WS-24).

**W-2. `WORK_ITEM: executed(PC, MGC, FCI)`** (ADR 0048 D8).
- Every item act asks this row first. Reading is never refused.
- It is narrower than `PROJECT_WORKSPACE` on purpose: a terminated or closed contract's Work is read-only (0008 §5.8). On such a
  contract the tab shows a neutral Callout, "Closed. Read only.", with no New item and no drag.

**W-3. Who may do what (default, pending OQ-1).**

| Act | Who |
|---|---|
| Read the Work tab, raise an item, comment, attach | Any active staff member who may read the case's contract stages (`caseVisibility` ≠ HIDDEN) |
| Edit an item's fields, link, unlink | The raiser, the assignee or the lead |
| Move an item | As the move table (§3.3) says |

- Fields of a Done or Cancelled item are read-only until it is reopened.
- A field the reader may not edit is drawn as text, with a popover naming who can (0008 §5.4).

**W-4. The lead in 3a** (0008 §4.9's fallback; the team card is 3b).
- The lead is any holder or acting holder of the contract's S.O. office on the organisation's today (`soOfficeOn`).
- With no time zone, or no S.O. assignment in force, there is no lead, and only the raiser closes.
- 3b replaces this with "the Project manager, else the S.O.", through the same `leadIds` input to the pure rules.

**W-5. Numbers** (WS-1, ADR 0048 D3).
- The act reads `max(number)` for (contract, type) under the contract lock and writes max + 1. `@@unique([contractId, type,
  number])` is the backstop.
- Numbers are never reused, and a cancelled item keeps its own.
- **The type is fixed at creation** (default, pending OQ-3). The type select is shown only on New item.
- The address form is `item=RFI-12`, and `parseItemRef` maps the short word back to the type. The screen shows "RFI 12". The short
  words come from `src/lib/work/labels.ts`, never from the enum key.

**W-6. Assignee** (WS-14, WS-9).
- The picker is the organisation's active `Person`s, searchable, with "Me" first. It is a dropdown, never typed.
- Unassigned is a valid state.
- `assigneeSupplierAccountId` exists (WS-9) and nothing writes it. A source scan holds that.
- There is no company assignee and no `sharedAt` column in 3a: 3b adds both (ADR 0048 D5).

**W-7. Comments are stored with their audience** (ADR 0048 D4).
- `WorkItemComment.internal` is true on every 3a comment. The writer always passes true, and a source scan holds that.
- The table is append-only, enforced by trigger. Comments are not edited or deleted in 3a.

**W-8. Files.**
- A file is staged through the existing staging route, marked `STAGED_FOR_WORK_ITEM`, outside any lock.
- The act pins it under contract → `WorkItem` → the store's documents, in id order.
- Files take the class `DocumentStorePolicy.projectDocumentClassId` (default, pending OQ-7). While it is unset, attaching is
  refused and the panel names the setting; items can still be raised.
- A comment's files are item files, listed under Files. There is no comment↔file link.

**W-9. Lateness is read** (WS-19, WS-24).
- `lateness(dueOn, status, today | null)` returns LATE with a count of days, DUE, NO_DUE or NOT_JUDGED.
- With no time zone it is NOT_JUDGED: the Late view says "Needs the organisation's time zone.", and no row reads "late".

**W-10. Notices** (WS-17).
- There are four kinds (§3.2). Each goes to the raiser and the assignee, never to the actor and never to an inactive person.
- A comment gives one notice to each of the others, keyed by the comment's id as the occurrence.
- Bodies hold the item's reference, its title and the contract's label only. They never hold a contact's name (WS-9).
- `href` is the case address with `tab=work&item=RFI-12`.

**W-11. Activity reads the audit trail** (WS-18, ADR 0048 D7).
- The audit rows of an item's acts (fields, moves, links, files) are found by one query.
  - Prefer `entity = "WorkItem"` with `entityId` = the item's id.
  - If `trail-scan.test.ts` requires `entity` to name the table written, key on an `entityLabel` prefix `Work item {ref} ·`, the
    way `contractHistory` keys on `Contract {number} ·`.
- Either way, the label does not start `Contract {number} ·`, so items stay out of the case History tab (default, OQ-6).

**W-12. One toolbar and one address for List and Board** (0008 §5.1).
- The parameters are `tab=work`, `view` (`open` (default), `mine`, `late`, `unassigned`, `ncr`, `done`), `type`, `assignee`,
  `priority`, `q`, `mode` (`list` default, `board`; nothing is remembered, WS-16), `page`, `sort` and `item`.
- The List is `DataList` in server mode. The views are address links in `toolbarLead`, the filters are `ListFacets` in
  `toolbarFilters`, and the List|Board switch is two links.
- The Board draws the same lead, filters and switch above its columns, and **the same search box**. Step 4 exports it from
  `data-list.tsx` as `ListSearch`, so no second search box is written.
- This is smaller than the full `ListToolbar` extraction in 0008 §8, and it changes no existing list's markup. The
  text-snapshot in step 4 proves that.

## 3. Contracts (written in step 1, before any act or screen)

### 3.1 Schema (additive; `organisationId` on every model; FKs Restrict; DATE-only days; CHECKs and triggers by hand)

**Gate.** `prisma/schema.prisma` holds uncommitted stage D work at the time of writing. Step 1 starts only once `git status`
shows `prisma/` and `src/lib/contract/case-tabs.ts` clean. Each migration folder is named to sort after the newest folder on disk
**at build time** (today `20261210000500_security_release_certificate`). No timestamp is fixed here. The founder's database only
ever receives new migrations.

**Migration 1, `enum_purpose_work_item_file`:** `ALTER TYPE "AttachmentPurpose" ADD VALUE 'WORK_ITEM_FILE';` on its own
(BD-613-112).

**Migration 2, `work_items`:**

| Enum | Values |
|---|---|
| `WorkItemType` | RFI, SITE_INSTRUCTION, INSPECTION, SAFETY_INCIDENT, ACTION, DEFECT, TASK |
| `WorkItemStatus` | TO_DO, IN_PROGRESS, IN_REVIEW, DONE, CANCELLED |
| `WorkItemPriority` | LOW, NORMAL, HIGH, URGENT |
| `WorkItemImpact` | NONE, COST, TIME, COST_AND_TIME |
| `InspectionResult` | NOT_YET, PASSED, FAILED |
| `IncidentSeverity` | NEAR_MISS, FIRST_AID, MEDICAL_TREATMENT, LOST_TIME, DANGEROUS_OCCURRENCE |

| Model | Fields | Guards |
|---|---|---|
| `WorkItem` | `organisationId`, `contractId` (FK Contract), `type`, `number Int`, `title`, `description @default("")`, `status @default(TO_DO)`, `priority @default(NORMAL)`, `dueOn DateTime? @db.Date`, `location @default("")`, `raisedByPersonId?` (FK Person; nullable so 3b can add a supplier-account raiser without reshaping, CHECK NOT NULL in 3a, which 3b replaces with "exactly one raiser"), `assigneePersonId?` (FK Person), `assigneeSupplierAccountId?` (FK SupplierAccount; WS-9; no writer), `answer @default("")`, `impact WorkItemImpact?`, `inspectionResult InspectionResult?`, `severity IncidentSeverity?`, `happenedAt DateTime?`, `fromDocumentId?` (FK ProjectDocument), `cancelReason @default("")`, `recordedAt`, `updatedAt` | `@@unique([contractId, type, number])`; `@@index([contractId, status])`; `@@index([assigneePersonId, status])`. CHECKs: `number > 0`; `title <> ''`; at most one of the two assignee columns; `impact` only on RFI or SITE_INSTRUCTION; `answer = ''` unless RFI; `inspectionResult` set if and only if INSPECTION; `severity` and `happenedAt` set if and only if SAFETY_INCIDENT; `fromDocumentId` only on ACTION; `dueOn` NOT NULL on RFI and SITE_INSTRUCTION; CANCELLED needs `cancelReason <> ''`. |
| `WorkItemComment` | `organisationId`, `workItemId` (FK), `body`, `internal Boolean @default(true)`, `personId?` (FK Person), `recordedAt` | CHECK `body <> ''`; CHECK `personId IS NOT NULL` (3b replaces it with "exactly one of person or account"). Append-only by trigger, like `ProjectDocumentDecision`. |
| `WorkItemLink` | `organisationId`, `workItemId` (FK), `toWorkItemId?` (FK WorkItem), `projectDocumentId?` (FK ProjectDocument), `personId` (FK Person), `recordedAt` | CHECK exactly one target; CHECK `toWorkItemId <> workItemId`; unique on (`workItemId`, `toWorkItemId`) and on (`workItemId`, `projectDocumentId`). The act checks that both ends are on one contract and refuses B→A where A→B exists (the panel reads links both ways, so one row is one link). A link is removed by delete, and the delete is audited. |
| `DocumentAttachment` | `+ workItemId?` (FK WorkItem) | The one-owner CHECK and the purpose CHECK are replaced whole (`WORK_ITEM_FILE` ⇔ `workItemId`). `owner-check.test.ts` lists the new owner. |
| `StaffNotice` kind CHECK | Rebuilt from the full `STAFF_NOTICE_KINDS` plus `WORK_ITEM_ASSIGNED`, `WORK_ITEM_TO_CHECK`, `WORK_ITEM_RETURNED`, `WORK_ITEM_COMMENT` | Changed together with `kinds.ts` and its source test. |

**Bounds** (technical constants, not policy; the `SUBMISSIONS_PER_WINDOW` precedent; each in `src/lib/work/bounds.ts` with its
reason):
- a title of at most 200 characters;
- a description, answer or comment of at most 10,000;
- a location of at most 120;
- at most 20 files per item in one act.

**Code that changes with the schema** (the schema-wide scans fail otherwise):
- `src/lib/inbox/kinds.ts`: the four kinds with labels: "Assigned to you", "Waiting for you to check", "Sent back to you" and
  "New comment". Also its header's migration list.
- `src/lib/contract/act-status.ts`: `"WORK_ITEM"` in `CONTRACT_ACTS` and `WORK_ITEM: executed(PC, MGC, FCI)` in `ACT_STATUS`.
  Extend `act-status.test.ts`, `act-status-pin.test.ts` with its fixture, `act-status-scan.test.ts` and
  `act-status-screens.test.ts`, without loosening them.
- `src/lib/auth/act-slots.ts`:
  - slots for `WorkItem.raisedBy`, `WorkItemComment.person`, `WorkItemLink.person`;
  - `NOT_AN_ACT` for `WorkItem.assignee` ("who the item is on, not who acted") and for `WorkItem.assigneeSupplierAccount`;
  - `act-wiring-scan.test.ts` `NOT_BUILT` entries, removed by step 3.
- `src/lib/auth/db-role.ts`: `WorkItemComment` in `APPEND_ONLY_TABLES`, then `npm run db:roles`.
- `src/lib/suppliers/data-export-fields.ts`: `WorkItem` names a supplier account (WS-9's column), so it goes in `OUT_MODELS` as
  `"NOT_YET_EXPORTED"`. 3b moves it once the column is written.
- The owner plumbing for `workItem`:
  - `attach.ts` (`OwnerFacts`, `purposeFits`, `ownerState`);
  - `owners.ts` (`withLockedOwner` refuses it: only the work acts attach);
  - `owner-facts.ts`;
  - `targets.ts` (not a generic Attach target);
  - `entitlement.ts` (`subjectOfOwner` gives the item's contract);
  - `demo-wipe-plan.ts`;
  - `documents/labels.ts` ("Work item file");
  - `staged-for.ts` (`STAGED_FOR_WORK_ITEM`).
- `src/lib/audit/entity-labels.ts`: "Work item", "Work item comment", "Work item link".

### 3.2 Types: `src/lib/work/types.ts`

```ts
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
  raisedBy: string;            // Person id
  assignee: string | null;     // Person id
  dueOn: Day | null;
  answer: string;              // RFI only; "" elsewhere
  inspectionResult: InspectionResult | null;
}

/** Who is acting, as the rules need it. `leadIds` is W-4's set (3b: the team's). */
export interface WorkActor { personId: string; leadIds: readonly string[]; mayReadContract: boolean }

export type WorkAction = "START" | "SEND_FOR_REVIEW" | "MARK_DONE" | "SEND_BACK" | "CANCEL" | "REOPEN";

export type MoveFault =
  | { code: "CONTRACT_READ_ONLY" }                        // WORK_ITEM refuses the contract's status
  | { code: "NOT_A_MOVE"; from: WorkStatus; to: WorkStatus }
  | { code: "MOVED_ALREADY"; by: string | null; at: string } // the row is no longer at the status the reader saw
  | { code: "ONLY_ASSIGNEE" }
  | { code: "ONLY_RAISER_OR_LEAD" }
  | { code: "ANSWER_NEEDED" }                              // RFI to In review or Done with no answer
  | { code: "RESULT_NOT_PASSED" }                          // Inspection to In review or Done unless Passed
  | { code: "REASON_NEEDED" }                              // Cancel
  | { code: "COMMENT_NEEDED" };                            // Send back

export type FieldFault =
  | { code: "TITLE_NEEDED" } | { code: "TOO_LONG"; field: string; max: number }
  | { code: "DUE_NEEDED" }                                 // RFI, SI
  | { code: "SEVERITY_NEEDED" } | { code: "HAPPENED_AT_NEEDED" } | { code: "HAPPENED_IN_FUTURE" }
  | { code: "NOT_THIS_TYPE"; field: string }
  | { code: "NOT_EDITABLE"; whoCan: Words }               // W-3
  | { code: "CLOSED_ITEM" }                                // Done or Cancelled: reopen first
  | { code: "ASSIGNEE_INACTIVE" }
  | { code: "DEFECT_AFTER_COMPLETION" }                    // OQ-4 default
  | { code: "OTHER_CONTRACT" };                            // a link or "From" document on another contract

export type Lateness = { state: "LATE"; days: number } | { state: "DUE" } | { state: "NO_DUE" } | { state: "NOT_JUDGED" };

export interface PrimaryActions { primary: WorkAction | null; menu: WorkAction[]; disabled: { action: WorkAction; whoCan: Words } | null }

export type WorkView = "open" | "mine" | "late" | "unassigned" | "ncr" | "done";
export type BoardColumn = "TO_DO" | "IN_PROGRESS" | "IN_REVIEW" | "DONE";

export type WorkNoticeKind = "WORK_ITEM_ASSIGNED" | "WORK_ITEM_TO_CHECK" | "WORK_ITEM_RETURNED" | "WORK_ITEM_COMMENT";
export interface WorkNoticeEvent {
  kind: WorkNoticeKind; actorId: string; raisedBy: string; assignee: string | null;
  occurrence: string;          // the audit row's or the comment's id
  activeIds: ReadonlySet<string>;
}
```

### 3.3 The move table (pure: `moveFaults(item, actor, to, expectedFrom)`; WS-24)

| From → To | Who | Also needs |
|---|---|---|
| To do → In progress | Assignee, raiser or lead | — |
| To do or In progress → In review | The assignee, where the assignee is not the raiser | RFI: an answer. Inspection: result Passed. |
| To do or In progress → Done (**the shortcut**) | Raiser or lead, where the item has no assignee or the assignee is the raiser | As for In review |
| In review → Done | Raiser or lead | As for In review |
| In review → In progress (**send back**) | Raiser or lead | A comment, written in the same act |
| To do, In progress or In review → Cancelled | Raiser or lead | A reason |
| Done or Cancelled → To do (**reopen**) | Raiser or lead | — |
| Anything else | Nobody | `NOT_A_MOVE` |

- `WORK_ITEM` is asked first, then `MOVED_ALREADY`: the act carries the status the reader saw.
- "Inspection: result Passed" also refuses Not yet. That is a reading of 0008 §4.2 ("a failed Inspection needs its result changed
  to Passed first"), extended to an inspection not yet held. It is listed as OQ-8.
- `primaryActions(item, reader)` gives 0008 §5.4's table from the same function. A disabled action's `whoCan` names the raiser
  and the lead ("Hafiz, who raised it, or the S.O. (Nurul) can mark this done.").

### 3.4 Pure rules (`src/lib/work/`; tests beside each; WS-24 table tests)

| File | Functions | Key tests |
|---|---|---|
| `labels.ts` | type label and short word, status, priority, impact, result and severity words, `itemRefText` ("RFI 12"), fault words naming who can | Every enum value has words; no key is ever returned (a source test). |
| `number.ts` | `nextNumber(max: number \| null)`, `itemRef(type, n)` ("RFI-12"), `parseItemRef(s)` | A table: null gives 1, 41 gives 42; every type round-trips; "rfi-12", "RFI-0", "RFI-x" and an unknown word give null. |
| `move.ts` | `moveFaults`, `primaryActions` | **A table of every from × to × actor (raiser, assignee, lead, other)**, plus the shortcut, the RFI answer, the inspection result, the cancel reason, the send-back comment, MOVED_ALREADY and CONTRACT_READ_ONLY. |
| `fields.ts` | `parseNewItem(form)`, `parseFieldEdit(field, value)`, `fieldFaults(item, actor, edit, facts)`. Hand validation: no schema library is installed. | Required fields per type; a type field on another type; the bounds; a closed item; an editor who is not raiser, assignee or lead; `happenedAt` in the future; a Defect on a contract past practical completion (OQ-4). |
| `late.ts` | `lateness(dueOn, status, today \| null)` | Due yesterday reads late 1; due today does not; Done and Cancelled never do; a null today reads NOT_JUDGED; **a pair at 23:59 and 00:00 in Asia/Kuala_Lumpur** through `organisationToday`'s day. |
| `views.ts` | `inView(item, view, reader, today)`, `workWhere(view, filters, reader, today)` (a Prisma where object), `compareItems` (late first, then due, then priority) | `inView` and `workWhere` agree on a fixture of 40 items for every view (the where object is run against a db in the store test). Late with a null today matches nothing. |
| `board.ts` | `boardColumns(items, today)` | Cancelled is never on the board; Done shows only the last 14 days; a column is capped at 50 with a "more" count; the order matches `compareItems`. |
| `notices.ts` | `workNoticeDrafts(event, item)` | Never to the actor or an inactive person; one notice per recipient per comment; assigning yourself tells nobody; the body holds the reference, title and contract only. |
| `activity.ts` | `activityFeed(comments, auditRows, filter)` | Ordered by time; Comments drops audit rows; no grouping (WS-18); a change line reads label, from and to, never a column key. |
| `lead.ts` | `leadIds(so, today)` | The S.O. holders and acting holders; empty with no time zone or no S.O. |

## 4. The screens (staff only)

- **The Work tab** (`?tab=work`, case-level).
  - It is inserted after Overview in the Project strip and before History in the Close-out strip.
  - `caseTabToStep("work")` is case-level like History. The stepper keeps the live stage.
  - There is no Work tab before a contract exists.
- **The header row:** the view chips (Open, Mine, Late, Unassigned, Non-conformances, Done); the filters Type, Assignee and
  Priority as dropdowns; search; List | Board; and the one primary action, **New item**.
- **List.**
  - Columns: Item ("RFI 12" + title), Type, Status (inline select), Assignee (inline select), Due (inline date; "2 days late" in
    the error tone), Priority (inline select).
  - The quick-add row on top: a type dropdown (the last pick is kept for the page's life only), a title, then Enter. The item is
    created and its panel opens.
  - There is no selection column (WS-16).
  - A type that needs more than a title (RFI and SI need a due date; a Safety incident needs a severity and when it happened)
    opens the New item drawer instead, with the title kept. A quick-added Inspection starts with the result Not yet.
- **Board.**
  - Four columns with counts. Each card shows the number, the title (two lines at most), the assignee's avatar, the due date (red
    when late), ▲ or ▲▲ for High or Urgent, and "NCR" on a failed inspection.
  - Drag calls the move act, optimistically, and reverts with the fault's words as a toast.
  - Each card has a focusable status-menu button that makes the same act. Arrow keys move across columns, Enter opens and Esc
    closes (WS-12).
  - Done shows the last 14 days, then "Older: in the list ›".
- **The side panel** (`&item=RFI-12`).
  - It is non-modal, `lg` width, and has no scrim.
  - The header: reference and title, the status select, "2 days late", and the one primary action. The rest is in `MoreActions`.
  - Facts: assignee, priority, due, raised by, location, and the type's own fields (Answer as a field for an RFI; Impact; Result;
    Severity and when; From).
  - Then links (items and project documents, picked from dropdowns), files, Activity (All | Comments), and the composer, with
    every comment internal and no audience toggle in 3a.
  - Cancel asks for a reason in `ConfirmDialog`. Send back asks for a comment.
  - Esc and ✕ close the panel and return focus to the row or card.
- **New item drawer** (the existing drawer): the type, then only the fields that type has. Every value set is a dropdown, except
  title, description, location and answer.
- **States:** every row of 0008 §5.8 that 3a can reach. Not reachable in 3a: the contractor rows, "Lead not named" (3b) and
  linked acts.
- **Words:** 0008 §13's budgets. No codes. The organisation is named by its configured name.

## 5. Build steps (one heavy builder; each step ends shippable)

**Rules for every step:**
- The builder reads `node_modules/next/dist/docs/` for any Next API it touches (pages: `params` is a Promise; server actions;
  route handlers).
- Each step ends with `npm run typecheck`, `npm run lint` and its own tests. The full `npm test` runs at step 6 with the dev
  server off (memory rule: two builders at most, never two heavy ones).
- A changed existing test is listed in its commit, each flagged as stricter or faithful, and none is weakened.
- **Lock order:** contract (`withLockedContract`), then the `WorkItem` row (`SELECT id FROM "WorkItem" WHERE id = $1 AND
  "contractId" = $2 AND "organisationId" = $3 FOR UPDATE`), then the store's documents in id order. Linking takes the second item
  only by reading it; it never locks it, so no two item rows are ever locked together.
- **Every act, in order:**
  1. `WORK_ITEM` act-status;
  2. the W-3 permission on the locked rows;
  3. the pure faults;
  4. the guarded write;
  5. `writeAudit` with before and after;
  6. `writeNotices`;
  7. `act.write` for the act slot.
  All of it is in one transaction.
- **Trust boundary:** every server action re-reads the staff actor, scopes every query by `organisationId` and the contract, and
  parses its form by hand (`fields.ts`). Nothing from the client is trusted, including the item's type or status.

### Step 1 — data-modeler: schema, contracts and the scans that move with them

- **Owns:**
  - `prisma/schema.prisma`;
  - the two migrations (§3.1), with CHECKs and the append-only trigger by hand;
  - `src/lib/work/types.ts` (§3.2) and `src/lib/work/bounds.ts`;
  - every file in §3.1 "Code that changes with the schema".
- **Done when:**
  - Both migrations apply to a scratch database, and `prisma migrate diff` is empty.
  - `npx prisma generate` and `npm run db:roles` have been run.
- **Tests:** new `src/lib/work/schema.db.test.ts`:
  - each CHECK refuses its bad row;
  - (contract, type, number) refuses a duplicate;
  - a comment UPDATE and DELETE are refused;
  - an attachment with two owners is refused;
  - every existing owner still inserts (the `owner-check.test.ts` list);
  - a StaffNotice of each new kind inserts, and an unknown kind is refused.

  The following pass, unweakened: `act-slots.test.ts`, `act-wiring-scan.test.ts`, `data-export.test.ts`, `owner-check.test.ts`,
  the act-status tests and the inbox kinds source test.

### Step 2 — domain-engineer: the pure rules

- **Owns:** `src/lib/work/{labels,number,move,fields,late,views,board,notices,activity,lead}.ts` and their tests (§3.4).
- **Done when:** every row of §3.4 has its test, including the full move table. Nothing in `src/lib/work/*.ts` other than
  `store.ts` and `load.ts` imports `db` (a source test).

### Step 3 — api-engineer: the store, the readers and the acts

- **Owns:**
  - `src/lib/work/store.ts`: the cores `createItem`, `editField`, `moveItem`, `comment`, `link`, `unlink` and `attachFiles`. Each
    runs inside the caller's locked contract; a refusal throws `WorkRefused`.
  - `src/lib/work/load.ts`: `loadWorkList` (server-mode page), `loadBoard` (per column, capped), `loadItem` (by `parseItemRef`),
    `loadActivity`, `assigneeOptions`, `linkOptions`.
  - `src/app/projects/[id]/work-actions.ts`: the server actions.
  - The staging mark in `src/app/api/documents/route.ts`.
  - `CONTRACT_ACT_FILES` in `lock-order.test.ts`.
  - The `NOT_BUILT` entries removed.
- **Done when:** each act writes its row, its audit row and its notices in one transaction, and a refusal leaves nothing.
- **Tests:** new `src/lib/work/work-flow.db.test.ts`:
  - two concurrent creates of the same type on one contract get 1 and 2, never the same number (and a different type starts
    at 1);
  - a move with a stale `expectedFrom` is refused MOVED_ALREADY, naming who moved it;
  - a terminated contract refuses every act and still reads;
  - `workWhere` matches `inView` on the fixture;
  - an attach without the class set is refused by name;
  - a link to an item on another contract is refused;
  - every audit row has before and after;
  - the notices go to exactly the §3.4 recipients.

  Source scans:
  - nothing writes `assigneeSupplierAccountId`;
  - every comment insert passes `internal: true`;
  - the acts call `moveFaults` and `fieldFaults` (the `lad/wiring.test.ts` pattern);
  - no body string of a notice is built from a supplier record.

### Step 4 — frontend-engineer: the shared pieces (extend, never one-off)

- **Owns:**
  - `src/lib/ui/list-cells.ts` and `src/components/data-list.tsx`:
    - a `select` cell kind (options, the server action and its fields, a disabled state with a "who can" popover; it reverts on
      refusal);
    - `ListSearch` exported from the server-mode search box.
  - `src/components/ui/drawer.tsx`: `sidePanelClass` (non-modal, no scrim, same widths, `DrawerHeader`).
  - `src/components/ui/board.tsx` (new): columns, cards as data, drag through HTML5 drag and drop with `useOptimistic`, the
    status-menu button, arrow-key focus, column caps. **No new dependency.**
  - `src/components/ui/activity.tsx` (new) and `src/components/ui/composer.tsx` (new; the Reply / Internal note toggle is not
    built until 3b).
  - Icons in `src/components/icons.tsx`: board, list, chain.
- **Done when:**
  - Run `scripts/text-snapshot.mjs` over `/projects`, `/requisitions`, `/sourcing`, `/suppliers`, `/committees` and a contract's
    Documents tab before and after. The diff shows no change.
  - `scripts/check-ui.mjs` passes.
- **Tests:** a cell test for `select` (renders options; disabled shows who can); a board test (Enter opens; the status menu offers
  only the moves `moveFaults` allows; arrows cross columns); `drawer-overscroll.test.ts` still passes.

### Step 5 — frontend-engineer: the Work tab

- **Owns:**
  - `src/lib/contract/case-tabs.ts` (`WORK_TAB`, strip insertion, `caseTabToStep`);
  - `src/lib/contract/case-page-words.ts` ("Work");
  - `src/app/projects/[id]/page.tsx` (dispatch only; readers run only when `tab=work`);
  - `src/app/projects/[id]/work-panel.tsx` (toolbar, List or Board);
  - `work-item-panel.tsx`;
  - `work-editors.tsx` (New item drawer, Cancel and Send back dialogs);
  - `docs/notes/prototype-differences.md` (Work: a new screen, no prototype, 0008 as the reason).
- **Done when:** a staff member can do all of the following by clicking and by keyboard alone:
  - raise each of the seven types, find it in the List and on the Board, and open it by click, Enter and a pasted address;
  - edit every field inline;
  - move it by select, drag and status menu, and see the same refusal words;
  - comment, attach and link;
  - see Activity with All / Comments.
- **Tests:**
  - `case-tabs.test.ts` extended (Work in both strips; `?tab=work` case-level; old addresses unchanged; flagged stricter);
  - a screen test per reachable §5.8 state, including WS-19's "Needs the organisation's time zone." and "Closed. Read only.";
  - `act-status-screens` covers the tab;
  - `text-snapshot` shows no code on screen.
- **Siblings:** compare the Work tab with Documents, Variations, Close-out › Defects and History for header, tab strip, spacing and
  list styling. The panel is compared with the project document drawer.

### Step 6 — data-modeler (demo), then test-engineer, then code-reviewer and security-auditor, then ui-guidelines-reviewer: close-out of the stage

- **Owns:**
  - `prisma/demo-work.ts` (new), registered in `prisma/demo.ts` load and wipe. Free `demo_` prefixes are claimed by grep first,
    and the wipe runs in the FK order Restrict imposes.
  - The demo goes through `src/lib/work/store.ts`, so audit rows and notices exist.
- **The demo** (WS-22): on two demo contracts that are executed but **not yet practically complete** (ACTIVE, say; under OQ-4's
  default a Defect item is refused at PC, MGC and FCI, so the close-out demo contract will not do), each holds every one of the
  seven types, and between them:
  - at least two late items (due before the load day), two unassigned and one cancelled with its reason;
  - one item In review, one Done, one answered RFI and one failed inspection (an NCR);
  - item and document links and a few comments.
  The demo organisation's time zone must be set, or nothing reads Late. Check it, and say so if a demo organisation lacks one.
- **Done when:**
  - `demo:wipe` then `demo:load` runs clean;
  - the full `npm test`, `npm run typecheck` and `npm run lint` pass with the dev server off;
  - the review findings are fixed, each in its own commit;
  - the sibling-screen check is recorded;
  - **the log lines** are in `docs/notes/decisions-log.md`: each OQ answer or default taken, and the stage's acceptance (WS-22).
- **Review focus:**
  - organisation scoping on every item query;
  - the lock order;
  - no comment written with `internal: false`;
  - attachments only through the class check;
  - no SULIT read added;
  - the act slots.

### Step 7 — api-engineer (conditional): Due tomorrow and Late notices

**Only if OQ-5 is answered yes.** Otherwise not built, and Late shows in lists only (WS-17).
- **Owns:**
  - `workDueSweep(organisationId, today)` in `src/lib/work/load.ts`, called beside `dlpSweep` in `src/app/inbox/page.tsx`;
  - two more kinds (`WORK_ITEM_DUE_TOMORROW`, `WORK_ITEM_LATE`) with their own CHECK migration and `kinds.ts` change.
- **Each notice is written once.** The occurrence is the due day, so a moved due date is a new occurrence and a reread is not.
- **With no time zone it writes nothing.**
- **Tests:** a db test (once each, never daily; nothing with no time zone; Done items never).

## 6. Checks the stage must pass before acceptance (WS-22)

- [ ] Demo data through `demo:load`: every type, plus late, unassigned and cancelled items, on two demo contracts.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] The sibling-screen check (step 5's list), with `text-snapshot` before and after step 4.
- [ ] The lines in `docs/notes/decisions-log.md`.

## 7. Deliberately not done in 3a

- **Everything WS-14 and WS-15 put in 3b:** sharing, the "{contractor}" assignee, Reply / Internal note, the portal list, My work,
  the Project team card and default assignees, linked cards, and the folds.
- **The defect link** (`defectItemId`, and moves through `acceptDefect` / `returnDefect`): 3b, after the act-name re-check. Until
  then, 3a avoids giving a defect two homes (OQ-4).
- **RFI and SI response days.** The setting is a column on the organisation plus a two-person settings editor. 3a ships the
  "unset" behaviour that 0008 §4.3 already defines: the due date is required and nothing is prefilled.
- **"Raise item" from a diary entry, an observation or a meeting record.** An Action's "From" is a project document (minutes are
  project documents, ADR 0042 D10). See OQ-9.
- **Changing an item's type** (OQ-3).
- **Editing or deleting a comment.**
- **Activity grouping, bulk actions, per-column quick add, a remembered view, single-letter keys** (WS-12, WS-16, WS-18).
- **The full `ListToolbar` extraction** (W-12 uses the existing slots plus `ListSearch`).
- **Email, and a background job runner.** Neither exists, and 3a adds neither.

## 8. Open questions for the product owner (each with the default 3a builds on if unanswered)

**Answered by the founder, 2026-10-29:** OQ-1 to OQ-6 take the defaults below. OQ-5 is "no runner", so step 7 is not built.
OQ-7 to OQ-10 also take the defaults. Every open question is closed; WS-10 stays open and 3a does not depend on it.

| # | Question | Default |
|---|---|---|
| OQ-1 | Who may raise and edit items? 0008 says "anyone who may edit" without defining it. | **Raise, comment and attach:** any active staff member who may read the contract's stages. **Edit fields:** the raiser, the assignee or the lead. **Close, cancel and reopen:** the raiser or the lead (W-3). Not limited to the PW-5 side (`mayActForOrganisation`), because site engineers often hold no delegation, and no item carries legal weight. |
| OQ-2 | Who is the lead in 3a, before the team card? | **The S.O. holders and acting holders on the organisation's today** (`soOfficeOn`, 0008 §4.9's fallback). With no time zone or no S.O., there is no lead. |
| OQ-3 | 0008 §4.3 lets the type change while To do, but numbers are per type (WS-1). | **The type is fixed at creation.** To change it, cancel with a reason and raise again. The alternative is a new number in the new type, with the old one never reused, recorded in the history. |
| OQ-4 | Defect items in 3a, now that Phase 2's lines exist. The rulings put the act-name re-check in 3b. | **3a has snags only, and no link column.** On a contract past practical completion (PC, MGC, FCI), raising a Defect item is refused with "List defects in Close-out › Defects.", so a defect never has two homes until 3b wires the link. **Known gap until 3b:** snags still open when the CPC is raised are not offered to the CPC's defect list; the officer keys them as lines, and the snag is cancelled with that reason. |
| OQ-5 | WS-17: does an existing runner fire date-based notices? There is no background runner. `dlpSweep` writes DLP_ENDING when `/inbox` is opened, and the award clocks are written when a case is read. | **Read as "no runner".** Late shows in lists only, and step 7 is not built. If the PO counts the inbox-open sweep, step 7 adds Due tomorrow and Late through the same sweep. |
| OQ-6 | Do work-item changes appear in the case's History tab? | **No.** They appear in the item's Activity and stay in the audit trail and the audit export. History keeps the formal record. |
| OQ-7 | Which document class do item files take? | **The project document class** (`DocumentStorePolicy.projectDocumentClassId`), which already refuses SULIT and is meant for files the contractor may later see (3b). While it is unset, attaching is refused by name. |
| OQ-8 | May an inspection whose result is Not yet go to In review or Done? | **No.** It needs Passed. A Failed result reads NCR and stays open (0008 §4.2). |
| OQ-9 | "Raise item" from a diary entry, a compliance observation or a meeting record (0008 §3.5). Neither 3a nor the new 3b list names it. | **Not in 3a.** Proposed for 3b, as a `sourceEntity` link. |
| OQ-10 | When a third person comments, who is "the other party" (WS-17)? | **The raiser and the assignee, minus the writer**, one notice each per comment. |
| WS-10 | Contractor contact names (the founder's call). | Unanswered. **3a does not depend on it:** it has no contractor actor. |

## 9. The rulings and where each lands in 3a

| Ruling | Where |
|---|---|
| WS-1 | W-5, `number.ts`, the unique key, the step 3 concurrency test |
| WS-9 | W-6: the per-account column with no writer; W-10: notice bodies |
| WS-12 | Step 4 `board.tsx`; §4; no single-letter keys |
| WS-13 | §4 side panel; `primaryActions` |
| WS-14 | W-6, W-7; §1 |
| WS-15 | The Board in 3a: steps 4 and 5 |
| WS-16 | §4 (no selection, no column quick add, List default, no remembered view) |
| WS-17 | W-10, `notices.ts`; OQ-5, step 7 |
| WS-18 | W-11, `activity.ts` |
| WS-19 | W-9, `late.ts`; the step 5 screen test |
| WS-22 | Step 6, §6 |
| WS-24 | §3.3, §3.4 table tests; nothing stored for overdue |
| WS-2 to WS-8, WS-11, WS-20, WS-21 | Not 3a's (3b, 4a, 4b, 4c) |

## 10. Risks

- **The case page and `case-tabs.ts` are in the uncommitted tree.** Step 1's gate covers the schema. Step 5 must also start with
  those files clean, or it merges into someone else's work.
- **The DataList change touches every list.** It is kept additive (a new cell kind and an export), and the step 4 text-snapshot
  is the proof.
- **The contract lock on every item write** is the same lock as every contract act. A long transaction (an attach) holds it, but
  files are staged outside it (W-8), as ADR 0042 D8 requires.
- **The board's drag on Windows browsers.** HTML5 drag and drop has no keyboard path, so the status-menu button is the
  accessible route, and the test drives it.

## 11. Handoff from steps 2 and 4 (built early, 2026-10-29)

Step 4 (`e8854a03`) and step 2 (`02d34575`, `25ecb3c5`) were built ahead of step 1. Steps 1, 3 and 5 must match:

- **Enums:** the values and declaration order of `src/lib/work/types.ts` (`WORK_ORDER_BY` relies on `type asc` following
  `WORK_ITEM_TYPES` and `priority desc` with LOW < NORMAL < HIGH < URGENT).
- **Column and form-field names** used by `workWhere`, `FieldEdit` and `FIELD_WORDS`: `type`, `number`, `status`, `title`,
  `description`, `priority`, `dueOn`, `location`, `assigneePersonId`, `answer`, `impact`, `inspectionResult`, `severity`,
  `happenedAt`, `fromDocumentId`, `cancelReason`.
- **Done window (decided):** step 1 adds a `closedAt` column, set on Done and Cancelled and cleared on reopen; `BoardItem.closedOn` is the organisation's day of it. Not `updatedAt`.
- **Length CHECKs** use `char_length` (bounds count code points).
- **Notice titles:** `kinds.ts` labels match `NOTICE_TITLE_WORDS`; `notices.ts` then drops its own kind type.
- **`MOVED_ALREADY.by`** is a display name from the audit row, not a Person id.
- **Activity** expects audit entities `WorkItem`, `WorkItemLink`, `DocumentAttachment` (the label-prefix query).
- **A safety incident with no time zone** is refused today as HAPPENED_AT_NEEDED, which is the wrong wording: add a time-zone
  fault or refuse first with time-zone words.
- **`happenedAt` in the audit** is written as an ISO string (`renderValue` cuts a `Date` to its UTC day); Activity shows it in
  the organisation's time zone.
- **`moveFaults`** takes a fifth argument, `MoveContext { contractOpen, reason?, comment?, lastMove? }`.
- **Shared pieces:** the `select` cell, Board `move` and Composer actions return `{ refused?: string } | void`; step 3's actions
  return refusal words rather than throw. The Board takes `cardMoves(...)` output per card. `LinkIcon` serves as the chain icon.
- **Still to check on screen (step 5/6):** Board Enter-to-open, arrow keys, outside-click closing its menu, and the text-snapshot
  diff of existing lists (step 4's Done-when, not run: no sign-in).

### Review fixes to steps 2 and 4 (2026-10-29) and what they hand on

- **Audit occurrence (M2):** `writeAudit` now returns the new audit row's id (`Promise<string>`; existing callers ignore it). A work act takes it as
  `WorkNoticeEvent.occurrence`, so a retried act tells nobody twice.
- **Activity:** `activityFeed(comments, auditRows, timeZone, names?)` has no filter: the All / Comments filter is the `Activity` component's alone. `happenedAt`
  shows as day and clock in the organisation's zone (`formatOrgDateTime`), marked when no zone is set; `dueOn` stays a plain day.
- **People sets:** `FieldFacts.activeIds` and `WorkNoticeEvent.activeIds` are the active people of the item's organisation who may READ the case; the caller
  builds them. An assignee outside the set is `ASSIGNEE_NOT_ELIGIBLE` ("Pick someone active who can see this contract."; it replaces `ASSIGNEE_INACTIVE`).
- **`FieldFacts.timeZone`** is new: a safety incident's time with no zone is `NEEDS_TIME_ZONE`, not `HAPPENED_AT_NEEDED`. Step 3 passes the zone.
- **Faults:** START refused by person is `ONLY_ASSIGNEE_RAISER_OR_LEAD` (same words); Cancel's reason and Send back's comment over `TEXT_MAX` are `TOO_LONG`
  (`field: "cancelReason" | "comment"`); `commentFaults(body)` judges a comment (`COMMENT_EMPTY`, `TOO_LONG`); `mayEdit(item, actor)` is exported and `fieldFaults` calls it.
- **Board:** `boardColumns` returns `older` (Done items closed before the window, whatever the cap); the screen gives the Done column `olderHref` (the list's
  Done view) and `olderCount`. A card with no move shows `stuckWhy` in an info popover; a Done card's assignee is told who can reopen it.
- **`FIELD_WORDS.comment`** is words only (a fault names the comment), not a column step 1 must add.
- **Step 3's database test** includes `%` and `_` search queries (they must match literally, not as LIKE wildcards).
- **Plan §3.3 overrides 0008 §4.2 / §5.4** on who may move back to To do (reopen: raiser or lead) and on the assignee's Cancel (not theirs).
- **For step 5:** there is no `date` cell kind yet, and the Due inline edit needs one (add it to `list-cells.ts` and `DataList` first, never a one-off). The
  status select's options come from `cardMoves` and exclude Cancel and Send back (the panel's dialogs collect those). Check that `?item=` links use
  `scroll={false}` so the list does not jump. `SidePanel` (`ui/side-panel.tsx`) is the panel's shell: Escape only from inside, focus back to the opener.
- **From the UI audit fixes (`b7f44abd`), check in a real browser at step 6:** the dragged card is set `inert` in `dragstart`,
  which some browsers may treat as cancelling the drag; the MoreActions menu now sits in the top layer (check its placement on
  the Board and on every existing screen that uses it); SidePanel confirms before discarding a comment only when the caller wires
  `useRequestClose(onClose)` into `DrawerHeader`.
- **From step 1 (`8e37c02b`), for step 3:** status and `closedAt` change in the same UPDATE (else `23514 WorkItem_closed_at`);
  Cancel writes a non-blank `cancelReason` in that write. Every write asks the `WORK_ITEM` act-status row under
  `withLockedContract`. Remove the three `NOT_BUILT` entries in `act-wiring-scan.test.ts` when the slots are wired.
  `withLockedOwner` returns null for `workItem`, so the acts attach files themselves (`STAGED_FOR_WORK_ITEM`, `workItemFacts`,
  `workItemLabel`). `workNoticeDrafts` returns `NoticeDraft[]`. The acts must never change an item's `type` or `contractId` (no
  trigger holds them). Open: a work item's file is not protected from version withdrawal as PA047 protects project files.
