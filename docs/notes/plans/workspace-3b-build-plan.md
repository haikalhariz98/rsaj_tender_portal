# Phase 3, stage 3b — Work items: the contractor side, the team, My work, linked cards and the folds: build plan

**Status:** Proposed, 2026-10-30. Written by the solution architect against `ae499255` on `build-all-modules`, after 3a was
accepted. The product owner rules on the open questions in §8 before step 1. A question left unanswered takes its stated
default, and that default is logged. **The exceptions are OQ-B5 and OQ-B9,** which depart from a founder answer or from 0008. Each
takes effect only on an explicit yes; without one, the status quo stands.

**Inputs:**
- Design note 0008 (`docs/notes/design/0008-project-workspace.md`), as amended on 2026-10-29: §4.5 to §4.9, §5.1, §5.6, §5.8,
  §6 and §9 "3b".
- The product owner's rulings WS-1 to WS-24 (`docs/notes/plans/rulings/workspace-po-rulings.md`, binding). WS-15 defines 3b, and
  WS-23 fixes the order 3a → 3b → 4a → 4b → 4c.
- The 3a plan (`plans/workspace-3a-build-plan.md`), and especially its §11, which records what 3a actually built.
- The 3a lines in `decisions-log.md` (2026-10-30), and the backlog row "Decide before 3b shares item files with the contractor".
- `closeout-plan.md` §7 and ADR 0047, the defect seam.

**Records:**
- ADR 0049 (`docs/notes/architecture/0049-sharing-work-items-with-the-contractor.md`) records the decisions that are hard to
  reverse:
  - stored, one-way sharing with no backfill;
  - the company assignee and the contractor raiser;
  - the audience of a file;
  - the team table;
  - the defect write-through and its lock order.
- 3b is also bound by ADR 0048 (work items), ADR 0034 (actors, act slots, audit), ADR 0042 (documents, PA047) and ADR 0047
  (defect lines).

**Founder direction applied:**
- Simple and SaaS-grade (Jira, ClickUp, Procore).
- English only, desktop only, minimal words (note 0005).
- Dropdowns wherever the values are known.
- One primary action per screen.
- Contractor pages are English only.

**What 3b is, in one line.** Staff share items with the contractor and assign work to the company. The contractor sees a list of
shared items on the portal, raises questions and incidents, replies, attaches files and sends work back for checking, and never
sees an internal note. Staff gain the Project team card, My work, read-only linked cards for the formal acts, the defect link,
and the two folds.

## 0. What 3a built, and what 3b uses (grep at `ae499255`)

| Need | Where | 3b's use |
|---|---|---|
| Item store | `src/lib/work/store.ts`: cores `createItem`, `editField`, `moveItem`, `comment`, `link`, `unlink`, `attachFiles`. Private helpers: `lockedItem`, `factsOf`, `actorOf`, `tell`, `audit`, `gate`. Every core takes a `StaffActor`. | Staff cores gain sharing, the company assignee and the comment audience. The contractor's cores are a new file that reuses the helpers (§2 B-14). |
| Readers | `src/lib/work/load.ts`: `loadWorkContext`, `loadWorkList`, `loadBoard`, `loadItem`, `loadActivity`, `assigneeOptions`, `linkOptions`, `leadOf`, `whoNamesOf`, `activeAmong`, `workAuditPrefix` | New fields on the card and the item. `leadOf` reads the team first. |
| Pure rules | `move.ts` (`moveFaults`, `primaryActions`, `actionOf`, `TARGET`, `INPUT_FAULTS`), `fields.ts`, `views.ts` (`workWhere` / `inView`), `notices.ts` (`workNoticeDrafts`), `lead.ts`, `labels.ts`, `board.ts`, `activity.ts` | Extended, never copied. `WorkItemFacts.raisedBy` and `assignee` change shape (§3.2). |
| Non-null assertions that break | `raisedByPersonId!` in `store.ts` (`factsOf`, `tell`, `mayLink`) and `load.ts` (`cardOf`); `raisedBy: string` in `WorkItemFacts` and `WorkNoticeEvent` | Every one becomes the party shape in step 2 or step 3. Grep `raisedByPersonId!` and `raisedBy:` before starting. |
| Schema | `WorkItem` (`raisedByPersonId?` CHECK NOT NULL; `assigneeSupplierAccountId?` with no writer; at most one assignee), `WorkItemComment` (`internal`, `personId?` CHECK NOT NULL, append-only), `WorkItemLink`, `DocumentAttachment.workItemId`; migrations up to `20261210001000_final_party_lines` | Additive changes (§3.1). |
| Act × status | `WORK_ITEM: executed(PC, MGC, FCI)` in `src/lib/contract/act-status.ts:128` | Contractor work acts ask the same row. The team gets its own row. |
| Staff screens | `src/app/projects/[id]/work-panel.tsx`, `work-item-panel.tsx`, `work-editors.tsx`, `work-controls.tsx`, `work-actions.ts`, `work-shared.ts`; `src/components/ui/{board,activity,composer,side-panel}.tsx` (the composer says "No Reply / Internal note toggle yet") | The Shared chip and toggle, "{contractor}" in the picker, the composer's toggle, and the internal tint. |
| Portal contract page | `src/app/supplier/projects/[id]/page.tsx` (tabs from `PROJECT_TABS`, `src/lib/portal/projects/types.ts:10`); `panels.tsx` (`DefectsPanel`, shown once the CPC is issued) | A new `work` tab. `defects` folds into it. |
| Portal acts | Route handlers under `src/app/supplier/projects/*/route.ts`: `supplierPost(request, "projects")`, hand parsing in `src/lib/portal/projects/api.ts`, `inHeldContract` (`submission-store.ts:35`: the contract lock, the held contract, the standing bar, and **`DAY_NOT_KNOWN` with no time zone**), `refusalReply` / `reply` (`src/app/supplier/projects/reply.ts`), `supplierAuditActor`; `reportRectifiedAsContractor` (`defect-store.ts`) is the closest precedent | The contractor's work routes copy this shape. They are route handlers, not server actions. |
| Portal uploads | `preflightProjectUpload`, `storeProjectFile`, `windowRows`, `windowFaults` (`src/lib/project-docs/portal-upload.ts`, `bounds.ts`), staged as `STAGED_FOR_PROJECT_DOCUMENT` | A supplier-side upload staged as `STAGED_FOR_WORK_ITEM`. Today `attachFiles` accepts only `recordedBySupplierAccountId: null`. |
| Portal "Waiting for you" | `loadWaitingForYou` (`project-docs/portal-read.ts:360`, `WaitingRow`), `WaitingList`, `src/app/supplier/waiting-card.tsx` | Work rows join the documents. |
| The contractor's name | `actorDisplayName` (`src/lib/audit/actor.ts:47`) already reads a SUPPLIER row as "A supplier's portal account", never a contact's name. Contact names are SULIT behind `sulitGate` (`project-docs/team-read.ts`). | Staff surfaces show a contractor actor as the awardee's name (`l.award.awardeeName`), never the contact (WS-9, WS-10). |
| The organisation's side | `organisationSideOn` (`project-docs/side-store.ts`) | WS-11: which staff names the portal may show. |
| File withdrawal | `withdrawFault` / `heldByProjectFile` (`src/lib/documents/versioning.ts`), trigger PA047 (widened before for supply-claim files, `online-return-schema.db.test.ts:365`) | Decision B-6. |
| Defect acts (re-check, rulings' open line) | Staff, in `src/app/projects/[id]/closeout-actions.ts`: `addCpcDefect`, `removeCpcDefect`, `reportDefect`, `reportDefectRectified`, `acceptDefect`, `returnDefect`, `withdrawDefect`. Portal: `reportRectifiedAsContractor`. Pure: `defectState`, whose states are OPEN, REPORTED_RECTIFIED, MADE_GOOD and WITHDRAWN, and `defectActFaults` (`src/lib/closeout/defects.ts`) | **The re-check:** all five acts that 0008 §4.7 names exist under those names. Two more exist that 0008 does not map, `withdrawDefect` and `removeCpcDefect`. Both are mapped in B-18. |
| Scans | `src/app/_auth/supplier-reach.test.ts`, `src/lib/auth/supplier-act-slots.test.ts` (non-signing supplier columns with reasons, e.g. `DefectEvent.supplierAccount`), `src/lib/work/work-wiring.test.ts`, `src/lib/work/pure-scan.test.ts`, `lock-order.test.ts` | Each one is extended, never loosened. |
| Nav | `src/lib/nav.ts:47` ("My approvals"), `nav.test.ts` | Adds "My work". |

## 1. Scope

**3b ships in two parts, each accepted on its own (OQ-B1).** 3b-i is the contractor side and the team. 3b-ii is My work, linked
cards, the defect link and the folds. Together they are roughly twice the size of 3a, and 3b-i is what the caller and the founder
asked for first.

| In 3b-i (steps 1 to 7) | In 3b-ii (steps 8 to 12) | Not in 3b (where it goes) |
|---|---|---|
| `sharedAt`, one-way sharing, the Shared toggle and chip, and type defaults on New item | `/my-work` in the nav, as a list (OQ-B10) | Item → act links and "Start a variation" (OQ-B11) |
| The "{contractor}" assignee (the company, WS-9) | Linked cards for variations, EOT claims and certificates in routing, on the Board and pinned in the List | "Raise item" from a diary entry, an observation or a meeting (OQ-B13) |
| Reply / Internal note on shared items, and the internal tint | The defect link (`defectItemId`), with defect acts writing the item's status through | Due tomorrow / Late notices: there is still no runner (OQ-5 stands) |
| The contractor raiser: "Ask a question" (RFI) and "Report an incident" | Fold: the portal's Defects tab into Work, old address aliased (WS-5) | The per-account assignee: the column stays unwritten (WS-9, WS-10) |
| The portal's Work tab: a list in three groups, a modal drawer, one button per row (WS-13) | Fold: staff Certificates (`documents`) into Documents (`submissions`), old address aliased (WS-5) | Email; a contractor notice table or bell (PW-13) |
| The contractor's acts: Reply, Send for checking, Accept answer, Ask again, attach, write an RFI's Answer | | A Board on the portal (WS-13); a Board on My work (OQ-B10) |
| Work rows in the portal's "Waiting for you" | | Editing or deleting comments |
| The Project team card (four roles), the lead from the team, default assignees | | |
| One new staff notice kind, "From the contractor" | | |
| "Waiting on {contractor}" view and a Shared filter | | |
| The withdrawal ruling for item files (backlog row) | | |

## 2. Decisions (B-1 to B-19)

### Leak-critical, settled first

**B-1. Sharing is stored, and never derived from the type** (ADR 0049 D1).
- `WorkItem.sharedAt DateTime?` is written by the act that shares. The act is audited as `sharedAt: null → instant`.
- **The migration does not backfill it.** Every 3a item stays unshared (WS-14 promised `shared` is false on every 3a item). If
  sharing were read from the type, every 3a RFI, SI, Inspection and Defect would reach the contractor on the day 3b ships.
- **It is one-way**, held by a trigger: once set, `sharedAt` never changes and never returns to null (0008 §4.5).
- **CHECK:** `assignedToContractor OR raisedBySupplierAccountId IS NOT NULL` implies `sharedAt IS NOT NULL`. Assigning to the
  contractor shares the item in the same act.
- **Defaults on create (OQ-B2).**
  - The New item drawer shows "Share with {contractor}" preset from the type: on for RFI, SI, Inspection and Defect; on for an
    Action only once the assignee is "{contractor}"; off for Incident and Task (0008 §4.1).
  - Staff may switch it off before creating.
  - The list's quick-add row never shares. It has no toggle, and a shared item cannot be unshared.

**B-2. Comments: the audience is chosen per comment, never re-read** (ADR 0048 D4 stands).
- On an unshared item every comment is internal, and no choice is shown.
- On a shared item, staff choose **Reply** or **Internal note** in the composer. The default is in OQ-B9.
- A contractor's comment is always a Reply. CHECK: a comment with `supplierAccountId` has `internal = false`.
- **Send back** on an item assigned to the contractor writes its comment as a Reply, because the contractor must see why it came
  back. On any other item it stays internal.
- Sharing never re-classifies an earlier comment.
- The 3a scan "every comment insert passes `internal: true`" is **replaced by a stricter one**: `internal` is always the value of
  `commentAudience(...)`, and is never a literal `false`. The change is flagged in its commit.

**B-3. Files have an audience too** (ADR 0049 D3). `DocumentAttachment` has no audience column, and 3b adds none. The portal
lists an item's file only if one of these holds:
- the file was uploaded by the contractor (`version.recordedBySupplierAccountId` is set); or
- it was attached at or after the item was shared (`attachedAt >= sharedAt`).

Files attached while the item was internal stay staff-only. On a shared item the composer's 📎 is offered only with Reply. Files
added under Files are labelled "Visible to {contractor}" (WSEC-10 L6: there are no read receipts, so never "Seen by"). So an internal note never carries a file the contractor can see.

**B-4. The contractor on staff surfaces is the company** (WS-9; WS-10 default).
- Every staff surface reads a contractor actor as the awardee's name with a building avatar: cards, rows, Activity ("{contractor}
  replied"), MOVED_ALREADY's words and who-can popovers.
- The contact's name is never read for these surfaces. `actorDisplayName` already gives "A supplier's portal account" for a
  SUPPLIER audit row, and the Activity loader maps every SUPPLIER row to the awardee's name.
- **WS-10 independence.** If the founder makes contact names Internal later, only one function changes:
  `contractorActorWords(...)` in `src/lib/work/labels.ts`. There is no schema change. The account id is already stored on each act
  (B-3, B-12).
- A scan holds that no staff work surface imports `team-read.ts` or `sulitGate`.

**B-5. Notice bodies never name anyone** (WS-9). The new kind follows 3a's body: reference · title · Contract {number}. It never
carries `awardeeName`. (`defectRectifiedNotices` passes `awardeeName`, and is not copied.) The 3a scan "no body string of a
notice is built from a supplier record" stays and covers the new kind.

**B-6. Withdrawal of an item's file (decides the backlog row; OQ-B4).**
- **Every live work-item file is kept** from withdrawal. The `WORK_ITEM_FILE` purpose joins `heldByProjectFile` and trigger PA047,
  exactly as supply-claim files were widened. The rule is unconditional, so the trigger never reads `WorkItem.sharedAt`.
- **A file attached by mistake to an unshared item** is removed by **Remove**. Remove sets `detachedAt`, asks a reason and is
  audited. Only the person who attached it or the lead may use it. After that, the store may withdraw the version, because a
  detached pin holds nothing.
- **On a shared item a file is never removed.** The contractor may already have it, and sharing is one-way. A correction is a new
  file and a reply.
- The contractor's own files are kept on the same terms.
- The 3a list rendering of a withdrawn file (struck through, no download) stays for files withdrawn before 3b.

### The contractor in the model

**B-7. The company as assignee** (ADR 0049 D2).
- `WorkItem.assignedToContractor Boolean @default(false)`. No supplier FK is needed: the awardee is fixed per contract.
- CHECK: at most one of `assigneePersonId`, `assignedToContractor` and `assigneeSupplierAccountId`. The last stays unwritten
  (WS-9), and the 3a scan stays.
- **The picker:** the team first, then "{contractor}", then everyone else (0008 §4.3). It is a dropdown.
- With no active portal account, assigning to the contractor is still allowed, with a warn chip "No active portal account"
  (0008 §5.8).
- Any of the awardee's active accounts may act on such an item (PW-17).

**B-8. The contractor as raiser and writer** (ADR 0049 D2).
- `WorkItem.raisedBySupplierAccountId?`. The 3a CHECK is replaced by "exactly one raiser".
- `WorkItemComment.supplierAccountId?`. Its CHECK is replaced by "exactly one writer".
- Both columns are records, not signatures. They go into `supplier-act-slots.test.ts`'s non-signing map, beside
  `DefectEvent.supplierAccount`.
- The contractor raises only the two types it may raise (0008 §4.1): RFI and Safety incident.

**B-9. The move table gains a contractor actor** (one pure function, still WS-24).

| Who | May | Words on the portal |
|---|---|---|
| Contractor, as assignee | To do or In progress → In review | "Send for checking" (on a linked defect, "Mark as fixed", B-18) |
| Contractor, as raiser | In review → Done | "Accept answer" |
| Contractor, as raiser | In review → In progress, with a reply | "Ask again" |
| Contractor | Start, Cancel, Reopen, the shortcut | Never (0008 §4.2) |
| Staff on a contractor-raised item | Raiser rights fall to the **lead**. The staff assignee works it as before, and the lead may close it In review if the contractor goes quiet (0008 §4.2). | — |

- `WorkActor` gains `side: "STAFF" | "CONTRACTOR"`.
- `WorkItemFacts.raisedBy` and `assignee` become parties (§3.2).
- The table test gains the contractor rows: every from × to for the contractor as raiser, as assignee, and as neither.
- **Inspection (OQ-B5, a departure).** The recommendation lets an Inspection reach In review with any result, read as "ready
  for inspection", while Done still needs Passed. Until the product owner says yes, 3a's OQ-8 stands: the contractor cannot send
  an NCR for checking, so it replies, and the raiser reassigns the item to themselves, sets Passed, and takes the shortcut.

**B-10. What the contractor may edit.**
- The contractor never edits a field, with one exception: **the Answer of an RFI assigned to it** while it is open (OQ-B6). Without
  that, an RFI that staff send to the contractor can never reach In review.
- A due date the contractor disagrees with is a reply (0008 §6).
- What the contractor sets when it raises an item is listed in B-15.

**B-11. Who edits on staff's side.** W-3 stands: the raiser, the assignee or the lead. On a contractor-raised item there is no
staff raiser, so it is the assignee or the lead. A who-can popover names the lead's role and people.

### The team and the lead

**B-12. The Project team card** (WS-3; 0008 §4.9; ADR 0049 D4).
- **The table** is `ProjectTeamMember`:
  - columns: `organisationId`, `contractId`, `role`, `personId`, `addedByPersonId`, `recordedAt`;
  - `role` is `ProjectTeamRole`: PROJECT_MANAGER, SITE_ENGINEER, CONTRACT_ADMINISTRATOR, CONSULTANT. The four are fixed product
    defaults, like the types.
- **Guards:**
  - one Project manager per contract, by a partial unique index;
  - unique (`contractId`, `role`, `personId`);
  - the person must be active in the organisation, and the act checks it.
- **Removal** deletes the row with a reason, and the delete is audited (the `WorkItemLink` precedent).
- Changing the Project manager is a remove and an add in one act.
- **The act-status row** is `PROJECT_TEAM: executed(PC, MGC, FCI)`, a row of its own, not `WORK_ITEM` reused.
- **Who may change the team (OQ-B7, amended by WSEC-2):** the Project manager, and the S.O. holders and acting holders in force
  on the organisation's today (the S.O. keeps the right once a manager is named). With neither (no manager, and no S.O. in force
  or no time zone) nobody may, and the card is locked: it shows "No project manager" with a popover saying what to set. The first
  manager is named by the S.O., never by whoever opened the case (`teamChangerIds`, `teamChangeFaults`).
- Roles route work and notices. They never carry authority: no approval, certificate or document act reads this table. A scan
  holds that.

**B-13. The lead** (WS-3).
- The lead is the Project manager when one is named, else the S.O. holders and acting holders on the organisation's today (3a's
  W-4).
- `leadIds(team, so, today)` replaces `leadIds(so, today)`, and `leadOf` reads the team first.
- The Project manager needs no time zone. The S.O. fallback does.

### The contractor's acts and screens

**B-14. The contractor's cores are their own file**, `src/lib/work/portal-store.ts`, as `defect-store.ts` is for defects.
- Each core runs in `inHeldContract`, which takes the contract lock, checks that the session's supplier holds the contract, and
  applies the standing bar.
- It then asks `WORK_ITEM` and locks the item row with `store.ts`'s `lockedItem`, which is exported for this. The item must be
  shared, or it reads as **not found** (404, the same words as any other id).
- It applies the same pure faults as staff, writes, audits with `supplierAuditActor`, and tells staff.
- **No time zone:** `inHeldContract` refuses `DAY_NOT_KNOWN`, so every contractor work act is refused, as every other portal act
  is today. This is accepted for consistency, and the portal tab reads the existing words.
- **Throttle:** at most N raises and N replies per account per window. The constants live in `src/lib/work/bounds.ts` with their
  reasons. They are technical bounds, not policy (the `windowRows` and `SUBMISSIONS_PER_WINDOW` precedent).
- **Files:** the contractor's upload route stages files as `STAGED_FOR_WORK_ITEM`. A new contractor `attachFiles` path accepts only
  the actor's own staged versions (`recordedBySupplierAccountId = actor.accountId`). It applies the same class rule, and the class
  must be set.

**B-15. Raising from the portal** (0008 §6).
- **"Ask a question"** creates an RFI. Its fields are the title, details, location, files and **"Answer needed by"**, a required
  date. The RFI CHECK requires `dueOn`, and 3b keeps the CHECK.
- **"Report an incident"** creates a Safety incident. Its fields are the title, details, location, severity (a dropdown), when it
  happened (a day and a time) and files.
- Both are shared at creation and numbered under the contract lock, like any item.
- The assignee follows B-16.

**B-16. Default assignees on a contractor raise** (0008 §4.9).
- An RFI goes to the Contract administrator. An incident goes to the lead.
- With exactly one holder, that person is assigned. With several holders, or none, the item is unassigned, and every holder (or
  the lead, when the role is empty) is told (OQ-B8).
- A pure function, `defaultAssignee(type, team, lead)`, decides.

**B-17. Notices** (WS-17).
- **One new kind, `WORK_ITEM_FROM_CONTRACTOR`**, titled "From the contractor". It is sent when the contractor raises an item (to
  the assignee, or as B-16 says) and when it replies (to the staff raiser and the staff assignee, or to the lead when the item has
  neither).
- **The contractor's moves reuse the existing kinds:** Send for checking sends `WORK_ITEM_TO_CHECK` to the staff raiser, or the
  lead on a contractor-raised item. Ask again sends `WORK_ITEM_RETURNED` to the staff assignee. Accept answer tells nobody, because
  the item is done.
- `writeNotices` is called with actor `null` (the `defect-store.ts` precedent).
- **WS-17's "plus the lead on items the contractor raised"** applies to every kind on such an item.
- **The contractor gets no notice** (PW-13). Its "Waiting for you" list is derived: shared items assigned to it and To do or In
  progress, and items it raised that are In review.

### 3b-ii

**B-18. The defect link** (0008 §4.7; ADR 0047; rulings' open line; ADR 0049 D5).
- **The column** is `WorkItem.defectItemId? @unique`, on the DEFECT type only (CHECK). One line has at most one item.
- **Status is written through, not derived.** Each defect act that changes a linked line's state also updates the linked item's
  status in the same transaction, so `workWhere` stays one indexed query:
  - OPEN → In progress;
  - REPORTED_RECTIFIED → In review;
  - MADE_GOOD → Done;
  - WITHDRAWN → Cancelled, with the withdrawal note as the reason.

  The pure map is `defectItemStatus(state)`.
- **Moves on a linked item call the defect acts**, and are refused in those acts' own words:

| Item move | Defect act |
|---|---|
| Mark done | `acceptDefect` |
| Send back (asks a comment) | `returnDefect` (the comment is its note) |
| Cancel (asks a reason) | `withdrawDefect` |
| The contractor's "Mark as fixed" | `reportRectifiedAsContractor` |
| Staff "Send for checking" on the contractor's behalf | `reportDefectRectified` |
| Reopen | Refused: "This defect is closed in Close-out." |

- **Linking.**
  - At CPC raise, the officer picks open Defect items in a multi-select. `addCpcDefect` creates their lines and links them.
  - `removeCpcDefect` clears the link, and the item stays a snag.
  - During the defects liability period, a Defect item is created **with its line in one act**, under `reportDefect`'s rules
    (OQ-B12). This replaces 3a's OQ-4 refusal, so a defect never has two homes.
- **Lock order:** contract → `WorkItem` → `DefectItem`. Both `closeout-actions.ts`'s defect acts and the work acts take it in that
  order, and `lock-order.test.ts` gains the block.
- Lines with no item, such as those keyed by an officer at CPC, stay in Close-out › Defects, which remains the legal schedule.

**B-19. Linked cards and the folds** (0008 §4.6, WS-5, WS-16).
- **The column of a linked card** comes from `linkedCardColumn(kind, state, decidedOn, today)`, using 0008 §4.6's table. The
  state is read with each register's own state reader and words. A step 9 grep names them; nothing is restated.
- **On the Board,** linked cards are dashed cards with no drag. A drag snaps back with "Moves when the variation is decided. Open
  it to act."
- **In the List,** they are a pinned group above page 1, only in the Open view, and capped. They are not merged into the server
  paging: that is the simpler of the two house options.
- Linked cards are not shown on My work or on the portal.
- **Folds:**
  - The portal's `?tab=defects` becomes the view **Defects** inside Work, rendering `DefectsPanel` unchanged (lines, not items).
  - The staff `?tab=documents` (Certificates) becomes a Certificates section of `submissions`.
  - Every old address resolves through the existing alias paths.

## 3. Contracts (written in step 1, before any act or screen)

### 3.1 Schema (additive; `organisationId` on every model; FKs Restrict; CHECKs and triggers by hand)

**Gate.**
- Step 1 starts only once `git status` shows these clean: `prisma/`, `src/lib/sulit-fields.ts`, `src/lib/auth/sulit-access.test.ts`
  and `src/lib/contract/case-tabs.ts`. The first two are uncommitted at the time of writing, and 3b touches SULIT reads.
- Each migration folder sorts after the newest folder on disk **at build time** (today `20261210001000_final_party_lines`). No
  timestamp is fixed here.

**Migration 1, `work_items_shared`:**

| Change | Guard |
|---|---|
| `WorkItem + sharedAt DateTime?`, `+ assignedToContractor Boolean NOT NULL DEFAULT false`, `+ raisedBySupplierAccountId?` (FK SupplierAccount) | CHECK exactly one of `raisedByPersonId` / `raisedBySupplierAccountId` (replaces 3a's NOT NULL CHECK). CHECK at most one of the three assignee forms. CHECK `(assignedToContractor OR raisedBySupplierAccountId IS NOT NULL) → sharedAt IS NOT NULL`. CHECK a contractor raiser only on RFI or SAFETY_INCIDENT. Trigger: `sharedAt` never changes once set. **No backfill.** Index (`contractId`, `sharedAt`). |
| `WorkItemComment + supplierAccountId?` (FK SupplierAccount) | CHECK exactly one of `personId` / `supplierAccountId` (replaces the NOT NULL CHECK). CHECK `supplierAccountId IS NOT NULL → internal = false`. The append-only trigger is unchanged. |
| `WorkItem + defectItemId?` (FK DefectItem, unique) | CHECK DEFECT only. Written in 3b-ii, and created now so that 3b has one migration of item columns. |
| Trigger PA047 | Its purpose list gains `WORK_ITEM_FILE` (B-6). |
| `StaffNotice` kind CHECK | Rebuilt from `STAFF_NOTICE_KINDS` + `WORK_ITEM_FROM_CONTRACTOR`. |

**Migration 2, `project_team`:**

| Model | Fields | Guards |
|---|---|---|
| enum `ProjectTeamRole` | PROJECT_MANAGER, SITE_ENGINEER, CONTRACT_ADMINISTRATOR, CONSULTANT | — |
| `ProjectTeamMember` | `organisationId`, `contractId` (FK Contract), `role`, `personId` (FK Person), `addedByPersonId` (FK Person), `recordedAt` | Unique (`contractId`, `role`, `personId`). Partial unique (`contractId`) WHERE `role = 'PROJECT_MANAGER'`. Index (`personId`). |

**Code that changes with the schema** (the schema-wide scans fail otherwise):
- `src/lib/inbox/kinds.ts`: the kind, labelled "From the contractor", and the header's migration list.
- `src/lib/contract/act-status.ts`: `PROJECT_TEAM: executed(PC, MGC, FCI)`, with the pin fixture and the four act-status tests
  extended.
- `src/lib/auth/act-slots.ts`:
  - a slot for `ProjectTeamMember.addedBy`;
  - `NOT_AN_ACT` for `ProjectTeamMember.person` ("who holds the role, not who acted").
- `src/lib/auth/supplier-act-slots.test.ts`: `WorkItem.raisedBySupplierAccount` and `WorkItemComment.supplierAccount`, each with
  its reason ("the column is the record, audited with the account; it signs nothing").
- `src/lib/auth/act-wiring-scan.test.ts`: `NOT_BUILT` entries, removed by the step that wires each one.
- `src/lib/suppliers/data-export-fields.ts`: `WorkItem` and `WorkItemComment` leave `NOT_YET_EXPORTED`. A supplier's data export
  includes the items its accounts raised and the comments they wrote. `assigneeSupplierAccountId` stays unexported because it is
  unwritten.
- `src/lib/documents/versioning.ts`: `heldByProjectFile` counts a live `WORK_ITEM_FILE` pin (B-6). `withdrawFault`'s words for it
  are "Kept: it is a work item's file. Remove it from the item first." on an unshared item, and plain "Kept" on a shared one.
- `src/lib/audit/entity-labels.ts`: "Project team member".
- `prisma/demo.ts` wipe order (and `src/lib/documents/demo-wipe-plan.ts` if it lists owners): `ProjectTeamMember` in Restrict order.

**Bounds** (technical constants, not policy; each in `src/lib/work/bounds.ts` with its reason):
- at most 20 raises per contractor account per 60 minutes (`CONTRACTOR_RAISES_PER_WINDOW`);
- at most 100 replies per contractor account per 60 minutes (`CONTRACTOR_REPLIES_PER_WINDOW`);
- at most 100 rows per group in the portal's Work list, with "More" beyond that;
- at most 20 linked cards pinned in the List.

**Optional backstop (the builder adds it if it is cheap):** a trigger that refuses a `WorkItemComment` insert with
`internal = false` when the item's `sharedAt` is null or later than `recordedAt`. That is ADR 0048 D4 in the database, beside the
one-way trigger. Without it, the pure rule and the scan hold the line.

### 3.2 Types: changes to `src/lib/work/types.ts`

```ts
/** Who raised an item, who holds it, who acts. The contractor is the company (WS-9): never an account on these. */
export type Party = { kind: "PERSON"; id: string } | { kind: "CONTRACTOR" };

export interface WorkItemFacts {
  id: string; type: WorkItemType; number: number; status: WorkStatus;
  raisedBy: Party;                 // was: string
  assignee: Party | null;          // was: string | null
  sharedAt: string | null;         // ISO instant; null = not shared
  dueOn: Day | null; answer: string; inspectionResult: InspectionResult | null;
  defectLinked: boolean;           // 3b-ii: moves go to the defect acts (B-18)
}

export interface WorkActor {
  side: "STAFF" | "CONTRACTOR";
  personId: string | null;         // STAFF only
  leadIds: readonly string[];
  mayReadContract: boolean;        // CONTRACTOR: holds the contract (inHeldContract)
}

export type Audience = "REPLY" | "INTERNAL";

export type MoveFault = /* 3a's */
  | { code: "ONLY_CONTRACTOR" }          // e.g. Accept answer on a contractor-raised RFI
  | { code: "NOT_FOR_CONTRACTOR" }       // Cancel, Reopen, Start by the contractor
  | { code: "DEFECT_CLOSED" };           // Reopen on a linked defect

export type FieldFault = /* 3a's */
  | { code: "NOT_SHARED" }               // a Reply on an unshared item
  | { code: "SHARE_IS_ONE_WAY" }         // unsharing
  | { code: "CONTRACTOR_MAY_NOT_EDIT"; field: string }
  | { code: "NOT_CONTRACTOR_TYPE" }      // the contractor raising a type other than RFI or incident
  | { code: "FILE_ON_SHARED_ITEM" };     // Remove on a shared item (B-6)

export type WorkView = "open" | "mine" | "late" | "unassigned" | "contractor" | "ncr" | "done";
// WorkFilters.assignee also takes the literal "contractor"; WorkFilters gains shared?: boolean | null.

export type WorkNoticeKind = /* 3a's four */ | "WORK_ITEM_FROM_CONTRACTOR";
export interface WorkNoticeEvent {
  kind: WorkNoticeKind; actorId: string | null; // null: the contractor acted
  raisedBy: Party; assignee: Party | null; contractorRaised: boolean;
  leadIds: readonly string[]; roleHolders?: readonly string[]; occurrence: string; activeIds: ReadonlySet<string>;
}

export type TeamRole = "PROJECT_MANAGER" | "SITE_ENGINEER" | "CONTRACT_ADMINISTRATOR" | "CONSULTANT";
export interface TeamMember { role: TeamRole; personId: string }

export type PortalGroup = "WAITING_FOR_YOU" | "WITH_ORG" | "CLOSED";
export type PortalAction = "REPLY" | "SEND_FOR_CHECKING" | "MARK_AS_FIXED" | "ACCEPT_ANSWER" | "ASK_AGAIN" | "OPEN";
export type MyWorkGroup = "TO_CHECK" | "LATE" | "TODAY" | "THIS_WEEK" | "LATER" | "NO_DATE";
export type LinkedKind = "VARIATION" | "EOT_CLAIM" | "CERTIFICATE";
```

The `raisedBy: string` → `Party` change reaches every 3a test that builds facts (`items.fixture.ts`, `move.test.ts`,
`fields.test.ts`, `notices.test.ts`, `views.test.ts`). Each is changed **faithfully**: a person raiser becomes
`{ kind: "PERSON", id }`, with no expected value changed. The commit lists each file.

### 3.3 The move table, as 3b leaves it (pure `moveFaults`; the 3a rows are unchanged unless marked)

| From → To | Staff who may | Contractor may | Also needs |
|---|---|---|---|
| To do → In progress | Assignee, raiser or lead | — | — |
| To do or In progress → In review | The assignee, where it is not the raiser | As assignee ("Send for checking") | RFI: an answer. Inspection: Passed (OQ-8). **Nothing only if OQ-B5 is answered yes.** |
| To do or In progress → Done (the shortcut) | Raiser or lead, where unassigned or self-held | — | RFI: an answer. Inspection: Passed. |
| In review → Done | Raiser or lead; **on a contractor-raised item, the lead** | As raiser ("Accept answer") | As the shortcut |
| In review → In progress (send back) | Raiser or lead | As raiser ("Ask again") | A comment (a Reply when the contractor is party) |
| Open → Cancelled | Raiser or lead | — | A reason |
| Done or Cancelled → To do (reopen) | Raiser or lead | — | — (refused on a linked defect) |

### 3.4 Pure rules (`src/lib/work/`; tests beside each; table tests where WS-24 asks)

| File | Functions | Key tests |
|---|---|---|
| `move.ts` (changed) | `moveFaults`, `primaryActions`, `contractorActions(item, actor)` | **The full table extended** with the contractor as raiser, as assignee and as neither, for every from × to. The Inspection change (OQ-B5). Lead-only closing on contractor-raised items. Linked-defect rows (Reopen refused). |
| `sharing.ts` (new) | `shareDefault(type, assignee)`, `shareFaults(item, actor)`, `sharedOnCreate(input)` | The type table of B-1; an Action shares only once assigned to the contractor; unsharing is refused; quick add never shares; assigning to the contractor shares. |
| `audience.ts` (new) | `commentAudience(item, side, choice, action)`, `portalSeesFile(file, sharedAt)` | Unshared → INTERNAL whatever is chosen; the contractor → REPLY; Send back to a contractor assignee → REPLY; a file before `sharedAt` → hidden; the contractor's own file → seen. |
| `fields.ts` (changed) | `fieldFaults` with the contractor side; `contractorRaiseFaults(form)` | The contractor edits only the Answer on an RFI assigned to it; a raise of another type is refused; "Answer needed by" is required; a future `happenedAt` is refused. |
| `team.ts` (new) | `teamFaults(team, change, activeIds)`, `defaultAssignee(type, team, leadIds)` | A second PM is refused; the same person twice in one role is refused; an inactive person is refused; one holder → assigned; several or none → unassigned plus the people told (OQ-B8). |
| `lead.ts` (changed) | `leadIds(team, so, today)` | PM named → the PM, with or without a time zone; no PM → the S.O. holders and acting holders; neither → empty. |
| `notices.ts` (changed) | `workNoticeDrafts` | The new kind's recipients; the lead added on contractor-raised items for every kind; actor null; no body holds the awardee's or a contact's name (an extended source test). |
| `portal.ts` (new) | `portalGroup(item)`, `portalAction(item)`, `portalStaffLabel(assignee, teamIds, sideIds, names, orgName)` | The three groups; one button per row from type and state; WS-11: a staff assignee named only if on the team or the in-force side, else the organisation's name. |
| `views.ts` (changed) | `inView` / `workWhere` with `contractor` and `shared` | Still agree on the 40-item fixture plus contractor rows; "Waiting on {contractor}" = assigned to the contractor and To do or In progress, or contractor-raised and In review. |
| `labels.ts` (changed) | `contractorActorWords(awardeeName)`, portal words, team role words | Every new enum value has words; no key reaches a screen. |
| `my-work.ts` (3b-ii) | `myWorkGroup(item, me, today)`, `myWorkWhere(me)` | To check = I raised it and it is In review; Late / Today / This week (today + 1 to today + 6) / Later / No date; with no time zone the dated groups collapse to one "Open", with "Needs the organisation's time zone." |
| `linked.ts` (3b-ii) | `linkedCardColumn(kind, state, decidedOn, today)` | 0008 §4.6's table: 14 days in Done, then off the board; withdrawn reads "Withdrawn". |
| `defect-link.ts` (3b-ii) | `defectItemStatus(state)`, `defectActOf(action, side)` | The B-18 maps; Reopen → refused. |

## 4. The screens

**Staff, Work tab (3b-i):**
- **Toolbar:**
  - the view chip "Waiting on {contractor}" (after Late);
  - a Shared filter (Shared, Not shared);
  - "{contractor}" in the Assignee filter.
- **Card and row:**
  - a ⇄ marker on shared items;
  - a building avatar for "{contractor}";
  - "{contractor}" in the assignee select, with the "No active portal account" warn chip where it applies.
- **Panel header:**
  - a quiet "Not shared" chip and a **Share with {contractor}** action, kept in ⋯ so the one primary stays the move;
  - "⇄ Shared" once shared;
  - sharing asks a `ConfirmDialog`: "{contractor} will see this item, its replies and files added from now. This can't be undone."
- **Composer:** `Reply | Internal note` (the shared segmented switch from `1309e431`), shown only on shared items. Internal is on the
  amber tint with the lock icon, and 📎 is offered only with Reply.
- **Activity:** internal notes on the tint with the lock icon; "{contractor} replied".
- **Files:**
  - on a shared item, the label "Visible to {contractor}" for files the portal shows (it read "Seen by" until WSEC-10 L6);
  - "Staff only" for files attached before sharing;
  - **Remove** on unshared items, which asks a reason.
- **New item drawer:** the "Share with {contractor}" toggle, preset by type (B-1).
- **Team tab:** the **Project team** card, as rows of role and person.
  - Add, Change manager and Remove (which asks a reason) are drawers.
  - A Callout "No project manager" in the warn tone appears when none is named (0008 §5.8).
  - Every person picker is a dropdown of the organisation's active people.

**Portal, Work tab (3b-i; English only; list only, WS-13):**
- **Strip:** Overview · **Work** · Programme · Site diary · Payments · Certificates · Documents (+ Defects until 3b-ii folds it).
- **Header actions:** **Ask a question** (primary) and Report an incident.
- **Groups:**
  - **Waiting for you** (count);
  - **With {org}** (count);
  - **Closed ›** (a link; nothing is drawn when it is empty).
  Each row shows the reference, the title and the due date ("2 days late" in the error tone; not judged with no time zone), and one
  button from `portalAction`.
- **Opening a row** opens a modal drawer at `md` width, holding:
  - the title, the due date, the description and, for an RFI, the Answer (editable when the item is assigned to the contractor);
  - files, the conversation (Replies only) and one composer with Send;
  - the primary button at the top.
- **Words:** "Sent to {org} for checking", "Sent back to you: see the reply", "2 days late". No status names, no codes.
- **Portal home "Waiting for you":** work rows join the document rows in `WaitingList`, each naming its contract.
- **Empty:** "Nothing waiting for you."

**Staff, My work (3b-ii; `/my-work`; list only, OQ-B10):**
- The groups To check, Late, Today, This week, Later and No date, as a `DataList` with group headers. Each row shows the reference,
  the title, the project, the status and the due date.
- Opening a row opens the same side panel. The address carries the contract: `?contract={id}&item=RFI-12`. The panel's header
  links into the project's Work tab.
- Every work action revalidates `/my-work`.
- Empty: "Nothing on you."

**Linked cards (3b-ii):**
- On the Board: dashed, with the chain icon, the act's label and its state in its own words, and who holds it.
- In the List: a pinned group in the Open view.
- Opening one shows its facts and one button, **Open variation** (or claim, or certificate).

**States:** every row of 0008 §5.8 is now reachable, including "Lead not named" and "Contractor has no active account". Each gets a
screen test.

**Words:** 0008 §13's budgets. Popovers carry explanations.

## 5. Build steps (one heavy builder; a light builder in parallel where marked; each step ends shippable)

**Rules for every step** (as in 3a §5; the memory rule allows two builders at most, never two heavy ones, and the dev server stays
off during heavy gates):
- The builder reads `node_modules/next/dist/docs/` for any Next API it touches: route handlers, `params` as a Promise, server
  actions.
- Each step ends with `npm run typecheck`, `npm run lint` and its own tests. The full `npm test` runs at steps 7 and 12.
- A changed existing test is listed in its commit and flagged stricter or faithful. None is weakened.
- **Lock order:** contract, then the `WorkItem` row, then (3b-ii) the `DefectItem` row, then the store's documents in id order.
  The team acts take the contract only.
- **Every act, in order:**
  1. the act-status row;
  2. who may act, on the locked rows;
  3. the pure faults;
  4. the guarded write;
  5. `writeAudit` with before and after;
  6. `writeNotices`;
  7. `act.write` for a staff slot. A contractor act passes no staff attribution; the account column is the record.

  All of it runs in one transaction.
- **Trust boundary:**
  - The supplier is the session's.
  - The body names only a contract, an item reference, words and staged version ids.
  - Every query names the organisation and the contract.
  - An unshared item, another contractor's item or an unknown id all answer 404 with the same words.

### Step 1 — data-modeler: schema, contracts and the scans that move with them

- **Owns:**
  - `prisma/schema.prisma`;
  - the two migrations (§3.1);
  - `bounds.ts`, and only the **additive** parts of `src/lib/work/types.ts`: new types, new fault codes, new views and kinds. The
    `Party` reshaping of `raisedBy` and `assignee` is step 2's, so step 1's typecheck passes.
  - every file in §3.1 "Code that changes with the schema".
- **Done when:**
  - Both migrations apply to a scratch database, and `prisma migrate diff` is empty.
  - `npx prisma generate` and `npm run db:roles` have been run.
  - **Every 3a row reads `sharedAt IS NULL` after the migration** (a db test on a seeded 3a row).
- **Tests:** extend `src/lib/work/schema.db.test.ts`:
  - each new CHECK refuses its bad row;
  - `sharedAt` cannot be cleared or changed;
  - a contractor comment with `internal = true` is refused;
  - a second PM is refused;
  - a `WORK_ITEM_FILE` version cannot be withdrawn while pinned (PA047), but can once detached;
  - the new notice kind inserts.

  These pass unweakened: `supplier-act-slots.test.ts`, `act-slots.test.ts`, `act-wiring-scan.test.ts`, `data-export.test.ts`,
  `owner-check.test.ts` and the act-status tests.

### Step 2 — domain-engineer: the pure rules

- **Owns:**
  - for 3b-i: `src/lib/work/{move,sharing,audience,fields,team,lead,notices,portal,views,labels}.ts` and their tests (§3.4);
  - the `Party` change in `types.ts`, with the faithful edits to 3a's fixtures and tests;
  - the one-line adapters it forces in `store.ts` (`factsOf`, `tell`, `mayLink`) and `load.ts` (`cardOf`), mapping a person
    raiser and assignee to `{ kind: "PERSON", id }`. These change no behaviour; step 3 adds the contractor.
- **Done when:**
  - `npm run typecheck` passes with the whole tree on `Party`;
  - every 3b-i row of §3.4 has its test, including the extended move table;
  - `pure-scan.test.ts` still holds (no `db` outside `store.ts`, `load.ts` and the new `portal-store.ts` and `portal-read.ts`).

### Step 3 — api-engineer: the staff store, the team, and the lead from the team

- **Owns:**
  - `store.ts`:
    - `factsOf` builds parties;
    - `createItem` and a new `shareItem` write `sharedAt`;
    - assigning to the contractor (`editField` on `assignee` with the value "contractor") shares in the same write;
    - `comment` takes an `audience`;
    - Send back writes a Reply where B-2 says;
    - `tell` reads parties and the lead;
    - a new `removeFile` core (detach with a reason; unshared items only; B-6).
  - `load.ts`:
    - card and item fields: shared, contractor assignee and raiser;
    - `assigneeOptions` lists the team first, then the contractor, then the rest;
    - `loadActivity` maps SUPPLIER rows and contractor comments to the awardee's name;
    - `leadOf` reads the team.
  - **Audit words** for the new columns:
    - `FIELD_WORDS` and the audit export's words for `sharedAt` ("Shared"), `assignedToContractor`, `defectItemId` and the team
      changes;
    - an assignee change from a person to the contractor, or back, is written and shown as **one** logical line ("Assignee:
      Hafiz → {contractor}"), never two column lines or a raw key (the 3a §11 owed check of the org-wide audit screen covers it).
  - New `src/lib/work/team-store.ts` and team readers, and their actions in `src/app/projects/[id]/team-actions.ts`.
  - `work-actions.ts`: share, audience, remove file.
  - `lock-order.test.ts`: the team acts.
- **Done when:** each act writes, audits and tells in one transaction, and a refusal leaves nothing.
- **Tests:** extend `work-flow.db.test.ts`:
  - share is one-way;
  - assigning to the contractor shares, and an unshared item refuses a Reply;
  - Send back to a contractor assignee writes a Reply;
  - Remove refuses on a shared item and on a file attached by someone else;
  - the lead is the PM when named;
  - team acts refuse a second PM and audit a removal with its reason.

  Source scans:
  - `internal` comes from `commentAudience`, never a literal;
  - no staff work surface or loader imports `team-read.ts` or `sulitGate`;
  - `ProjectTeamMember` is read by nothing under `src/lib/{approval,certificate,project-docs,delegation}`.

### Step 4 — api-engineer: the portal reader, the contractor's acts, the routes

- **Owns:**
  - `src/lib/work/portal-read.ts`:
    - `loadPortalWork(actor, contractId)` (groups, capped);
    - `loadPortalItem(actor, contractId, ref)`;
    - `portalWaitingRows(actor)`.
    Every item query has `sharedAt: { not: null }`; every comment query has `internal: false`; files are filtered by
    `portalSeesFile`; links show only shared items and documents `contractorMayOpen`; there are no audit rows.
  - `src/lib/work/portal-store.ts`: `raiseAsContractor`, `replyAsContractor`, `moveAsContractor` (Send for checking, Accept
    answer, Ask again), `answerAsContractor`, `attachAsContractor`. Each runs in `inHeldContract`, as B-14 says.
  - Route handlers (`supplierPost`, hand parsing in `src/lib/portal/projects/api.ts`, `refusalReply`):
    - `src/app/supplier/projects/work/{raise,reply,move,answer,attach}/route.ts`;
    - `.../work/upload/route.ts` (staged `STAGED_FOR_WORK_ITEM`, with the `windowRows` throttle);
    - the file download through the existing portal file route pattern, checked with `portalSeesFile`.
  - `loadWaitingForYou`'s callers merge the work rows (the portal home and the project overview).
  - `src/app/_auth/supplier-reach.test.ts`: the new routes.
- **Done when:** a contractor raises, replies, answers, attaches and moves through the routes, and an unshared item, another
  contractor's item and an internal note are each unreachable.
- **Tests:** new `src/lib/work/portal.db.test.ts`:
  - an internal note never appears in any portal reader;
  - a staff file attached before sharing is not listed and not downloadable;
  - an unshared item answers 404 to every route;
  - the contractor's raise is numbered under the lock, shared and assigned per B-16;
  - no time zone answers `DAY_NOT_KNOWN`;
  - the throttle refuses past its bound;
  - the notices go to exactly B-17's people, and no body names the awardee.

  Source scans (`src/lib/work/portal-scan.test.ts`, the `readers-scan.test.ts` pattern):
  - every `workItem` query in `portal-read.ts` and `portal-store.ts` names `sharedAt`;
  - every `workItemComment` read names `internal: false`;
  - no portal reader selects `assigneeSupplierAccountId`.

### Step 5 — frontend-engineer: staff screens for sharing and the contractor

- **Owns:**
  - `work-panel.tsx`, `work-item-panel.tsx`, `work-editors.tsx` and `work-controls.tsx` (§4 staff);
  - `src/components/ui/composer.tsx`: the Reply / Internal note switch, extended in the shared component, never a one-off;
  - `src/components/ui/activity.tsx`: the internal tint;
  - icons: building and lock, in `icons.tsx`.
- **Done when:** a staff member does each of these by mouse and by keyboard:
  - shares an item;
  - assigns to "{contractor}";
  - writes a Reply and an Internal note and sees them apart;
  - removes a file from an unshared item;
  - finds "Waiting on {contractor}".
- **Tests:**
  - a screen test per newly reachable §5.8 state;
  - `text-snapshot` shows no code and no contact name, including an item whose Activity holds a person → "{contractor}" assignee
    change (L3's demo makes one);
  - the composer test shows no switch on an unshared item.
- **Siblings:** compare with the 3a Work tab, Documents and the project document drawer.

### Step 6 — frontend-engineer: the portal's Work tab

- **Owns:**
  - `src/lib/portal/projects/types.ts` (`work` in `PROJECT_TABS`);
  - `src/app/supplier/projects/[id]/page.tsx` (the tab);
  - new `work-panel.tsx`, `work-drawers.tsx` (item, Ask a question, Report an incident) and `work-form.ts` (hand parsing, with a
    test) under `src/app/supplier/projects/[id]/`;
  - `waiting-for-you.tsx` and `src/app/supplier/waiting-card.tsx` (work rows).
- **Done when:** a site agent, by keyboard alone, can:
  - see the three groups;
  - open an item;
  - reply, attach, write an Answer, Send for checking, Accept answer and Ask again;
  - raise an RFI and an incident.
- **Tests:**
  - a screen test per group and per row button;
  - `text-snapshot` of the portal page shows English only and no status code;
  - `supplier-reach.test.ts` passes.
- **Siblings:** compare with the portal's Documents tab and its drawers.

**Light builder, in parallel with steps 4 to 6** (light gates only: typecheck, lint, its own tests):
- **L1.** The Project team card screens in the Team tab, against step 3's actions: the card and three drawers, with a screen test.
- **L2.** `docs/notes/prototype-differences.md` entries: the portal Work tab, the team card, and later My work. Each is a new
  screen, with 0008 as the reason.
- **L3.** `prisma/demo-work.ts` (extend, through the stores, never raw inserts):
  - a team on demo_con3;
  - shared items;
  - two items assigned to the contractor, one of them first assigned to a person and then moved to the contractor;
  - one RFI the contractor raised and staff answered (In review);
  - replies and one internal note;
  - a file attached before and one after sharing.

  The demo contractor needs an active portal account; check, and say so if it lacks one.

### Step 7 — test-engineer, then code-reviewer and security-auditor, then ui-guidelines-reviewer: accept 3b-i

- **Done when:**
  - `demo:wipe` then `demo:load` run clean;
  - the full `npm test`, `typecheck` and `lint` pass with the dev server off;
  - the review findings are fixed, each in its own commit;
  - the sibling check is recorded;
  - the 3b-i lines are in `decisions-log.md`: each OQ answer or default taken, the withdrawal ruling closing the backlog row, and
    acceptance (WS-22).
- **Review focus:**
  - **no internal note, pre-share file or unshared item reaches any portal reader or route;**
  - no contact name on a staff surface or in a notice body;
  - the one-way trigger;
  - organisation and contract scoping;
  - the throttle;
  - the act slots;
  - the lock order.

### Step 8 — api-engineer, then frontend-engineer: My work (3b-ii)

- **Owns:**
  - `src/lib/work/my-work.ts` (step 2's pattern, with tests);
  - `loadMyWork(personId, today)` in `load.ts`: open items assigned to me, plus items I raised that are In review, across
    contracts;
  - `src/app/my-work/page.tsx`;
  - `src/lib/nav.ts` and `nav.test.ts` ("My work" after My approvals, with no count badge, 0008 §3.4).
  - Every work action's revalidation adds `/my-work`.
- **Done when:** a staff member opens My work from the nav, sees their items across two contracts in the six groups, opens one in
  the side panel and moves it, and the row leaves or changes group without a reload.
- **Tests:**
  - exactly 0008 §5.6's set across two contracts (a db test);
  - the time-zone collapse;
  - the address with `contract=` opens the right item when two contracts each hold an "RFI 1".

### Step 9 — api-engineer, then frontend-engineer: linked cards (3b-ii)

- **Owns:**
  - `src/lib/work/linked.ts` (pure, with its table test);
  - `loadLinkedCards(contractId, today)`, reading each register's own state reader. **First grep and record** the variation,
    EOT-claim and certificate state readers and words. The EOT claim has no status column; its state comes from its matter.
  - the Board's dashed cards with no drag, and the List's pinned group.
- **Done when:** on demo_con3, each kind of act in progress shows as a linked card in the right column; opening one leads to its
  register; and nothing of it can be moved from the board.
- **Tests:**
  - a linked card refuses a drag with the act's words;
  - it opens to its register;
  - withdrawn shows for 14 days;
  - `matterRoutedValue` is never read (a scan).

### Step 10 — api-engineer: the defect link (3b-ii)

- **Owns:**
  - `src/lib/work/defect-link.ts` (pure, with tests);
  - the write-through in the defect acts of `closeout-actions.ts` and `defect-store.ts`;
  - linked moves in `store.ts` and `portal-store.ts` that call the defect cores;
  - the CPC multi-select feed;
  - creating a Defect item with its line during the defects liability period (OQ-B12);
  - `lock-order.test.ts`'s contract → WorkItem → DefectItem block.
- **Done when:**
  - every defect act keeps a linked item's status equal to `defectItemStatus` of its line;
  - every move on a linked item goes through a defect act;
  - Phase 2's existing defect tests pass unchanged.
- **Tests (db):**
  - each defect act moves its linked item, and only it;
  - a drag to Done on a linked item calls `acceptDefect` and is refused in its words;
  - `removeCpcDefect` leaves a snag;
  - Reopen is refused;
  - the CPC's frozen lines are untouched;
  - concurrent accept and item edit serialise.

### Step 11 — light builder: the two folds (3b-ii)

- **Owns:**
  - the portal: `defects` becomes Work's **Defects** view (rendering `DefectsPanel` unchanged), and `?tab=defects` is aliased;
  - staff: `CASE_TABS` and `caseTabToStep`, so `documents` becomes a Certificates section of `submissions`, and old `?tab=documents`
    hrefs (including stored `StaffNotice.href` rows) resolve.
- **Done when:** the portal strip has no Defects tab and Work shows the Defects view once the CPC is issued; the staff Project strip
  has no Certificates tab and Documents holds the section; every old address lands on the folded place.
- **Tests:** `case-tabs.test.ts` extended and flagged stricter; every old address lands; a portal alias test.

### Step 12 — data-modeler (demo), then test-engineer, code-reviewer, security-auditor and ui-guidelines-reviewer: accept 3b-ii

- **Owns:** `prisma/demo-work.ts` (extend, through the stores):
  - a CPC on demo_con15 picks two open Defect items;
  - one is reported fixed by the contractor and accepted;
  - linked cards show on demo_con3;
  - My work holds items across two contracts for the demo officer.
- **Done when:** as step 7. `demo:wipe` then `demo:load` run clean; the full gates pass with the dev server off; findings are fixed
  in their own commits; the sibling check is recorded; the 3b-ii log lines are written.
- **Tests:** the full `npm test`. **Review focus:** the defect write-through and its lock order; `matterRoutedValue` never read;
  old addresses; My work's cross-contract scoping.

## 6. Checks before each acceptance (WS-22)

- [ ] Demo data through `demo:load` (L3, and the step 12 demo).
- [ ] `npm test`, `npm run typecheck`, `npm run lint`.
- [ ] The sibling-screen check, with `text-snapshot` diffs: staff Work, portal project page, Team tab.
- [ ] The lines in `docs/notes/decisions-log.md`, including closing the backlog row on withdrawal.

## 7. Deliberately not done in 3b

- **The per-account assignee and contractor contact names on staff surfaces.** WS-9 leaves the column unwritten, and WS-10 is
  open. 3b does not depend on either (B-4).
- **Item → act links and "Start a variation" from an SI** (OQ-B11). Linked cards show the act, but no link row is written.
- **"Raise item" from a diary entry, an observation or a meeting** (OQ-B13, 3a's OQ-9).
- **A Board on My work and on the portal** (WS-13, OQ-B10).
- **Unsharing, editing or deleting a comment, and removing a file from a shared item** (B-1, B-6).
- **Due tomorrow / Late notices, email, and a contractor bell** (OQ-5, PW-13).
- **RFI and SI response days** (unchanged from 3a §7).
- **A routine site meeting record** (0008 §3.5).

## 8. Open questions for the product owner (each with the default 3b builds on if unanswered)

| # | Question | Default |
|---|---|---|
| OQ-B1 | Ship 3b in two accepted parts (3b-i: contractor side and team; 3b-ii: My work, linked cards, defect link, folds)? | **Yes.** 3b-i first. WS-23's order is kept: 4a starts after 3b-ii. |
| OQ-B2 | What is shared on create? 0008 §4.1 shares RFI, SI, Inspection and Defect by default. | **The New item drawer presets the toggle by type, and staff may switch it off before creating. Quick add never shares. Assigning to "{contractor}" shares.** No 3a item is shared by the migration. |
| OQ-B3 | Does the contractor see files attached before the item was shared? | **No.** It sees its own files and files attached at or after sharing. On a shared item, an internal note carries no file. |
| OQ-B4 | **(Backlog row)** May a work item's file be withdrawn once 3b shares item files? | **No, for every live item file** (PA047 widened, unconditional). A file attached by mistake to an **unshared** item is removed (detached) with a reason by whoever attached it or the lead, and may then be withdrawn. On a shared item nothing is removed; a correction is a new file and a reply. |
| OQ-B5 | May an Inspection go to In review before it has Passed? The founder answered 3a's OQ-8 "no" on 2026-10-29, and under that rule an NCR assigned to the contractor cannot be sent for checking. | **Departure: needs an explicit yes.** Recommended: In review needs nothing on an Inspection (it reads "ready for inspection"), and Done still needs Passed, as one rule for every assignee. **If unanswered, OQ-8 stands.** The NCR then closes by a workaround: the contractor replies "ready", the raiser reassigns the item to themselves, sets Passed, and uses the shortcut. The move table and its test are built for whichever answer holds. |
| OQ-B6 | May the contractor write the Answer of an RFI assigned to it? | **Yes.** It is the only field the contractor edits. |
| OQ-B7 | Who may change the Project team card? | **The lead (the PM, else the S.O. holders).** With no lead, any staff member who may read the case, so the first PM can be named. Every change is audited, and a removal asks a reason. |
| OQ-B8 | The default assignee when the role has several holders (several Contract administrators) or the lead is several S.O. holders | **Unassigned, and every holder is told.** One holder is assigned; none means the lead is told. |
| OQ-B9 | The composer's default on a shared item. 0008 §4.5 says Reply; §14 test 2 names Internal as the fallback if staff leak. | **Departure from 0008: needs an explicit yes.** Recommended: Reply when the contractor is party (it raised the item or holds it), Internal note otherwise, because it is safer. **If unanswered, 0008 §4.5 stands:** Reply is the default on every shared item, and §14 test 2 decides later. Either way it is one constant in `audience.ts`. |
| OQ-B10 | My work: List and Board (0008 §5.6), or List only? | **List only in 3b.** A Board on My work needs cross-contract moves and addresses. Revisit after 0008 §14 test 1. |
| OQ-B11 | Item → act links and "Start a variation" from an SI with Impact Cost (0008 §4.6). WS-15 names only "linked cards". | **Deferred.** 3b shows linked cards. Linking an item to an act needs new link targets, and the variation drawer prefill is its own change. |
| OQ-B12 | A Defect item during the defects liability period: refuse it (3a's OQ-4), or create its line in the same act? | **Create the item and its line in one act** under `reportDefect`'s rules, which lifts OQ-4's refusal. Before PC it is a snag. At CPC raise, open snags are offered to the list. |
| OQ-B13 | "Raise item" from a diary entry, observation or meeting record (3a OQ-9 proposed it for 3b) | **Not in 3b.** An Action's "From" document covers meetings. A `sourceEntity` link is a later stage if users ask. |
| WS-10 | Contractor contact names: the founder's call | **Still open; 3b does not depend on it.** Staff see "{contractor}" (the awardee's name). The account id is stored on every contractor act, so a later yes changes one label function, not the schema (B-4). |

## 9. The rulings and where each lands in 3b

| Ruling | Where |
|---|---|
| WS-3 | B-12, B-13, B-16; step 3; L1 |
| WS-5 | B-19; step 11 |
| WS-9 | B-4, B-5, B-7: the company assignee; the per-account column still unwritten |
| WS-10 | B-4; §8 (not depended on) |
| WS-11 | `portalStaffLabel` (§3.4); step 6 |
| WS-13 | §4 portal: list only, modal drawer; the staff panel unchanged |
| WS-14 | B-1: no backfill, so every 3a item stays unshared |
| WS-15 | §1: the whole 3b list, split by OQ-B1 |
| WS-16 | B-19: linked cards always show, with no toggle; still no bulk actions |
| WS-17 | B-17: no watchers; the lead on contractor-raised items; no date notices |
| WS-19 | Portal lateness and My work groups not judged with no time zone |
| WS-22 | Steps 7 and 12; §6 |
| WS-23 | OQ-B1 keeps the order: 4a after 3b-ii |
| WS-24 | §3.3 and §3.4: the move table extended with table tests; nothing stored for overdue |
| Open (rulings) | §0 re-check row; B-18 maps all seven defect acts |
| WS-2, WS-4, WS-6 to WS-8, WS-20, WS-21 | Not 3b's (appendix) |

## 10. Risks

- **A leak is the one failure 3b cannot take back** (sharing is one-way, and approvals here carry legal weight). It is held by:
  - stored sharing with no backfill;
  - the query-level filters;
  - two source scans and a db test per path;
  - the security auditor's focus in step 7.
- **`Party` reaches every 3a test.** The edit is mechanical but wide. It is flagged faithful file by file, and no expected value
  changes.
- **The contract lock now serialises contractor acts as well.** A contractor's upload is staged outside the lock, as ADR 0042 D8
  requires.
- **No time zone shuts the portal's work acts** (`DAY_NOT_KNOWN`). This is consistent with every portal act, but a customer that has
  not set a zone will see the contractor refused. The setup checklist already names the zone.
- **Defect write-through touches Phase 2's acts** (step 10). Their existing tests must pass unchanged, and only new assertions
  are added.
- **Size.** 3b is about twice 3a. OQ-B1's split keeps each acceptance a 3a-sized review.

---

## Appendix A. Sketch: 4a, the timeline (from data the system already holds)

**Held today:**
- `WorkProgramme`: revisions per contract (`revision`, `kind`), scrutiny, and `decision` (APPROVED / RETURNED) with
  `decidedOn`;
- `ProgrammePoint` (planned % by day) and `ProgressRecord` (actual % by day), from which the In Delay reading comes (FR-SUP-010);
- `ProgrammeDirection`;
- the EOT claims against a revision, and `ExtensionOfTime`;
- the contract's completion date and its extended one;
- Phase 2's Time tab.

**What 4a adds** (WS-20 cuts Compare, the planned-curve fill, the n% hint and virtualisation):
- **`ProgrammeActivity`:**
  - columns: `organisationId`, `programmeId` (FK WorkProgramme), `key` (stable across revisions, so progress carries over and a
    later MS Project import can key on the file's id), `name`, `parentKey?`, `startOn`, `finishOn`, `milestone`, `sortOrder`;
  - unique (`programmeId`, `key`).
- **`ProgrammeDependency`:** finish-to-start, with an optional lag in days, between two activities of one revision.
- **The freeze.** A trigger refuses any insert, update or delete of activities and dependencies once their revision's
  `decision = 'APPROVED'`. Check the approved value and the decision act before writing it. That revision is the baseline, and
  "in force" is the latest approved.
- **`ActivityProgress`:**
  - columns: `organisationId`, `contractId`, `activityKey`, `actualStartOn?`, `pctComplete Decimal`, `actualFinishOn?`,
    `forecastFinishOn?`, `recordedByPersonId`, `recordedAt`;
  - keyed on the activity key, not the revision's row, so a new revision carries progress by key;
  - **staff only** (WS-6).
- **`WorkItemLink + activityKey?`:** items linked to an activity, and the Gantt's "n open" dot.
- **`ExtensionOfTime` and the completion dates** become markers. They are read, never copied.
- **Not touched:** `ProgrammePoint`, `ProgressRecord`, and the In Delay reading. **A regression test pins In Delay for every demo
  contract before and after 4a.**
- **Tab and portal:**
  - Time becomes Timeline through `caseTabToStep`'s alias, and the Programme card moves from Site;
  - the portal's Programme tab shows the in-force Gantt, read-only.
- **Payment amounts on milestones** are 4b's. 4a leaves no column for them.
- **Open for 4a's plan:**
  - what "Copy from Revision n" copies when the revision in force has no activities;
  - whether a returned revision's activities stay readable (default: yes, read-only).

## Appendix B. Sketch: 4b, the budget card, the stat row, payment milestones and funding by source

**Held today:**
- **Contract money:** `Contract.contractSum` (Decimal); issued adjustments (`readIssuedAdjustments`); issued payable certificates
  and their figures; finance payments.
- **Phase 1's readings:** `src/lib/funding/proceeds.ts` (`contractFigures` → Committed, Certified, Paid; `proceedsBySource`), and
  the split `FundingAllocation.sharePct` with `splitSen`, so the rows add to the card to the sen.
- **Variations:** each variation's valued amount as the Variations tab shows it (WS-2: never `matterRoutedValue`).
- **Who may read:** `mayReadBudget` (`src/lib/insights/query.ts:107`; WS-8).
- **Work counts:** 3a/3b's `workWhere`, giving open and late items.
- **Progress:** In Delay and the progress percentage.
- **Time:** days left and EOT days, from the time records.
- **Payment routes:** `ContractType.paymentRoute` is `PaymentRoute?`, which holds CERTIFIED_CLAIM and DELIVERY_ORDER_INVOICE.

**What 4b adds:**
- **The stat row and the budget card on Overview.** Both are composed only from those readers. There are no new money columns.
- **Forecast final** = Committed + approved not yet adjusted + in approval, tagged **Assumed** (WS-2).
- **The two summary cards are replaced only on a clean text-snapshot diff** (WS-7).
- **`PaymentRoute` gains `MILESTONE`.** It is an `ALTER TYPE … ADD VALUE` migration of its own. The RSAJ pack sets none (WS-4),
  and unset reads "How this contract is paid: Not set".
- **Payment milestones** are 4a's milestone activities plus an amount. That is a `PaymentMilestone` row keyed on (`contractId`,
  `activityKey`) with `amount Decimal(18,2)`, changed only by a revision or an adjustment.
  - Their state (Not due → Due → Achieved → Claimed → Certified → Paid) is read from claims, certificates and payments, never
    stored twice.
  - "Achieved" is the one new recorded fact: a day, evidence and the person, audited.
  - The plan must state how FS-8's *certified* counts this route, so the card and Use of proceeds stay equal.
- **By funding source:** a small `DataList` over the existing split. With no split recorded, it reads "From the requisition:
  {source} 100%".
- **By cost category stays gated** on Finance decisions 3 and 4.

**RSAJ data, now loaded in a separate RSAJ organisation:**
- **What is loaded:** cost centres (`CostCentre`), main accounts (`AccountCode`) and funding sources (`FundingSource`), with no
  budget codes yet.
- **These are not PS-04's cost categories.** Cost centres and main accounts are the finance posting axes, while PS-04 maps BQ
  sections to cost categories. 4b must not map one onto the other.
- **Where they help:** "By funding source" can show RSAJ's real source names. A requisition's `costCentreCode` and `accountCode`
  can be shown as facts on the card's popover.
- **What reads "Not set", never zero:**
  - `Requisition.budgetCodeId`, which is null in RSAJ until budget codes are loaded;
  - a source's `envelope`, where it is null.
- **Demo data** for 4b goes into the demo organisation. **No RSAJ row is copied into a seed** (AGENTS.md: no customer's data
  ships).

## Handoff log (built, 2026-10-30)

- **Step 1** (`d5c4c2b8`, `61597d24`): migrations `20261210001100_work_items_shared`, `20261210001200_project_team`. Assigning to the
  contractor is ONE UPDATE (flag on, `assigneePersonId` null, `sharedAt` only if unset); sharing a shared item is a no-op (PA055);
  a Reply needs `sharedAt` ≤ `recordedAt` (PA056). Step 3 removes `ProjectTeamMember.addedBy` from `NOT_BUILT`. Step 6 flips
  `WorkItem.answer` in `data-export-fields.ts` to IN. Step 10: `defectItemId` FK is Restrict — clear it before deleting a `DefectItem`.
- **Step 2** (`e1be2bd1`, `cce3d78f`): parties (`party.ts`; never compare parties with `===`), `sharing.ts`, `audience.ts`,
  `team.ts`, `portal.ts`. For step 3: lift the `NOT_YET_SHARED` guard in `store.ts` when the audited share lands (audit `sharedAt`
  with the assignee change as one line); fix `editField`'s no-change check to compare parties (unassigning a contractor-held item is
  skipped today); pass the real team and `activeIds` to `leadIds`/`tell`; `whoNamesOf` names a contractor raiser with
  `contractorActorWords(awardeeName)`; comments use `commentAudience` + `audienceFaults` instead of literal `internal: true`;
  `removeFileFaults` needs caller-built who-can words; add `TeamFault` words to `labels.ts`; seed `FIXTURE_CONTRACTOR_ITEMS` in the
  views db test and add the `contractor` view and new filters. For step 4: buttons from `portalAction`, moves from
  `contractorActions`, groups from `portalGroup`, staff names from `portalStaffLabel`; `portalSeesFile(file, sharedAt)`;
  `defaultAssignee(...).told` feeds `roleHolders`; contractor acts go through `moveFaults`/`fieldFaults`/`contractorRaiseFaults`
  with `side: "CONTRACTOR"`.
- **Step 3** (`4baf33f4`; staff side): `store.ts` gains `shareItem` and `removeFile`; the share guard is lifted. Assigning to the
  contractor, a create with the toggle on and `shareItem` all write `sharedAt` and audit it. For step 4 and step 5:
  - **Audit encoding (one logical line).** An assignee change is ONE `assigneePersonId` change whose value is a person id or the token
    `CONTRACTOR_ASSIGNEE` ("contractor"), plus a `sharedAt` change (ISO string) when it shares. Never a second `assignedToContractor` line.
    Activity maps the token to the awardee's name; the org-wide audit screen and the CSV export read it as "The contractor" (`CONTRACTOR_AUDIT_WORDS`:
    those surfaces know no contract). If the founder wants the awardee's name there, the export needs a contract lookup per row.
  - **`attachedAt` is now `c.now` (second precision) in `attachFiles`, and `shareInstant` pushes a share one second past the item's latest live file**
    when that file was attached in the share's own second. Without it a file attached earlier in the same second as the share read as attached
    after it and leaked (found by the db test). Step 4's contractor attach should write `attachedAt: c.now` too (its files are always seen, so it is
    only for consistency). A file attached in the share's own second may read as before it and stay staff-only: the safe side.
  - **`comment(c, who, { itemId, body, audience })`**: `audience` is `REPLY`, `INTERNAL` or null (null on an unshared item is internal; on a shared
    one the default `DEFAULT_AUDIENCE`). A Reply asked for on an unshared item is REFUSED ("Share it first, or write an internal note."), not kept
    internal. The audience it becomes is also judged against `sharedAt` (PA056). The edge parses `audience` strictly: anything else is UNREADABLE.
  - **Send back** writes a Reply only where `commentAudience(..., "SEND_BACK")` says (the contractor holds the item); `internal` is always
    `audience === "INTERNAL"`, never a literal (the work-wiring scan holds it).
  - **`removeFile`**: attacher = `version.recordedByPersonId` (true by construction: `attachFiles` pins only the actor's own staged versions). The
    audit is `detached(...)` under the item's label with the reason; Activity says "removed a file". `WorkFileView` gains `attachedByPersonId` and
    `seenByContractor` for step 5.
  - **The lead**: `leadOf` reads `ProjectTeamMember` first (an inactive manager is not the lead, WB-7), no time zone needed; the label is "Project
    manager". With no manager it is the S.O. as in 3a. NOTE for tests: `activeContract` always has an S.O. in force (`org.so`), so the S.O. is the
    lead until a manager is named, and ~~the manager replaces the S.O. as the one who changes the team~~ [SUPERSEDED by WSEC-2: the S.O. keeps the right to
    change the team once a manager is named, and a contract with no lead has nobody who may change it]; a no-lead contract is made by deleting its
    `contractSoAssignment`.
  - **Team**: `team-store.ts` (`addTeamMember`, `removeTeamMember`, `changeProjectManager`; contract lock only, `PROJECT_TEAM` row asked first) and
    `src/app/projects/[id]/team-actions.ts` (`addTeamMemberAction`, `removeTeamMemberAction`, `changeProjectManagerAction`; fields `contractId`,
    `role`, `personId`, `reason`). Audit rows hold role words and the person's NAME (never an id). Readers: `loadTeamMembers`, `loadTeamCard`,
    `assigneeOptions({ organisationId, contractId })` (groups TEAM, CONTRACTOR, EVERYONE; the contractor's value is "contractor"). The panels still call
    `assigneeOptions` without `contractId`, so the contractor is NOT yet in the dropdown: step 5 passes `contractId` together with the WB-2 confirm.
  - **Not exported on purpose: `lockedItem`.** `lock-order.test.ts`'s `actions()` treats every exported async function of `store.ts` as a core and the
    scans there assert each locks via `lockedItem(c, i.itemId)`. Step 4 exports it from `store.ts` and changes that helper's assumption in the
    same commit (or moves the item lock to a small shared module), flagged stricter.
  - `whoNamesOf(client, orgId, row, lead, contractorName?)` reads a contractor raiser (no person) and `assignedToContractor`; the store uses
    `whoNamesIn(c, ...)` so `store.ts` never names the awardee (the notice-body scan bans the word there). `work-item-panel.tsx` passes
    `assignedToContractor` (one line, compile-only).
  - Tests: the 3a scan "every comment insert passes `internal: true`" is replaced by a stricter one (flagged in the commit); `work-flow.db.test.ts`
    holds the share, the audience, the file removal, the team and lead, and the contractor rows of the views.
- **Step 4** (the portal readers, the contractor's acts, the routes; `src/lib/work/portal-read.ts`, `portal-store.ts`, `src/lib/portal/projects/work-api.ts`, `src/app/supplier/projects/work/**`). For step 5 and step 6:
  - **Readers** (`portal-read.ts`): `loadPortalWork(actor, contractId, now?)` → `{ orgName, today, canAct, groups[3] }` (each `{ group, total, more, rows }`, capped at `PORTAL_ROWS_PER_GROUP`; a row is `{ ref, type, title, status, dueOn, late, group, action, heldBy, raisedByYou }`); `loadPortalItem(actor, contractId, ref)` → the row plus `description, location, answer, severity, happenedAt, moves, mayAnswer, comments[], files[], orgName, canAct` (null = the one 404); `findWorkFile` (the download's lookup, applies `portalSeesFile`); `portalWaitingRows(actor, { contractId? })` → rows in the shape of a `WaitingRow`. `status` is returned raw so step 6 words it ("Sent to {org} for checking", "Sent back to you: see the reply"): the portal words for status are NOT built. `moves` are `WorkAction`s (`SEND_FOR_REVIEW` = Send for checking, `MARK_DONE` = Accept answer, `SEND_BACK` = Ask again); the route's `action` field takes the PortalAction names `SEND_FOR_CHECKING`, `ACCEPT_ANSWER`, `ASK_AGAIN`. The portal drawer holds no links (not selected, scan-pinned), no audit, no internal fields.
  - **Routes** (all JSON `POST`, form purpose `projects`, token in the body as for the other portal posts; constants `SUPPLIER_PROJECT_WORK_POSTS` / `SUPPLIER_PROJECT_WORK_FILE` in `lib/auth/routes.ts`): `/supplier/projects/work/raise` (`contractId, type RFI|SAFETY_INCIDENT, title, description?, location?, dueOn?, severity?, happenedAt? "YYYY-MM-DDTHH:mm", stagedVersionIds?` → 201 `{ref}`), `reply` (`contractId, item, body`), `move` (`contractId, item, action, expectedFrom, comment?`), `answer` (`contractId, item, answer`), `attach` (`contractId, item, stagedVersionIds`), `upload` (multipart `file`, `?contractId=`, header `x-form-token`; stages `STAGED_FOR_WORK_ITEM`; answers `{ versionId }`), and `GET work/file/[attachmentId]?t=<token>` (`workFileHref`). Errors are `{ ok:false, code, message, errors? }`: 400 VALIDATION (field-level `errors`; unknown fields refused), 404 NOT_FOUND (one body), 409 CHANGED, 422 VALIDATION, 429 THROTTLED. `item` is the reference ("RFI-12"); the page address for an item is `workItemPortalHref(contractId, ref)` = `/supplier/projects/{id}?tab=work&item=RFI-12` (the `work` tab is step 6's).
  - **Merged already:** `waiting-card.tsx` and the Overview panel in `panels.tsx` append `portalWaitingRows` after the documents (hrefs point at `?tab=work&item=...`, which land on Overview until step 6 adds the tab). The rows reuse `WaitingRow` keys (`documentId: "work-{id}"`), so `WaitingList` needed no change.
  - **Staff side:** `load.ts` gains `contractorHasActiveAccount(client, l)` (an ACTIVE `SupplierAccount` of the awardee's supplier), tested in `portal.db.test.ts` but with NO caller yet: step 5 (already committed, 2e2a8922) did not call it, so the "No active portal account" chip is still to be wired by step 6 or the step 7 review. `store.ts` exports `factsOf`, `ItemRow`, and (as `export { lockedItem }`, not `export async function`, so the lock-order scan still counts nine cores) `lockedItem`; `WorkRefused` now allows 429. `labels.ts` gains `portalMoveFaultText` (refusals naming no staff, no status). `portal.ts` gains `portalWhere(group)` (the database's `portalGroup`; "Waiting for you" is `workWhere("contractor")`).
  - **Facts the screens must respect:** a refusal message is already contractor-safe words and may be shown as is. A Reply in the one second after a pushed `sharedAt` is refused with "This is not ready for replies yet. Try again in a moment." (422). Replies on a closed item are allowed (as staff's are); the row button there is Open. The contractor can send an Inspection it holds for checking only if staff have already set Passed (the route allows what `moveFaults` allows; the row offers Reply, WB-5). With no time zone every act is refused, and the answer is the standing bar's words (`SUPPLIER_STANDING_BARS`: `portalStandingBarOf` cannot judge without a zone and is asked before the day), never "dates not set up"; that holds for every portal act, not only work, and step 7 should look at it. `canAct` on the readers is false in that case, for the screen. Nothing is written. A work upload counts in the account's workspace window (60 files, 256 MiB an hour).
  - **Throttle:** 20 raises / 100 replies per account per 60 minutes, counted from the rows, under a lock on the account's row (order: contract, item, account, documents). Ask again's comment counts as a reply.
  - **Not done, proposed:** idempotency keys. There is no key store and the schema has no column for one, so a retried raise or reply writes twice (notices are keyed by the audit or comment id and are not duplicated per row, but a second row is a second row). The throttle bounds it. Propose a `requestId` on `WorkItem` and `WorkItemComment` (unique per account) as a small migration before go-live. The routes could not be exercised against the live server: supplier routes answer only on the public copy (`PORTAL_SURFACE=public`), and the dev server on :3000 is the internal copy; the five JSON routes are exercised through `work/handlers.test.ts` (bare `Request`s) and the cores through `portal.db.test.ts` (real database, including `storeProjectFile` with `STAGED_FOR_WORK_ITEM` then attach then `findWorkFile`). The upload and download routes themselves are covered by `supplier-work-reach.test.ts` (scan) and their lookups by the db test, not run as routes.
- **Step 6** (the portal Work tab; `src/app/supplier/projects/[id]/work-{panel,drawers}.tsx`, `work-form.ts`, `work-screen.test.ts`). For step 7:
  - **Built:** `work` is in `PROJECT_TABS` (after Overview); the page loads `loadPortalWork` only on `?tab=work` and `loadPortalItem` only with `&item=RFI-n` (the address Waiting-for-you rows already use). "Ask a question" (primary, required "Answer needed by") and "Report an incident" are the PageHeader actions (blocked with the reason when `canAct` is false). Groups: Waiting for you and With {org} always drawn; Closed is a link `&closed=1` with its count, drawn only when non-empty, and the list appears below with "Hide closed". A group cut by `PORTAL_ROWS_PER_GROUP` says "Showing the first N of M." Each row is a `link` cell whose text is the `portalAction` word and which opens the item drawer (DataList has no button cell; the drawer's top button does the act). `portalStatusWords` (labels.ts) words the standing ("Sent to {org} for checking", "Sent back to you: see the reply", "With {name}", "Closed"). The drawer: facts, Answer (editable only when `mayAnswer` and the contractor can act, WB-6; read only otherwise), Files (download links + add/Attach), Replies only + "Your reply"/Send; the row's one button at the top (Send for checking / Accept answer post `move`; Reply focuses the box), with Ask again beside Accept answer, using the reply box as its required comment. `WorkItemDrawer` and `RaiseDrawer` post with `postBids` and `stageFiles` (now exported from `document-drawers.tsx` with a `route` argument) to `SUPPLIER_PROJECT_WORK_POSTS`.
  - `WorkItem.answer` is IN in `data-export-fields.ts`. The staff assignee select shows the warn chip "No active portal account" (`contractorHasActiveAccount`, called in `work-item-panel.tsx`) when the contractor is the assignee; the New item drawer and the list's picker do not show it. The staff prototype-differences entry is trimmed to match (building icon only in the item panel; attach is its own Files section, not tied to Reply). The portal entry's guard is now `work-screen.test.ts`.
  - **To check in step 7:** (1) the screens were rendered only as markup in tests, not loaded in a browser: supplier routes answer only on the public copy, so run the public copy and walk Work at 1280 and 1600 (keyboard path: row link, drawer, Escape, Send, Ask again, Raise). (2) The drawer has no focus trap (the Documents drawers have none either). (3) Dates in the drawer use `formatDate` (the readers return instants, no zone), so a reply near midnight can read as the neighbouring day: if that matters, `PortalWork` needs the organisation's zone. (4) The Closed link (`closed=1`) is the only address state beyond `item`. (5) Idempotency of retried raises is still the open step-4 proposal.
- **Security fix pass** (WSEC-1 to WSEC-10, `rulings/workspace-3b-security-rulings.md`; migration `20261210001300_work_item_file_pin`, PA057). Built in the order of the rulings:
  - **WSEC-1.** `commentAudience` returns INTERNAL for a missing choice (the composer still presets Reply). `comment` and `attachFiles` take `expectedShared` (required; the edge posts `expectedShared` "yes"/"no", anything else is UNREADABLE) and refuse 409 "This item was shared a moment ago. Check before sending." when the locked row differs (`staleShare`, after `lockedItem`). The demo wrapper reads the item's own state. db tests: stale comment, stale attach, and a share racing each.
  - **WSEC-2.** `teamChangerIds` (lead.ts) = active PM plus S.O. holders and acting holders in force (not `leadIds`, which is the PM alone once named); `teamChangeFaults`/`teamFaults(..., changerIds)` (team.ts); `teamChangersOf` (load.ts) feeds `team-store.judged` and the card, so they cannot drift. `teamFaultText(f, changers)` names the PM and the S.O., or says nobody can and what to set (`TEAM_LOCKED_WORDS`). The step-3 note above that the manager replaces the S.O. is superseded. The demo names its PM through the S.O. in force, unchanged (not run here).
  - **WSEC-3.** `PortalRow.label` and `itemRefText` everywhere a screen prints a reference; the address form stays in hrefs and bodies; Activity link lines turn "RFI-12" into "RFI 12". ADR 0049 has the consequence; backlog row for a separate portal number.
  - **WSEC-4.** The Send back drawer shows "{contractor} will see this." (a `note` field) when `commentAudience(..., "SEND_BACK")` is a Reply (`sendBackSeenBy`).
  - **WSEC-5.** `contractorMayPost` (portal.ts) in the reply, attach and answer cores; MoveFault `ITEM_CLOSED` with contractor-safe words ("This is closed. If something is still open, raise a new item."); `PortalItem.mayPost`; the drawer draws no reply box, picker or answer field on a closed item. CORRECTS the step-4 fact above: replies on a closed item are now refused.
  - **WSEC-6.** `scanLabel` on staff and portal item files (existing chip); the two malware backlog rows name contractor uploads to work items.
  - **WSEC-7.** The throttle counts per supplier per contract under the contract lock (no account-row lock any more: `lock-order.test.ts` and `portal-scan.test.ts` are changed to match, stricter); an answer edit counts as a reply, counted from its audit row (actor account of the supplier, an RFI of the contract, a change to `answer`). Work staging (`windowRows(..., "SUPPLIER")`, preflight and locked hook) is the company's window and locks the supplier's account rows in id order; project-document staging is unchanged (per account).
  - **WSEC-8.** Team card popover "{contractor} may see these names on shared items."; ADR 0049; backlog PDPA data-map row; RSAJ question 48.
  - **WSEC-9.** `answerIsDraft` + a "Draft" badge with popover on the staff Answer. The Done shortcut was already NOT_A_MOVE for everyone while the contractor holds the item (pinned in `move.test.ts` and now through the action in `work-flow.db.test.ts`). Closing an RFI (staff or contractor) records `answerAccepted: none -> the text` on the move's audit row (`answerAcceptedBy`; Activity says "Answer accepted").
  - **WSEC-10.** L1 waiting key `work-{contractId}-{ref}`; L2 the supplier export gives `sharedAt` as "Shared on" for staff-raised items (`WorkItem.sharedAt` is IN in the export columns); L3 `PORTAL_ORDER_BY` has no priority; L5 the trigger `DocumentAttachment_work_item_file_pinned` (attachedAt and workItemId immutable; no first detach once the item is shared; PA057), applied to the dev database after a pg_dump backup; L6 "Visible to {contractor}".
  - **Small.** The "No active portal account" chip now shows in the New item drawer (new `flag` on the record editor's select) and on the list's assignee picker (`flag` on the select cell); the tab reads `contractorHasActiveAccount` once. `PortalWork.timeZone` and `formatOrgDateTime` for the drawer's replies, files and happened-at.
  - **Not done / still open:** idempotency keys on portal raise and reply (unchanged); the audit screen's entity label still holds the address form ("Work item RFI-12 · ..."); the staff download of a work-item file does not yet refuse an unscanned file (go-live, backlog); browser walk of the public copy still owed (step 7 item 1). The step-6 note "To check (3)" (zone in the drawer) is done.
- **Step 8** (My work, list only, WB-10; `src/lib/work/my-work.ts`, `loadMyWork` in `load.ts`, `src/app/my-work/{page,item-panel,loading}.tsx`). For steps 9 and 10:
  - **Pure** (`my-work.ts`): `myWorkGroup(item, me, today)` (null = not on me), `myWorkWhere(me)`, `MY_WORK_SECTIONS`/`MY_WORK_WORDS`, `parseMyWorkAddress`/`myWorkHref` (`/my-work?contract={id}&item=RFI-12`; an item with no contract names nothing). To check = raised by me and In review (wins over any date); otherwise open and assigned to me. With no time zone every dated item is one section, "Open" (an added `MyWorkSection = MyWorkGroup | "OPEN"`; `types.ts` is unchanged); No date and To check stay. `loadMyWork({ organisationId, personId, today })` is organisation-scoped; it takes `MY_WORK_CAP` (500) rows by due day and returns `more`. Every contract of the organisation is readable to its staff (a contract is never HIDDEN, only CONTRACT_STAGES_ONLY), so there is no per-contract filter; the project is shown as "Contract {number} · {awardee}", never the exercise's title, which a restricted exercise withholds.
  - **Panel reuse:** `WorkItemPanel` now takes `hrefs: { close, item(ref) }` in place of `q` and an optional `project` (My work names it in the header with a link to the Work tab). `MyWorkItemPanel` wraps it in the WORK_ITEM `ActGate` and reads only the one contract the address names, asked by the organisation; another organisation's contract reads as "Item not found", like a missing item. `inContract` in `work-actions.ts` revalidates `/my-work` on both the success and the refusal path (portal acts are not wired: they change another client's page). Nav: "My work" after My approvals, clipboard icon, no count (`worklist.ts` is untouched); the crumb map has `my-work`.
  - **Not done:** the mock's Search/Project/Type toolbar and the Board (WB-10 cut the Board); the list has no pager (500 cap, "Showing the first N of M"). Linked cards (step 9) are not on My work: formal acts wait in My approvals. Tests: `my-work.test.ts` (groups, collapse, address), the "My work" block in `work-flow.db.test.ts` (the set across two contracts, the in-memory rule agrees with the database, a move changes the group, the same reference in two contracts), `my-work-screen.test.ts`. Not walked in a browser here.
- **Step 9** (linked cards, B-19, WB-11; `src/lib/work/linked.ts`, `linked/load.ts`, `src/app/projects/[id]/work-linked.tsx`). For steps 10 to 12:
  - **Readers reused, none restated:** variations `loadVariations` + `factsOf` + `stageOf` (`Stage`, `STAGE_WORDS`); EOT claims `loadMatters` + `claimStateFactsOf` + `eotClaimState` (`EOT_STATE_WORDS`; no status column, the state comes from the matter); certificates `Certificate.status` with `STATUS_WORDS` and `KIND_WORDS`. `linkedCardColumn(state, decidedOn, today)` places a register's own state through three exhaustive tables (a new state fails to compile until placed); decided or withdrawn shows in Done for 14 days through the board's `closedRecently`. Certificates drawn: interim payment, sum adjustment, non-completion, practical completion, making good defects, final (`LINKED_CERTIFICATE_KINDS`); a variation's and a claim's own certificates are shown by their act. `matterRoutedValue` is never read (scan in `linked.test.ts`).
  - **Screens:** Board: dashed cards with the chain icon (`BoardCard.linked`), no drag, the act's words in the info popover. List: a pinned group above page 1, capped by `LINKED_CARDS_PINNED`, with "The board has the rest". Both show only in the Open view with no filter or search (a type or assignee filter says nothing of an act). A card opens `?tab=work&act=VARIATION:{id}` (a new `WorkQuery.act`, never held with `item`) to `LinkedCardPanel`: state, column, date and one button, Open variation / claim / certificate, to the register. The panel is reached only from `WorkPanel`, so it is `GATED_BY_PARENT` in `act-status-screens.test.ts`; My work and the portal have no linked cards.
  - **Not done:** "who holds it" and the act's clock (the certification or assessment period): the cards carry the register's state words and the day it was decided only. A card older than 14 days that is opened by address reads "Not on the board".
  - **3b-i review leftovers, done here:** the radio `Segment` roves with the arrow keys; the portal item drawer closes with `router.push` like the staff panel (Back reopens the item); Accept answer asks first (the contractor cannot reopen); the item panel's link rows print `WorkLinkView.target.label` (`itemRefText`, from the loader); the Documents and award drawers' Send is no longer greyed by `canSend` (it says what is missing and focuses the first empty required field).
- **Step 10** (the defect link, B-18, WB-12; no migration: the column, the unique index and the CHECK were step 1's). For steps 9, 11 and 12:
  - **Where it lives.** Pure: `src/lib/work/defect-link.ts` (`defectItemStatus`, `stateAfter`, `linkedItemPatch`, `defectActOf`, `defectLineText`, `linkedMoveWords`). DB: `src/lib/work/defect-link-store.ts` (`lockLinkedItem`, `writeThrough`, `linkItem`, `unlinkItem`; allowed in `pure-scan.test.ts`). The defect acts are now cores that take a locked contract: `src/lib/closeout/defect-acts.ts` (`recordDefectAct`, `reportDefectLine`, `addLinesFromItems`), and `portal/projects/defect-store.ts` gained `rectifyWithin`; `closeout-actions.ts` and `reportRectifiedAsContractor` are thin wrappers, so Phase 2's tests pass unchanged. A core asks the DEFECTS row itself.
  - **Lock order** contract, WorkItem, DefectItem, held by a new block in `lock-order.test.ts`. A linked move: the edge (`moveWorkItem`) reads `isLinkedItem` only to choose which attribution to begin (`DefectEvent.person` instead of a comment's); the core re-reads the locked row and answers 409 "linked or unlinked a moment ago" when they disagree. The store has no `FOR UPDATE` of its own for a line and writes no status of its own on a linked item.
  - **Moves on a linked item:** Mark done is accept, Send back is return (the comment is its note, no work comment is written), Cancel is withdraw (the reason is the note and the item's cancel reason), staff Send for checking and the contractor's Mark as fixed are report rectified. Reopen: "This defect is closed in Close-out."; Start and any other: "This defect moves with its line in Close-out." The item's own who-may rules do not apply; the defect act's do (the S.O., or a representative whose letter covers site observation). The officer is recorded for themselves (`onBehalf: false`); recording for the S.O. is Close-out's.
  - **Linking:** the new `addCpcDefectsFromItems` (form: `id`, `itemIds` repeated, `dueOn` for items with no due day) creates and links the lines of picked open Defect items on the draft CPC; each item is locked in id order and judged on the locked row. `removeCpcDefect` clears the link first (the item keeps its status and stays a snag). Both write an audit row on the item.
  - **WB-12:** a Defect raised on a contract past practical completion makes its line first (`reportDefectLine`, `alsoSlot: "DefectItem.reportedBy"` beside the item's `raisedBy`), then the item (`defectItemId`, In progress). Posted `observedOn` and `dueOn` are required and judged by `reportDefectFaults`; a missing one is refused in its words ("Not recorded: ..."), and an actor `reportDefect` refuses is refused in the same words, with neither row written. OQ-4's field fault `DEFECT_AFTER_COMPLETION` is gone; `typeOfferable` now hides a Defect only where the DEFECTS row is shut (after practical completion's own stage).
  - **For the UI pass (not done here; the light builder owns those files):** the New item drawer and quick-add need an "Observed on" date and a "Made good by" (due) for a Defect on a contract in practical completion, posted as `observedOn` and `dueOn`; until then such a raise is refused in words. The CPC drawer needs the multi-select feed (open, unlinked Defect items of the contract) posting `addCpcDefectsFromItems`. A linked item's panel should show its line's state and offer only the moves `defectActOf` allows; the board's drag should not pre-judge them (the act answers). Step 9's linked cards are separate: they are other registers' items.
  - **Open:** an item linked to a line on a CPC that is later voided points at a line that no register reads (a voided CPC's list is not the contract's); nothing unlinks it. A void CPC's pick should be unlinked when voiding is built, or the item offered again.
- **Step 10, screen half** (heavy builder). For step 12:
  - **Built:** New item and Quick add ask "Observed on" and "Made good by" (no default) for a Defect where `defectRaisesLine(status)` (`fields.ts`; the drawer posts `madeGoodBy` as `dueOn`). Close-out's Defects card on a draft CPC has "Add from work list" (`PickDefectItemsDrawer`, fed by `pickableDefectItems`). A linked item's panel shows a "Defect line: state" badge (`lineStateOf`) and offers only `linkedPanelActions`; the Board/list drop uses `linkedDropColumns` (no who-may pre-judging). `WorkCardRow.linked` is new.
  - **Void CPC:** `voidCertificate` now unlinks the items its list picked (`unlinkPickedBy`, contract, WorkItem, DefectItem; audited on each item). They stay snags and are offered again. The voided CPC keeps its lines. Test: `defect-link.db.test.ts`.
  - **Demo:** only `prisma/demo-work.ts`'s comments changed; demo_con15 still holds six types.
- **Step 11** (the two folds, WS-5, B-19; light builder). For step 12:
  - **Portal:** `PROJECT_TABS` lost `defects`. In `supplier/projects/[id]/page.tsx`, `?tab=defects` is aliased to `tab=work`, and Work has an Items | Defects switch (`?tab=work&view=defects`), drawn once the CPC is issued; the view renders `DefectsPanel` unchanged, and the items are not loaded in it. In the Defects view the header's Ask a question / Report an incident buttons are not drawn (they come with the items). Test: `defects-fold-screen.test.ts`.
  - **Staff:** `documents` left `CASE_TABS.project`; `FOLDED_TABS` (`case-tabs.ts`) maps it to `submissions` + section `certificates`, used by `caseTabToStep` (stage-less, `section` returned) and `resolveCaseView` (`?stage=project&tab=documents`). The Documents tab draws the certificates card (`DocumentsPanel`, same facts, rows and paging, new paging addresses) below the document list; the certificate crumb points at the new address. Tests: `case-tabs.test.ts`, `case-view.test.ts`, `crumbs.test.ts`. Not done: `section=certificates` selects nothing (the section always shows; the card has `id="certificates"`); the Documents tab now also reads the certificate facts.
- **Step 12, the demo** (`prisma/demo-work.ts`; data-modeler). For the acceptance reviews:
  - **Built:** `linkingSkipped` (the 3b-ii round) writes nothing and notes why for each contract, read from the cores' own readers (`soOfficeOn`, `loadCloseout`). `checkWorkDemo` now also reads back, through the screens' readers, at least one linked card on demo_con3 (`loadLinkedCards`: its variation and certificates in progress) and a demo person whose My work (`loadMyWork`) holds items on demo_con3 and demo_con15 (demo_con3 alone where demo_con15 is not loaded).
  - **Not built, blocked (needs a decision):** the defect link cannot be shown through the cores on any demo contract. demo_con15's practical completion is written as the status would leave it: no baseline, S.O., possession or CPC, and SUPERVISION is shut once practically complete, so a Defect raise there is refused ("No S.O. is resolved for this contract yet."), and no CPC can be raised ("no baseline version is in force"). demo_con3 has an S.O. but no CPC; a draft CPC would take picks only (lines on a draft are not acted on: CPC_NOT_ISSUED), issuing one ends the only active contract, and a founder-era database has no PRACTICAL_COMPLETION form setting at all. Options: (a) thread the link into demo_con13's close-out story (`demo-closeout.ts`: raise two Defect items before the CPC, pick them with `addCpcDefectsFromItems` in place of `addCpcDefect`, the contractor marks one fixed; fresh loads only; the items end Done when stage C closes it); (b) give demo_con15 a real history through the acts (baseline, S.O., possession, CPC) in place of its written status.
  - `npm run demo:work` on a database with the 3a and 3b-i rounds prints "Nothing was written: ..." with these notes and exits 1, as it did before.
- **3b-ii review fix round** (WR-1..WR-6, 2026-10-30; no migration): the line decides on a linked item. `moveAsContractor` takes the linked branch after the stale-page check and before `moveFaults` (C1 guard `defectActOf(.., "CONTRACTOR")`); `portalAction` offers Mark as fixed from `WorkItemFacts.linkedLine` (`linkedLineOf`; the one draft rule is `onDraftCpc`), and `MARK_AS_FIXED` is wired to SEND_FOR_REVIEW in `CONTRACTOR_MOVES`. A draft CPC line is Reply only and a stale post is refused "Not yet..." (`DEFECT_ON_DRAFT_CPC`: 404 with the not-found words on the Defects tab). Linked moves tell through `tell`, keyed by the defect event; the contractor's Mark as fixed leaves out the people `rectifyWithin` returned in `told`. The return note is read from the line (`returnNoteOf`) and no work comment is written. `fieldFaults` locks title, description, location and due (`LINKED_LOCKED`); `linkItem` and `writeScheduleDue` (from `scheduleAtIssue`, linked WorkItems locked first by `lockLinkedItems`) write the line's effective due day (`effectiveDue`, shared with `overdue`). One `DEFECT_TEXT_MAX` in `closeout/defects.ts`, judged in the cores. My work filters on `WORK_OPEN_CONTRACT_STATUSES` (read from the WORK_ITEM row) and fetches To check first. Not built: C4 (To check for linked In-review defects the reader cannot accept needs a per-contract S.O. lookup) and C6 (linked cards still load every variation and matter).
